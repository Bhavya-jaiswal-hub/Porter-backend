// server.js

// Imports
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const path = require('path');

// Models
const RideRequest = require('./models/RideRequest');
const Driver = require('./models/Driver');

// Routes (existing)
const authRoutes = require('./routes/authRoutes.js');
const vehicleRoutes = require('./routes/vehicleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const otpRoutes = require('./routes/otpAuth');
const rideRequestsRoutes = require('./routes/rideRequests');

// New driver routes
const driverAuthRoutes = require('./routes/driverAuthRoutes');
const driverOnboardingRoutes = require('./routes/driverOnboardingRoutes');

// Storage bootstrap (Supabase/local)
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local'; // 'supabase' | 'local'
let ensureBucketExists = null;
if (STORAGE_PROVIDER === 'supabase') {
  ({ ensureBucketExists } = require('./services/storage/supabaseStorage'));
}

// Define app and server
const app = express();
const server = http.createServer(app);

// CORS: allow credentials for cookie-based refresh
const rawOrigins = (process.env.CLIENT_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = rawOrigins.length
  ? { origin: rawOrigins, credentials: true }
  : { origin: '*', credentials: false }; // fallback: no cookies with wildcard

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Serve local uploads if using local storage
if (STORAGE_PROVIDER === 'local') {
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsRoot));
}

// Socket.io (mirror CORS with HTTP)
const io = new Server(server, {
  cors: rawOrigins.length
    ? { origin: rawOrigins, methods: ['GET', 'POST'], credentials: true }
    : { origin: '*', methods: ['GET', 'POST'], credentials: false },
});

// Make io available in controllers
app.set('io', io);
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ---------- API routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/auth', otpRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin', adminRoutes);
app.use('/api/ride-requests', rideRequestsRoutes);

// New driver auth + onboarding
app.use('/api/driver/auth', driverAuthRoutes);
app.use('/api/driver/onboarding', driverOnboardingRoutes);

// ---------- Real-time state ----------
const SEARCH_RADIUS_KM = Number(process.env.SEARCH_RADIUS_KM || 8);

// Keyed by socket.id so multiple tabs with same driverId don't overwrite each other
let availableDrivers = {};


// Haversine (km)
function getDistance(loc1, loc2) {
  const valid = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  if (!valid(loc1) || !valid(loc2)) return Infinity;

  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lng - loc1.lng);
  const lat1 = toRad(loc1.lat);
  const lat2 = toRad(loc2.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------- Socket handler ----------
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // DRIVER REGISTERS
  socket.on('driverLocation', ({ driverId, location, vehicleType }) => {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    const type = String(vehicleType || '').trim().toLowerCase();

    if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lng) || !type) {
      console.warn('⚠️ Invalid driver registration data', { driverId, location, vehicleType });
      return;
    }

    availableDrivers[socket.id] = {
      driverId: String(driverId),
      socketId: socket.id,
      location: { lat, lng },
      vehicleType: type,
    };

    console.log(`🚗 Driver ${driverId} registered (${type}) at`, { lat, lng });
  });

  // CUSTOMER REQUESTS RIDE
  socket.on('rideRequest', async ({ bookingId }) => {
    try {
      if (!bookingId) {
        socket.emit('serverError', { message: 'bookingId is required' });
        return;
      }

      console.log(`📦 rideRequest received for bookingId: ${bookingId}`);

      const ride = await RideRequest.findOne({ bookingId })
        .populate('userId', 'name phone email')
        .lean();

      if (!ride) {
        console.log('❌ Ride not found for bookingId', bookingId);
        socket.emit('ride-unavailable', { bookingId });
        return;
      }

      const {
        pickupLocation,
        dropLocation,
        fareEstimate,
        vehicleType: rawType,
        userId,
      } = ride;

      const type = String(rawType || '').trim().toLowerCase();

      const nearbyEntries = Object.entries(availableDrivers).filter(([, drv]) => {
        const distance = getDistance(
          { lat: Number(pickupLocation?.lat), lng: Number(pickupLocation?.lng) },
          drv.location
        );
        return Number.isFinite(distance) && distance <= SEARCH_RADIUS_KM && drv.vehicleType === type;
      });

      if (nearbyEntries.length === 0) {
        console.log('🚫 No drivers available within radius/type for', bookingId);
        socket.emit('ride-unavailable', { bookingId });
        return;
      }

      nearbyEntries.forEach(([, drv]) => {
        io.to(drv.socketId).emit('new-ride-request', {
          bookingId,
          pickupLocation,
          dropLocation,
          fareEstimate,
          vehicleType: type,
          userId: userId?._id || null,
          customerName: userId?.name || 'Guest',
          customerPhone: userId?.phone || '',
        });
      });

      socket.bookingId = bookingId;
      socket.rideInProgress = true;
    } catch (err) {
      console.error('❌ Error handling rideRequest:', err);
      socket.emit('serverError', { message: 'Could not process ride request' });
    }
  });

  // DRIVER ACCEPTS RIDE
  socket.on('acceptRide', async ({ driverId, bookingId }) => {
    try {
      if (!bookingId) {
        return socket.emit('serverError', { message: 'bookingId is required' });
      }

      const ride = await RideRequest.findOne({ bookingId });
      if (!ride) {
        console.warn(`⚠️ Ride ${bookingId} not found on accept`);
        return socket.emit('serverError', { message: 'Ride not found' });
      }

      const acceptingEntry =
        availableDrivers[socket.id] ||
        Object.values(availableDrivers).find((d) => d.driverId === driverId);

      const acceptedDriverId = driverId || acceptingEntry?.driverId || null;

      ride.status = 'accepted';
      ride.driverId = acceptedDriverId;
      await ride.save();

      let driver = null;
      if (acceptedDriverId) {
        try {
          driver = await Driver.findById(acceptedDriverId).lean();
        } catch {}
      }

      console.log(`✅ Driver ${acceptedDriverId || 'Unknown'} accepted ride ${bookingId}`);

      io.emit('ride-confirmed', {
        bookingId,
        driverId: acceptedDriverId,
        driverName: driver?.name || 'Driver',
        driverPhone: driver?.phone || 'N/A',
      });

      Object.entries(availableDrivers).forEach(([sid, drv]) => {
        if (sid !== socket.id) {
          io.to(drv.socketId).emit('rideAlreadyTaken', { bookingId });
        }
      });

      if (availableDrivers[socket.id]) {
        delete availableDrivers[socket.id];
      } else if (acceptedDriverId) {
        for (const [sid, drv] of Object.entries(availableDrivers)) {
          if (drv.driverId === acceptedDriverId) delete availableDrivers[sid];
        }
      }
    } catch (error) {
      console.error('❌ Error in acceptRide:', error);
      socket.emit('serverError', { message: 'Could not process ride acceptance' });
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
    if (availableDrivers[socket.id]) {
      const { driverId } = availableDrivers[socket.id];
      delete availableDrivers[socket.id];
      console.log(`🗑️ Removed driver (socket) ${driverId || socket.id} from available list`);
    }
  });
});

// MongoDB and Server Start
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('DB connected');

    // Ensure Supabase bucket exists (if using Supabase)
    if (STORAGE_PROVIDER === 'supabase' && typeof ensureBucketExists === 'function') {
      try {
        const preferSigned = String(process.env.SUPABASE_PREFER_SIGNED || 'true') === 'true';
        await ensureBucketExists({ public: !preferSigned });
        console.log('Supabase storage bucket is ready');
      } catch (e) {
        console.error('Failed to ensure Supabase bucket:', e.message || e);
      }
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
        process.exit(1);
      } else {
        throw err;
      }
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));

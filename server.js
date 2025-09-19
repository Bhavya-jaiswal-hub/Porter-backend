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
const adminOnboardingRoutes = require('./routes/adminOnboardingRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const rideLifecycleRoutes = require('./routes/rideLifecycleRoutes');

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

// Resolve uploads root once (used only for local storage)
const uploadsRoot = path.join(process.cwd(), 'uploads');

// CORS: allow credentials for cookie-based refresh when explicit origins are provided
const rawOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = rawOrigins.length
  ? { origin: rawOrigins, credentials: true }
  : { origin: '*', credentials: false }; // fallback: wildcard (no cookies)

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Serve local uploads only when STORAGE_PROVIDER === 'local'
if (STORAGE_PROVIDER === 'local') {
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

// REGISTER SOCKET HANDLERS
require('./socketHandlers/rideRequests')(io);

// ---------- API routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/auth', otpRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin', adminRoutes);
app.use('/api/ride-requests', rideRequestsRoutes);
app.use('/api/admin', adminOnboardingRoutes);
app.use('/api/admin/auth', adminAuthRoutes);

// New driver auth + onboarding
app.use('/api/driver/auth', driverAuthRoutes);
app.use('/api/driver/onboarding', driverOnboardingRoutes);
app.use('/api/ride-requests', rideLifecycleRoutes);
// Health check (optional)
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));



// MongoDB and Server Start
const PORT = process.env.PORT || 8080;

if (!process.env.MONGO_URI) {
  console.error('Missing MONGO_URI in environment.');
  process.exit(1);
}

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

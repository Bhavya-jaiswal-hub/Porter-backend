// Imports
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios'); // For calling your GET API from socket event

// Models
const RideRequest = require('./models/RideRequest');
const Driver = require('./models/Driver');
const User = require('./models/User');

// Routes
const router = require('./routes/authRoutes.js');
const vehicleRoutes = require('./routes/vehicleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const otpRoutes = require("./routes/otpAuth");
const rideRequestsRoutes = require('./routes/rideRequests');

// Define app and server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use('/api/auth', router);
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin', adminRoutes);
app.use("/api/auth", otpRoutes);
app.use('/api/ride-requests', rideRequestsRoutes);

// In-memory store for available drivers
let availableDrivers = {};

// SOCKET HANDLER
function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    /**
     * DRIVER REGISTERS LOCATION & VEHICLE
     */
    socket.on('driverLocation', ({ driverId, location, vehicleType }) => {
      if (!driverId || !location || !vehicleType) {
        console.warn('⚠️ Invalid driver registration data', { driverId, location, vehicleType });
        return;
      }

      availableDrivers[driverId] = {
        socketId: socket.id,
        location,
        vehicleType,
      };

      console.log(`🚗 Driver ${driverId} registered (${vehicleType}) at`, location);
      console.log('Current available drivers:', availableDrivers);
    });

    /**
     * CUSTOMER REQUESTS RIDE (fetch details from GET API)
     */
    socket.on('rideRequest', async ({ bookingId }) => {
      try {
        console.log(`📦 Ride request received for booking ID: ${bookingId}`);

        // 1️⃣ Call GET API to get ride details
        const apiUrl = `${process.env.BASE_URL || 'http://localhost:8080'}/api/ride-requests/${bookingId}`;
        const { data: ride } = await axios.get(apiUrl);

        console.log('Ride details fetched:', ride);

        if (!ride || !ride.ride) {
          console.log('❌ Ride not found in database');
          socket.emit('rideNotFound', { bookingId });
          return;
        }

        // Destructure from ride.ride
        const { pickupLocation, dropLocation, fareEstimate, vehicleType, userId } = ride.ride;

        console.log('Available drivers:', availableDrivers);
        console.log('Pickup location:', pickupLocation);
        console.log('Ride vehicleType:', vehicleType);

        console.log(`📍 Looking for ${vehicleType} drivers within 3 km of pickup...`);

        // 2️⃣ Find matching nearby drivers
       const nearbyDrivers = Object.entries(availableDrivers).filter(
  ([id, driver]) => {
    const distance = getDistance(pickupLocation, driver.location);
    return (
      distance <= 3 &&
      driver.vehicleType.toLowerCase() === vehicleType.toLowerCase()
    );
  }
);


        if (nearbyDrivers.length === 0) {
          console.log('🚫 No drivers available for this request');
          socket.emit('noDriversAvailable', { bookingId });
          return;
        }

        // 3️⃣ Send ride details to each matching driver
        nearbyDrivers.forEach(([driverId, driver]) => {
          io.to(driver.socketId).emit('newRideRequest', {
            bookingId,
            pickupLocation,
            dropLocation,
            fareEstimate,
            vehicleType,
            userId: userId?._id || null,
            customerName: userId?.name || 'Guest',
            customerPhone: userId?.phone || '',
          });
        });

        // Store ride state for this customer socket
        socket.bookingId = bookingId;
        socket.rideInProgress = true;

      } catch (err) {
        console.error('❌ Error handling rideRequest:', err.message);
        socket.emit('serverError', { message: 'Could not process ride request' });
      }
    });

    /**
     * DRIVER ACCEPTS RIDE
     */
  socket.on('acceptRide', async ({ driverId, bookingId }) => {
  try {
    console.log("Incoming bookingId:", bookingId);

    // Find ride by bookingId (custom field)
    const ride = await RideRequest.findOne({ bookingId });
    console.log("Ride found in DB:", ride);

    if (!ride) {
      console.warn(`⚠ Ride with bookingId ${bookingId} not found in DB`);
      return socket.emit('serverError', { message: 'Ride not found' });
    }

    console.log(`✅ Driver ${driverId || 'Unknown'} accepted ride ${bookingId}`);

    // ✅ Update status and driverId (string allowed now)
    ride.status = 'accepted';
    ride.driverId = driverId || null;
    await ride.save();

    // Try to fetch driver details if using real DB ID
    let driver = null;
    if (driverId && driverId !== 'DRIVER123') {
      driver = await Driver.findOne({ _id: driverId });
    }

    // Notify the customer
    io.emit('rideAccepted', {
      bookingId,
      driverId: driverId || null,
      name: driver?.name || 'Driver',
      phone: driver?.phone || 'N/A',
    });

    // Notify other drivers
    Object.entries(availableDrivers).forEach(([id, drv]) => {
      if (id !== driverId) {
        io.to(drv.socketId).emit('rideAlreadyTaken', { bookingId });
      }
    });

    // Remove this driver from available list
    if (driverId) {
      delete availableDrivers[driverId];
    }

  } catch (error) {
    console.error('❌ Error in acceptRide:', error);
    socket.emit('serverError', { message: 'Could not process ride acceptance' });
  }
});




    /**
     * HANDLE DISCONNECT
     */
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);

      for (const [driverId, driver] of Object.entries(availableDrivers)) {
        if (driver.socketId === socket.id) {
          delete availableDrivers[driverId];
          console.log(`🗑️ Removed driver ${driverId} from available list`);
          break;
        }
      }
    });
  });
}

// Helper: Haversine formula
function getDistance(loc1, loc2) {
  const toRad = (val) => (val * Math.PI) / 180;
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

// MongoDB and Server Start
const PORT = process.env.PORT || 8080;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('DB connected');

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

    socketHandler(io);
  })
  .catch((err) => console.error('MongoDB connection error:', err));

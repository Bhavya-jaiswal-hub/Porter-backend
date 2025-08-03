// Imports
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');

// Routes
const router = require('./routes/authRoutes.js');
const vehicleRoutes = require('./routes/vehicleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const otpRoutes = require("./routes/otpAuth");

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

// In-memory store for available drivers
let availableDrivers = {};

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Receive driver's location and store
  socket.on('driverLocation', ({ driverId, location }) => {
    availableDrivers[driverId] = { socketId: socket.id, location };
  });

  // Receive ride request from customer
  socket.on('rideRequest', ({ bookingId, pickupLocation }) => {
    const nearbyDrivers = Object.entries(availableDrivers).filter(([id, driver]) => {
      const distance = getDistance(pickupLocation, driver.location);
      return distance <= 3;
    });

    if (nearbyDrivers.length === 0) {
      socket.emit('noDriversAvailable');
      return;
    }

    // Notify nearby drivers
    nearbyDrivers.forEach(([driverId, driver]) => {
      io.to(driver.socketId).emit('newRideRequest', { bookingId, pickupLocation });
    });

    // Store temporary data on socket
    socket.bookingId = bookingId;
    socket.rideInProgress = true;
  });

  // Driver accepts the ride
  socket.on('acceptRide', ({ driverId, bookingId }) => {
    // Notify customer
    io.emit('rideAccepted', { bookingId, driverId });

    // Inform other drivers
    Object.entries(availableDrivers).forEach(([id, driver]) => {
      if (id !== driverId) {
        io.to(driver.socketId).emit('rideAlreadyTaken', { bookingId });
      }
    });

    // Remove accepted driver from available pool
    delete availableDrivers[driverId];
  });

  // Simulated status tracking (for demo/testing)
  socket.on('startTracking', ({ bookingId }) => {
    let status = 'enroute';
    const interval = setInterval(() => {
      if (status === 'enroute') status = 'arrived';
      else if (status === 'arrived') status = 'delivered';
      else {
        clearInterval(interval);
        return;
      }
      socket.emit('statusUpdate', { bookingId, status });
    }, 5000);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Optional: Remove driver from availableDrivers if needed
    for (const [driverId, driver] of Object.entries(availableDrivers)) {
      if (driver.socketId === socket.id) {
        delete availableDrivers[driverId];
        break;
      }
    }
  });
});

// Helper: Haversine formula to calculate distance in KM
function getDistance(loc1, loc2) {
  const toRad = (val) => (val * Math.PI) / 180;
  const R = 6371; // Radius of Earth in km
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
    console.log("DB connected");

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Kill the running process or use another port.`);
        process.exit(1);
      } else {
        throw err;
      }
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => console.error("MongoDB connection error:", err));

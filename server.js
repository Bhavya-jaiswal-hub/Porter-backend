//imports
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require("path");



// const sds = require('./curr');
const router = require('./routes/authRoutes.js')
const vehicleRoutes = require('./routes/vehicleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');

//define app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});


//middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


//routes
app.use('/',router);
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin', adminRoutes);



// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('startTracking', ({ bookingId }) => {
    // Simulate real-time updates every 5 sec
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});



//connections
const PORT = process.env.PORT || 8080;

mongoose.connect(process.env.MONGO_URI)
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

//imports
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// const sds = require('./curr');
const path = require("path");
const router = require('./routes/authRoutes.js')
const vehicleRoutes = require('./routes/vehicleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
//define app
const app = express();

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



//connections
const PORT = process.env.PORT || 8080;

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("DB connected");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch((err) => console.error("MongoDB connection error:", err));

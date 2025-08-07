const express = require('express');
const router = express.Router();
const RideRequest = require('../models/RideRequest');

// POST /bookings/create
router.post('/create', async (req, res) => {
  try {
    const {
      vehicleType,
      pickupLocation,
      dropLocation,
      userId,
      fareEstimate,
    } = req.body;

    const newRide = new Ride({
      vehicleType,
      pickupLocation,
      dropLocation,
      userId,
      fareEstimate,
      status: 'searching',
    });

    const savedRide = await newRide.save();

    res.status(201).json({ success: true, ride: savedRide });

    // 🔥 Emit ride request to drivers via Socket.IO
    const io = req.app.get('io'); // see next step to inject `io`
    io.emit('rideRequest', {
      bookingId: savedRide._id,
      pickupLocation,
      vehicleType,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;

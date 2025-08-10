// routes/rideRequests.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const RideRequest = require('../models/RideRequest');

// 🔍 GET /api/ride-requests
router.get('/', async (req, res) => {
  try {
    console.log("GET /api/ride-requests called");
    const { driverId } = req.query;

    const query = {};
    if (driverId) {
      console.log("Filtering by driverId:", driverId);
      query.driverId = driverId;
    }

    const rideRequests = await RideRequest.find(query)
      .sort({ createdAt: -1 }) // latest first
      .populate('userId', 'name email')
      .populate('driverId', 'name email');

    console.log("Fetched rideRequests:", rideRequests);
    res.status(200).json(rideRequests);
  } catch (error) {
    console.error('❌ Error fetching ride requests:', error);
    res.status(500).json({ error: 'Failed to fetch ride requests' });
  }
});

// ✅ GET /api/ride-requests/test
router.get('/test', (req, res) => {
  res.send("Ride request route is working");
});

// 🚚 POST /api/ride-requests
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      vehicleType
    } = req.body;

    // Validate vehicle type
    if (!vehicleType) {
      return res.status(400).json({ error: 'Vehicle type is required' });
    }

    // Validate location addresses
    if (!pickupLocation?.address || !dropLocation?.address) {
      return res.status(400).json({ error: 'Pickup and drop addresses are required' });
    }

    // ✅ Handle "guest" userId
    let validUserId = null;
    if (userId === 'guest') {
      validUserId = null;
    } else if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      validUserId = userId;
    } else if (userId) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    // ✅ Auto-generate bookingId
    const generatedBookingId = `RID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ✅ Create ride request
    const ride = new RideRequest({
      userId: validUserId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId: generatedBookingId, // must exist in schema
      vehicleType,
      driverId: null,
    });

    await ride.save();

    // ✅ Send bookingId at top level
    res.status(201).json({
      message: 'Ride request created',
      bookingId: generatedBookingId,
      ride
    });

  } catch (error) {
    console.error('❌ Error creating ride request:', error);
    res.status(500).json({ error: 'Failed to create ride request' });
  }
});


// ✅ Get ride details by bookingId
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    const ride = await RideRequest.findOne({ bookingId });

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    res.status(200).json({ ride });
  } catch (error) {
    console.error('❌ Error fetching ride details:', error);
    res.status(500).json({ error: 'Failed to fetch ride details' });
  }
});



module.exports = router;

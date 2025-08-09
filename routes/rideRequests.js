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
// 🚚 POST /api/ride-requests
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId,
      vehicleType
    } = req.body;

    if (!vehicleType) {
      return res.status(400).json({ error: 'Vehicle type is required' });
    }

    // ✅ Updated userId validation to allow "guest"
    let validUserId = null;
    if (userId === 'guest') {
      validUserId = null; // treat as anonymous
    } else if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      validUserId = userId;
    } else if (userId) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    const ride = new RideRequest({
      userId: validUserId, // optional and validated
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId,
      vehicleType,
      driverId: null,
    });

    await ride.save();

    res.status(201).json({ message: 'Ride request created', ride });
  } catch (error) {
    console.error('❌ Error creating ride request:', error);
    res.status(500).json({ error: 'Failed to create ride request' });
  }
});

module.exports = router;

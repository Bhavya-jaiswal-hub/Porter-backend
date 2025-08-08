// routes/rideRequests.js
const express = require('express');
const router = express.Router();
const RideRequest = require('../models/RideRequest');

// GET /api/ride-requests
// Optionally filter by driverId
router.get('/', async (req, res) => {
  try {
    console.log("GET /api/ride-requests called");
    const { driverId } = req.query;

    let query = {};
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
    console.error('❌ Error fetching ride requests:', error);  // <== this is the most important
    res.status(500).json({ error: 'Failed to fetch ride requests' });
  }
});


router.get('/test', (req, res) => {
  res.send("Ride request route is working");
});

// POST /api/ride-requests

router.post('/', async (req, res) => {
  try {
    const {
      userId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId,
      vehicleType // <-- add this
    } = req.body;

    if (!vehicleType) {
      return res.status(400).json({ error: 'Vehicle type is required' });
    }

    const ride = new RideRequest({
      userId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId,
      vehicleType, // <-- save it
      driverId: null, // no driver yet
    });

    await ride.save();

    res.status(201).json({ message: 'Ride request created', ride });
  } catch (error) {
    console.error('Error creating ride request:', error);
    res.status(500).json({ error: 'Failed to create ride request' });
  }
});



module.exports = router;

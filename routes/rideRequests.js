const express = require('express');
const router = express.Router();
const RideRequest = require('../models/RideRequest');
const authenticateToken = require('../middlewares/authMiddleware');

// 🔍 GET all ride requests
router.get('/', async (req, res) => {
  try {
    const { driverId } = req.query;
    const query = driverId ? { driverId } : {};

    const rideRequests = await RideRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone')
      .populate('driverId', 'name email phone');

    res.status(200).json(rideRequests);
  } catch (error) {
    console.error('❌ Error fetching ride requests:', error);
    res.status(500).json({ error: 'Failed to fetch ride requests' });
  }
});

// ✅ Test route
router.get('/test', (req, res) => {
  res.send("Ride request route is working");
});

// 🚚 POST create a ride request (Authenticated users only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      pickupLocation,
      dropLocation,
      fareEstimate,
      vehicleType
    } = req.body;

    // Validation
    if (!vehicleType) {
      return res.status(400).json({ error: 'Vehicle type is required' });
    }
    if (!pickupLocation?.address || !dropLocation?.address) {
      return res.status(400).json({ error: 'Pickup and drop addresses are required' });
    }

    const validUserId = req.user?._id || req.user?.id;
    if (!validUserId) {
      return res.status(401).json({ error: 'User authentication failed' });
    }

    const generatedBookingId = `RID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const ride = new RideRequest({
      userId: validUserId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId: generatedBookingId,
      vehicleType,
      driverId: null,
    });

    await ride.save();

    // 🚫 Removed raw Socket.IO broadcast (handled via client emit + filtered server emit)

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

// ✅ GET ride details by bookingId
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    const ride = await RideRequest.findOne({ bookingId })
      .populate('userId', 'name email phone');

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

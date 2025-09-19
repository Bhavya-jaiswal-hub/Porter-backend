const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');

const {
  getAllRideRequests,
  testRoute,
  createRideRequest,
  getRideByBookingId,
  getNearbyPendingRides
} = require('../controllers/rideRequestController');

// 🔍 GET all ride requests (optional filter by driverId)
router.get('/', getAllRideRequests);

// ✅ Test route
router.get('/test', testRoute);

// 🚚 POST create a ride request (Authenticated users only)
router.post('/', authenticateToken(), createRideRequest);

// ✅ GET pending rides (must be before :bookingId)
router.get('/rides', authenticateToken(), getNearbyPendingRides);

// ✅ GET ride details by bookingId
router.get('/:bookingId', getRideByBookingId);

module.exports = router;

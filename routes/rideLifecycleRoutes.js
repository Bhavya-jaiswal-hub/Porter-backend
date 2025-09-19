const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');

// Import the API controller functions
const {
  acceptRideAPI,
  pickupCompleteAPI, // ✅ new
  startRideAPI,
  completeRideAPI
} = require('../controllers/rideLifecycleController');

// Accept ride
router.post('/:bookingId/accept', authenticateToken(), acceptRideAPI);

// Pickup complete
router.post('/:bookingId/pickup-complete', authenticateToken(), pickupCompleteAPI);

// Start ride
router.post('/:bookingId/start', authenticateToken(), startRideAPI);

// Complete ride
router.post('/:bookingId/complete', authenticateToken(), completeRideAPI);

module.exports = router;

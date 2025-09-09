// routes/driverAuthRoutes.js
const express = require('express');
const router = express.Router();

// Destructure all controller functions you need
const {
  register,
  login,
  refresh,
  sendOtp,
  verifyOtp,
  me,
  logout
} = require('../controllers/driverAuthController');

// Auth routes (no auth required)
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Authenticated driver routes
const auth = require('../middlewares/authMiddleware');
router.get('/me', auth(['driver']), me);
router.post('/logout', auth(['driver']), logout);

module.exports = router;

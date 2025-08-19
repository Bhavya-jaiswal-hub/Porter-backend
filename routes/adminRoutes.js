// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const authenticateToken = require('../middlewares/authMiddleware');
const adminOnly = require('../middlewares/adminMiddleware');

// All admin routes are protected by token + role check
router.use(authenticateToken, adminOnly);

/**
 * @desc   Get all bookings (admin only)
 * @route  GET /api/admin/bookings
 */
router.get('/bookings', adminController.getAllBookings);

/**
 * @desc   Get analytics data (admin only)
 * @route  GET /api/admin/analytics
 */
router.get('/analytics', adminController.getAnalytics);

module.exports = router;

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middlewares/authMiddleware');
const adminOnly = require('../middlewares/adminMiddleware'); // ✅ Add this line


router.get('/bookings', authenticateToken, adminOnly, adminController.getAllBookings);
router.get('/analytics', authenticateToken, adminOnly, adminController.getAnalytics);


module.exports = router;

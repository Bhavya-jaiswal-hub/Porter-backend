const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/', authenticateToken, bookingController.createBooking);
router.get('/history', authenticateToken, bookingController.getBookingHistory);
router.put('/:id/status', authenticateToken, bookingController.updateBookingStatus);


module.exports = router;

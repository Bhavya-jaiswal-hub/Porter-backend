const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/pay', authenticateToken, paymentController.simulatePayment);

module.exports = router;

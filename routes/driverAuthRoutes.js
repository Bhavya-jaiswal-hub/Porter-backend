// routes/driverAuthRoutes.js
const express = require('express');
const router = express.Router();
const driverAuthController = require('../controllers/driverAuthController');

// Auth routes (no auth required)
router.post('/register', driverAuthController.register);
router.post('/login', driverAuthController.login);
router.post('/refresh', driverAuthController.refresh);

// Authenticated driver routes
const auth = require('../middlewares/authMiddleware');
router.get('/me', auth(['driver']), driverAuthController.me);
router.post('/logout', auth(['driver']), driverAuthController.logout);

module.exports = router;

const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminOnboardingController');
const requireRole = require('../middlewares/authMiddleware'); // should check for ['admin']

// List all submissions under review
router.get('/onboarding', requireRole(['admin']), adminCtrl.listSubmissions);

// Approve
router.post('/onboarding/:driverId/approve', requireRole(['admin']), adminCtrl.approveApplication);

// Reject
router.post('/onboarding/:driverId/reject', requireRole(['admin']), adminCtrl.rejectApplication);

module.exports = router;

const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminOnboardingController');
const requireRole = require('../middlewares/authMiddleware'); // should check for ['admin']

// List all submissions under review
router.get(
  '/onboarding',
  requireRole(['admin']),
  adminCtrl.listSubmissions
);

// ✅ NEW: Get full application details for one driver
router.get(
  '/onboarding/:driverId',
  requireRole(['admin']),
  adminCtrl.getDriverApplication
);

// Approve driver onboarding
router.post(
  '/onboarding/:driverId/approve',
  requireRole(['admin']),
  adminCtrl.approveApplication
);

// Reject driver onboarding
router.post(
  '/onboarding/:driverId/reject',
  requireRole(['admin']),
  adminCtrl.rejectApplication
);

module.exports = router;

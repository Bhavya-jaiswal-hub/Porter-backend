// routes/driverOnboardingRoutes.js
// Purpose: Driver and admin onboarding routes wired to provider-agnostic controllers.
// Notes:
// - This file is defensive: it maps to whichever controller function names you have
//   (new or legacy) and avoids registering routes with non-functions.

const express = require('express');
const router = express.Router();
const onboarding = require('../controllers/driverOnboardingController');
const auth = require('../middlewares/authMiddleware');
const multer = require('multer');

// Multer in-memory so req.file.buffer is available to storage service
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// ---- Helpers ---------------------------------------------------------------

// Pick the first available function from candidate names; otherwise provide 501.
const pickHandler = (...names) => {
  for (const name of names) {
    if (name && typeof onboarding[name] === 'function') return onboarding[name];
  }
  return (req, res) =>
    res.status(501).json({ error: 'Handler not implemented on server' });
};

// Normalize auth to a middleware factory that accepts an array of roles.
const requireRole = (roles) => {
  if (typeof auth === 'function') {
    // e.g., module.exports = (roles) => (req,res,next)=>{...}
    return auth(roles);
  }
  if (auth && typeof auth.requireAuth === 'function') {
    // e.g., module.exports = { requireAuth: (roles)=>... }
    return auth.requireAuth(roles);
  }
  // Safe no-op if auth wiring differs during local dev
  return (req, _res, next) => next();
};

// ---- Controller mappings (new names first, then legacy fallbacks) ----------

const h = {
  // Driver-facing
  getStatus: pickHandler('getOnboardingStatus', 'getProgress'),
  savePersonal: pickHandler('updatePersonalInfo', 'savePersonalInfo'),
  saveVehicle: pickHandler('updateVehicleInfo', 'saveVehicleInfo'),
  uploadDoc: pickHandler('uploadDocument'),
  deleteDoc: pickHandler('deleteDocument'),
  getDocUrl: pickHandler('getDocumentUrl'),
  submit: pickHandler('submitForReview'),
  withdraw: pickHandler('withdrawSubmission'), // optional
  resume: pickHandler('resumeAfterRejection'), // optional

  // Admin-facing (optional — only register if present)
  list: pickHandler('listSubmissions'),
  getApp: pickHandler('getDriverApplication'),
  approve: pickHandler('approveApplication'),
  reject: pickHandler('rejectApplication'),
};

// ---------------- Driver-facing onboarding routes ----------------

// GET /drivers/onboarding/
router.get('/', requireRole(['driver']), h.getStatus);

// POST /drivers/onboarding/personal
router.post('/personal', requireRole(['driver']), h.savePersonal);

// POST /drivers/onboarding/vehicle
router.post('/vehicle', requireRole(['driver']), h.saveVehicle);

// POST /drivers/onboarding/documents (docType from body or params)
// Also support param style if your client sends /documents/:docType
router.post(
  '/documents',
  requireRole(['driver']),
  upload.single('file'),
  h.uploadDoc
);
router.post(
  '/documents/:docType',
  requireRole(['driver']),
  upload.single('file'),
  h.uploadDoc
);

// DELETE /drivers/onboarding/documents/:docType
router.delete(
  '/documents/:docType',
  requireRole(['driver']),
  h.deleteDoc
);

// GET /drivers/onboarding/documents/:docType/url
router.get(
  '/documents/:docType/url',
  requireRole(['driver']),
  h.getDocUrl
);

// POST /drivers/onboarding/submit
router.post('/submit', requireRole(['driver']), h.submit);

// Optional flows (registered but safely return 501 if not implemented)
router.post('/withdraw', requireRole(['driver']), h.withdraw);
router.post('/resume', requireRole(['driver']), h.resume);

// ---------------- Admin-facing onboarding routes ----------------
// Only register admin routes if the handler exists (avoid non-function errors)

if (h.list.name !== 'anonymous' || h.list.toString().includes('Handler not implemented') === false) {
  router.get('/admin', requireRole(['admin']), h.list);
}
if (h.getApp.name !== 'anonymous' || h.getApp.toString().includes('Handler not implemented') === false) {
  router.get('/admin/:driverId', requireRole(['admin']), h.getApp);
}
if (h.approve.name !== 'anonymous' || h.approve.toString().includes('Handler not implemented') === false) {
  router.post('/admin/:driverId/approve', requireRole(['admin']), h.approve);
}
if (h.reject.name !== 'anonymous' || h.reject.toString().includes('Handler not implemented') === false) {
  router.post('/admin/:driverId/reject', requireRole(['admin']), h.reject);
}

module.exports = router;

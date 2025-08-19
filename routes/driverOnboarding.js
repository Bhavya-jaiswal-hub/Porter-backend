// routes/driverOnboarding.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const authenticateToken = require('../middlewares/authMiddleware');
const Driver = require('../models/Driver');

// --- Config aligned with your schema ---
const REQUIRED_DOC_TYPES = ['license', 'rc', 'id']; // keep in sync with schema enum
const ALLOWED_DOC_TYPES = new Set(REQUIRED_DOC_TYPES);

// --- Multer (local dev) ---
// In prod (Supabase/S3), replace storage with your uploader and set fileUrl accordingly.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'driverDocs', String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `file-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const ok = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ].includes(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'));
  },
});

// --- Helpers for array-based docs ---
function indexByType(docs = []) {
  const map = Object.create(null);
  for (const d of docs) {
    if (d?.type && !(d.type in map)) map[d.type] = d;
  }
  return map;
}

function computeMissingTypes(docs = []) {
  const present = new Set(docs.map((d) => d.type));
  return REQUIRED_DOC_TYPES.filter((t) => !present.has(t));
}

function areAllApproved(docs = []) {
  const byType = indexByType(docs);
  return REQUIRED_DOC_TYPES.every((t) => byType[t]?.status === 'approved');
}

function upsertDocument(docs, payload) {
  const idx = docs.findIndex((d) => d.type === payload.type);
  if (idx >= 0) docs[idx] = { ...docs[idx].toObject?.() ?? docs[idx], ...payload };
  else docs.push(payload);
}

// --- Routes ---

// GET /api/driver/onboarding/status
router.get('/status', authenticateToken(['driver']), async (req, res) => {
  try {
    const driver = await Driver.findById(req.user.id).lean();
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const docs = driver.documents || [];
    const missing = computeMissingTypes(docs);

    return res.status(200).json({
      documents: docs, // as stored in schema (array)
      missingTypes: missing,
      isAllApproved: areAllApproved(docs),
      onboarding: driver.onboarding || { status: 'pending', updatedAt: new Date() },
    });
  } catch (err) {
    console.error('Error fetching onboarding status:', err);
    return res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

// POST /api/driver/onboarding/documents  (multipart/form-data)
// fields: type (required), file (required), notes? (optional)
router.post(
  '/documents',
  authenticateToken(['driver']),
  upload.single('file'),
  async (req, res) => {
    try {
      const { type, notes } = req.body;

      if (!type || !ALLOWED_DOC_TYPES.has(type)) {
        return res.status(400).json({ error: 'Invalid or missing type' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }

      const driver = await Driver.findById(req.user.id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const fileUrl = `/uploads/driverDocs/${req.user.id}/${req.file.filename}`;

      if (!Array.isArray(driver.documents)) driver.documents = [];

      // Insert or update this doc
      upsertDocument(driver.documents, {
        type,
        url: fileUrl,
        status: 'submitted',
        notes: notes || '',
        uploadedAt: new Date(),
      });

      // ---- NEW: dynamic status update ----
      const missingTypes = computeMissingTypes(driver.documents);
      if (missingTypes.length === 0) {
        // All docs uploaded — now check approval state if needed
        driver.onboarding = {
          status: areAllApproved(driver.documents)
            ? 'approved'
            : 'ready_for_review',
          updatedAt: new Date(),
        };
      } else {
        driver.onboarding = {
          status: 'in_progress',
          updatedAt: new Date(),
        };
      }

      await driver.save();

      return res.status(200).json({
        ok: true,
        document: indexByType(driver.documents)[type],
        documents: driver.documents,
        missingTypes,
        onboarding: driver.onboarding,
      });
    } catch (err) {
      console.error('Error uploading document:', err);
      const msg =
        err?.message === 'Unsupported file type'
          ? 'Unsupported file type (only images or PDF)'
          : err?.message || 'Failed to upload document';
      return res.status(500).json({ error: msg });
    }
  }
);


module.exports = router;

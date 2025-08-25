// controllers/driverOnboardingController.js
// Purpose: Manage driver onboarding data, document uploads, and admin review flow.
// Socket: Expects server.js to set `app.set('io', io)` so we can emit events via req.app.get('io').

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const Driver = require('../models/Driver');

// Provider-agnostic storage facade (auto-selects local or Supabase via STORAGE_PROVIDER)
const storage = require('../services/storage');

// Non-provider-specific config
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024); // 8MB default
const ALLOWED_DOC_TYPES = ['aadhar', 'pan', 'dl', 'rc', 'photo'];


// ---------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------
// ---------------------------------------------------------
// Onboarding: required docs & shape helpers
// ---------------------------------------------------------

/**
 * Return the list of required document types for a given vehicle.
 * @param {string} vehicleType
 * @returns {string[]}
 */
function requiredDocsFor(vehicleType) {
  const vt = String(vehicleType || '').trim().toLowerCase();
  const base = ['aadhar', 'pan', 'dl']; // always required
  if (['truck', 'commercial'].includes(vt)) return [...base, 'rc'];
  return base;
}

/**
 * Ensure the driver object has a complete onboarding structure
 * with sensible defaults for all subfields.
 * @param {object} driver - Mongoose document or plain object
 * @returns {object} driver - Mutated driver with full onboarding shape
 */
function ensureOnboardingShape(driver) {
  driver.onboarding = driver.onboarding || {};
  const ob = driver.onboarding;

  ob.status = ob.status || 'pending'; // pending | in_progress | under_review | approved | rejected
  ob.personal = ob.personal || {
    name: driver.name || '',
    phone: driver.phone || '',
    completed: false,
  };
  ob.vehicle = ob.vehicle || {
    type: driver.vehicleType || '',
    number: '',
    completed: false,
  };
  ob.documents = ob.documents || {
    aadhar: null,
    pan: null,
    dl: null,
    rc: null,
    photo: null,
  };

  return driver;
}


/**
 * Determine which docs or sections are missing to allow final submission.
 * @param {object} driver
 * @returns {object} Status summary
 */
function computeMissing(driver) {
  const reqDocs = requiredDocsFor(driver.onboarding?.vehicle?.type || driver.vehicleType || '');
  const docs = driver.onboarding?.documents || {};
const missing = reqDocs.filter((key) => {
  const entry = docs[key];
  return !entry || (!entry.url && !entry.storageKey);
});


  const personalMissing =
    !driver.onboarding?.personal?.completed ||
    !driver.onboarding.personal.name ||
    !driver.onboarding.personal.phone;

  const vehicleMissing =
    !driver.onboarding?.vehicle?.completed ||
    !driver.onboarding.vehicle.type ||
    !driver.onboarding.vehicle.number;

  return {
    missingDocs: missing,               // array of doc keys still needed
    personalMissing,                     // boolean
    vehicleMissing,                       // boolean
    readyToSubmit: missing.length === 0 && !personalMissing && !vehicleMissing,
  };
}


// ---------------------------------------------------------
// Event emitter helper
// ---------------------------------------------------------
function ioEmit(req, room, event, payload) {
  try {
    const io = req.app?.get?.('io');
    if (io) io.to(String(room)).emit(event, payload);
  } catch (_) {
    // Silently ignore emitter errors
  }
}

// ---------------------------------------------------------
// Utility: sanitize file names
// ---------------------------------------------------------
function sanitizeFileName(original) {
  const base = path.basename(original).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  const ts = Date.now();
  const [name, ext] = base.includes('.')
    ? [base.slice(0, base.lastIndexOf('.')), base.slice(base.lastIndexOf('.'))]
    : [base, ''];
  return `${name}_${ts}${ext}`;
}

// ---------------------------------------------------------
// Auth helper: extract current actor
// ---------------------------------------------------------
function getActor(req) {
  // Expect upstream auth middleware to set req.user = { sub, role, ... }
  const userId = req.user?.sub || req.user?.id;
  const role = req.user?.role || 'driver';
  return { userId, role };
}

// ---------------------------------------------------------
// Storage adapter (provider‑agnostic: local or Supabase)
async function storageUpload({ driverId, docType, file }) {
  if (!file || !file.buffer) {
    const err = new Error('No file received');
    err.status = 400;
    throw err;
  }

  if (file.size && file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
    const sz = (file.size / (1024 * 1024)).toFixed(1);
    const err = new Error(`File too large: ${sz}MB > limit ${mb}MB`);
    err.status = 413;
    throw err;
  }

  // Debug storage adapter
  console.log('>>> storage adapter type:', typeof storage);
  console.log('>>> storage adapter keys:', storage && Object.keys(storage));

  // Choose correct upload function
  let uploadFn = null;
  if (typeof storage.upload === 'function') {
    uploadFn = storage.upload;
  } else if (typeof storage.uploadFile === 'function') {
    uploadFn = storage.uploadFile;
  }

  if (!uploadFn) {
    const err = new Error('Storage adapter has no upload or uploadFile method');
    err.status = 500;
    throw err;
  }

  // Perform upload
  const stored = await uploadFn.call(storage, {
    buffer: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    keyPrefix: `drivers/${driverId}/${docType}`,
    originalName:
      file.originalname ||
      `${docType}${path.extname(file.originalname || '')}`,
  });

  // Debug uploaded file details
  console.log('>>> storage returned:', stored);

  return {
    url: stored?.url || null,
    key: stored?.key || null,
    isSigned: stored?.isSigned || false,
  };
}



async function storageRemove(keyOrPath) {
  if (!keyOrPath) return;
  try {
    if (typeof storage.remove === 'function') {
      await storage.remove(keyOrPath);
    } else if (typeof storage.removeFile === 'function') {
      await storage.removeFile(keyOrPath);
    }
  } catch (_) {
    // Ignore removal errors
  }
}

async function storageGetUrl(
  key,
  { preferSigned = false, expiresIn = 3600 } = {}
) {
  if (!key) return null;

  // Prefer `getUrl` if available, else fallback
  if (typeof storage.getUrl === 'function') {
    return await storage.getUrl(key, { preferSigned, expiresIn });
  }
  if (preferSigned && typeof storage.getSignedUrl === 'function') {
    return await storage.getSignedUrl(key, { expiresIn });
  }
  if (!preferSigned && typeof storage.getPublicUrl === 'function') {
    return storage.getPublicUrl(key);
  }
  return null;
}

// ---------------------------------------------------------
// Load + save helpers
// ---------------------------------------------------------
// ---------------------------------------------------------
// Utility to find driver or send 401/404
// ---------------------------------------------------------
async function findDriverOr404(req, res) {
  const { userId } = getActor(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const driver = await Driver.findById(userId);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  ensureOnboardingShape(driver);
  return driver;
}

// Validate docType
function allowedDocTypeOr400(docType, res) {
  const dt = String(docType || '').toLowerCase();
  if (!ALLOWED_DOC_TYPES.includes(dt)) {
    res.status(400).json({ error: `Invalid docType. Allowed: ${ALLOWED_DOC_TYPES.join(', ')}` });
    return null;
  }
  return dt;
}

// ---------------------------------------------------------
// Driver-facing controllers
// ---------------------------------------------------------
async function getOnboardingStatus(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const state = computeMissing(driver);
    res.json({
      status: driver.onboarding.status,
      personal: driver.onboarding.personal,
      vehicle: driver.onboarding.vehicle,
      documents: driver.onboarding.documents,
      ...state,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: 'Failed to fetch onboarding status' });
  }
}

// 🚦 State mapping based on current step
const ONBOARDING_STEPS = {
  pending: 'personal_in_progress',
  personal_in_progress: 'vehicle_in_progress',
  vehicle_in_progress: 'docs_in_progress',
  docs_in_progress: 'review'
};

async function updatePersonalInfo(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const { name, phone } = req.body || {};
    if (typeof name !== 'string' || typeof phone !== 'string' || !name.trim() || !phone.trim()) {
      return res.status(400).json({ error: 'Valid name and phone are required' });
    }

    driver.onboarding.personal = {
      name: name.trim(),
      phone: phone.trim(),
      completed: true
    };

    // Move to correct next status only if current status is pending
    if (driver.onboarding.status === 'pending') {
      driver.onboarding.status = 'personal_in_progress';
    }

    driver.onboarding.updatedAt = new Date();

    await driver.save();

    ioEmit(req, driver._id, 'onboarding:personal:updated', driver.onboarding.personal);

    return res.json({ success: true, state: computeMissing(driver), status: driver.onboarding.status });
  } catch (err) {
    console.error('❌ Error updating personal info:', err);
    return res
      .status(err.name === 'ValidationError' ? 400 : (err.status || 500))
      .json({ error: err.message || 'Failed to update personal info' });
  }
}

async function updateVehicleInfo(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const { type, number } = req.body || {};
    if (typeof type !== 'string' || typeof number !== 'string' || !type.trim() || !number.trim()) {
      return res.status(400).json({ error: 'Valid type and number are required' });
    }

    driver.onboarding.vehicle = {
      type: type.trim(),
      number: number.trim().toUpperCase(),
      completed: true
    };

    // Only update status if currently at personal_in_progress
    if (driver.onboarding.status === 'personal_in_progress') {
      driver.onboarding.status = 'vehicle_in_progress';
    }

    driver.onboarding.updatedAt = new Date();

    await driver.save();

    ioEmit(req, driver._id, 'onboarding:vehicle:updated', driver.onboarding.vehicle);

    return res.json({ success: true, state: computeMissing(driver), status: driver.onboarding.status });
  } catch (err) {
    console.error('❌ Error updating vehicle info:', err);
    return res
      .status(err.name === 'ValidationError' ? 400 : (err.status || 500))
      .json({ error: err.message || 'Failed to update vehicle info' });
  }
}
async function uploadDocument(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const docType = allowedDocTypeOr400(
      req.params.docType || req.body.docType,
      res
    );
    if (!docType || res.headersSent) return;

    // Define required documents
    const requiredDocs = ['aadhar', 'pan', 'dl', 'rc'];

    // If all required docs are uploaded, block further uploads
    const allUploaded = requiredDocs.every(d => driver.onboarding.documents?.[d]);
    if (allUploaded) {
      return res.status(200).json({
        success: false,
        message: 'All required documents have been uploaded and are under admin review. No further uploads allowed.',
        onboardingStatus: driver.onboarding.status,
        documentsUploaded: true
      });
    }

    // Standard "no file" check
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Remove existing file for this docType if present
    const existing = driver.onboarding.documents[docType];
    if (existing?.storageKey) {
      await storageRemove(existing.storageKey);
    }

    // Upload new file
    const { url, key } = await storageUpload({
      driverId: driver._id,
      docType,
      file: req.file,
    });

    // Save metadata for this document
    driver.onboarding.documents[docType] = {
      url,
      storageKey: key,
      uploadedAt: new Date(),
      mime: req.file.mimetype || null,
      size: req.file.size || null,
      name: req.file.originalname || null,
    };
    driver.markModified('onboarding.documents');

    // Recompute missing docs
    driver.onboarding.missingDocs = computeMissing(driver);

    // Ensure vehicle object exists
    if (!driver.vehicle) {
      driver.vehicle = {};
    }

    // Update documentsUploaded flag
    driver.vehicle.documentsUploaded = requiredDocs.every(d => driver.onboarding.documents[d]);
    driver.markModified('vehicle');

    // Auto‑advance onboarding status
    if (driver.onboarding.missingDocs.length === 0) {
      driver.onboarding.status = 'ready_for_review';
    } else if (driver.onboarding.status === 'pending') {
      driver.onboarding.status = 'in_progress';
    }

    await driver.save();

    // Emit socket event
    ioEmit(req, driver._id, 'onboarding:doc:uploaded', {
      docType,
      url,
      missingDocs: driver.onboarding.missingDocs,
      onboardingStatus: driver.onboarding.status,
      documentsUploaded: driver.vehicle.documentsUploaded
    });

    res.json({
      success: true,
      docType,
      url,
      missingDocs: driver.onboarding.missingDocs,
      onboardingStatus: driver.onboarding.status,
      documentsUploaded: driver.vehicle.documentsUploaded
    });

  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.status === 413 ? err.message : 'Failed to upload document',
    });
  }
}





async function deleteDocument(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const docType = allowedDocTypeOr400(
      req.params.docType || req.body.docType,
      res
    );
    if (!docType || res.headersSent) return;

    const existing = driver.onboarding.documents[docType];
    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Remove from storage
    if (existing.storageKey) {
      await storageRemove(existing.storageKey);
    }

    // Remove from DB
    driver.onboarding.documents[docType] = null;

    // Recompute and persist missing docs
    driver.onboarding.missingDocs = computeMissing(driver);

    // Auto‑adjust onboarding status
    if (driver.onboarding.status === 'ready_for_review') {
      driver.onboarding.status = 'in_progress';
    }

    await driver.save();

    // Notify driver UI
    ioEmit(req, driver._id, 'onboarding:doc:deleted', {
      docType,
      missingDocs: driver.onboarding.missingDocs,
      onboardingStatus: driver.onboarding.status,
    });

    res.json({
      success: true,
      docType,
      missingDocs: driver.onboarding.missingDocs,
      onboardingStatus: driver.onboarding.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}

async function submitForReview(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    // Always recompute and persist before submit
    driver.onboarding.missingDocs = computeMissing(driver);

    if (driver.onboarding.missingDocs.length > 0) {
      return res.status(400).json({
        error: 'Onboarding incomplete',
        missingDocs: driver.onboarding.missingDocs,
      });
    }

    driver.onboarding.status = 'under_review';
    driver.onboarding.submittedAt = new Date();

    await driver.save();

    // Notify the driver UI
    ioEmit(req, driver._id, 'onboarding:submitted', {
      submittedAt: driver.onboarding.submittedAt,
    });

    // Notify all admins
    ioEmit(req, 'admins', 'onboarding:driver_submitted', {
      driverId: String(driver._id),
      vehicleType: driver.onboarding.vehicle.type,
    });

    res.json({
      success: true,
      status: driver.onboarding.status,
      submittedAt: driver.onboarding.submittedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit for review' });
  }
}



// Generate a fetchable URL for a document (signed if private bucket)
async function getDocumentUrl(req, res) {
  try {
    const driver = await findDriverOr404(req, res);
    if (!driver || res.headersSent) return;

    const docType = allowedDocTypeOr400(req.params.docType || req.body.docType, res);
    if (!docType || res.headersSent) return;

    const existing = driver.onboarding.documents[docType];
    if (!existing?.storageKey && !existing?.url) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Use provider‑agnostic storage.getUrl()
    const preferSigned = String(process.env.PREFER_SIGNED_URL || 'true') === 'true';
    const expiresIn = Number(process.env.SIGNED_URL_TTL_SECONDS || 3600);

    const url =
      (preferSigned && existing.storageKey)
        ? await storageGetUrl(existing.storageKey, { preferSigned: true, expiresIn })
        : existing.url;

    res.json({
      docType,
      url,
      signed: Boolean(preferSigned && existing.storageKey),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create document URL' });
  }
}

// ---------------------------------------------------------
// Exports
// ---------------------------------------------------------
module.exports = {
  getOnboardingStatus,
  updatePersonalInfo,
  updateVehicleInfo,
  uploadDocument,
  deleteDocument,
  submitForReview,
  getDocumentUrl,
};

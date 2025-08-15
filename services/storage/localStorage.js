// services/storage/localStorage.js
const fs = require('fs');
const path = require('path');

const ROOT = process.env.LOCAL_UPLOAD_DIR
  ? path.isAbsolute(process.env.LOCAL_UPLOAD_DIR)
    ? process.env.LOCAL_UPLOAD_DIR
    : path.join(process.cwd(), process.env.LOCAL_UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads', 'driver-docs');

function normalize(dest) {
  const clean = String(dest || '').replace(/^\/+/, '');
  const fullPath = path.join(ROOT, clean);
  const publicBase = process.env.PUBLIC_UPLOAD_BASE || '/uploads/driver-docs';
  const publicUrl = `${publicBase}/${clean}`.replace(/\\/g, '/');
  return { fullPath, publicUrl };
}

async function ensureBucketExists() {
  fs.mkdirSync(ROOT, { recursive: true });
}

async function uploadFile({ buffer, dest, contentType }) {
  const { fullPath } = normalize(dest);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return { path: dest, contentType }; // return storage path (relative) for DB
}

function getPublicUrl(dest) {
  return normalize(dest).publicUrl; // local public URL
}

async function getSignedUrl(dest, { expiresIn = 3600 } = {}) {
  // Local files don’t need signing; return public URL for simplicity
  return { signedUrl: getPublicUrl(dest), expiresIn };
}

async function removeFile(dest) {
  const { fullPath } = normalize(dest);
  try {
    await fs.promises.unlink(fullPath);
  } catch (_) {
    // ignore if not found
  }
}

module.exports = {
  ensureBucketExists,
  uploadFile,
  getPublicUrl,
  getSignedUrl,
  removeFile,
};

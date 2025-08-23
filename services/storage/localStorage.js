// services/storage/localStorage.js
const fs = require('fs');
const path = require('path');

// Root directory for storing uploads
const ROOT = process.env.LOCAL_UPLOAD_DIR
  ? path.isAbsolute(process.env.LOCAL_UPLOAD_DIR)
    ? process.env.LOCAL_UPLOAD_DIR
    : path.join(process.cwd(), process.env.LOCAL_UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads', 'driver-docs');

// Normalize destination path → returns full file path + public URL
function normalize(dest) {
  if (!dest) throw new Error('Destination path is required');

  const clean = String(dest).replace(/^\/+/, ''); // remove leading slashes
  const fullPath = path.join(ROOT, clean);

  const publicBase = process.env.PUBLIC_UPLOAD_BASE || '/uploads/driver-docs';
  const publicUrl = `${publicBase}/${clean}`.replace(/\\/g, '/');

  return { fullPath, publicUrl };
}

// Ensure the upload directory exists
async function ensureBucketExists() {
  await fs.promises.mkdir(ROOT, { recursive: true });
}

// Upload file locally
 async function uploadFile({ buffer, keyPrefix, originalName, contentType }) {
  if (!buffer) throw new Error("File buffer is required");
  if (!originalName) throw new Error("Destination filename is required");

  // Create destination key (relative path inside uploads/)
  const safeName = originalName.replace(/\s+/g, "_"); // remove spaces
  const dest = `${keyPrefix}/${Date.now()}_${safeName}`;

  const { fullPath, publicUrl } = normalize(dest);

  // Ensure parent folder exists
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

  // Save file
  await fs.promises.writeFile(fullPath, buffer);

  return {
    key: dest,                                   // storage key for DB
    url: publicUrl,                              // public URL
    contentType: contentType || "application/octet-stream",
  };
}

// Get public URL for a stored file
function getPublicUrl(dest) {
  return normalize(dest).publicUrl;
}

// Generate a "signed URL" (local doesn’t need signing → return plain URL)
async function getSignedUrl(dest, { expiresIn = 3600 } = {}) {
  return {
    signedUrl: getPublicUrl(dest),
    expiresIn,
  };
}

// Remove file from local storage
async function removeFile(dest) {
  const { fullPath } = normalize(dest);
  try {
    await fs.promises.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Failed to delete file ${fullPath}:`, err.message);
      throw err;
    }
    // Ignore if file doesn’t exist
  }
}

module.exports = {
  ensureBucketExists,
  uploadFile,
  getPublicUrl,
  getSignedUrl,
  removeFile,
};

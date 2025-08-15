// services/storage/supabaseStorage.js
// Server-side Supabase Storage helper (CommonJS)
// Requires: npm i @supabase/supabase-js
// Env:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (service role key; never expose to client)
//   SUPABASE_BUCKET            (e.g., "driver-docs")

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Supabase storage misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  );
}
if (!SUPABASE_BUCKET) {
  throw new Error('Supabase storage misconfigured: missing SUPABASE_BUCKET');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Optionally ensure bucket exists (idempotent).
 * Call once on startup if you want automatic bucket creation.
 */
async function ensureBucketExists({ public = true } = {}) {
  const { data: list, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw listErr;
  const exists = list?.some((b) => b.name === SUPABASE_BUCKET);
  if (exists) return true;

  const { error: createErr } = await supabase.storage.createBucket(SUPABASE_BUCKET, {
    public,
  });
  if (createErr) throw createErr;
  return true;
}

/**
 * Build a safe, mostly-unique filename.
 */
function buildFileName(originalName = 'file', prefix = '') {
  const base = path.basename(originalName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const name = base.replace(ext, '');
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString('hex');
  const head = prefix ? `${prefix}/` : '';
  return `${head}${name}_${stamp}_${rand}${ext}`;
}

/**
 * Upload a Buffer to Supabase Storage.
 * Returns: { key, url, path }
 * - key/path: storage object path within the bucket
 * - url: public URL (works if bucket is public)
 */
async function uploadBuffer({ buffer, contentType, keyPrefix = '', originalName = '' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('uploadBuffer: "buffer" must be a Node Buffer');
  }
  const key = buildFileName(originalName || 'upload.bin', keyPrefix);
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(key, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });

  if (error) throw error;

  const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(data.path);
  return { key: data.path, path: data.path, url: pub.publicUrl };
}

/**
 * Delete an object by storage key/path.
 */
async function removeObject(key) {
  if (!key) return;
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([key]);
  if (error) throw error;
}

/**
 * Get a public URL for a given storage key (works if bucket is public).
 */
function getPublicUrl(key) {
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

/**
 * Generate a signed URL (use this if your bucket is private).
 * expiresIn: seconds (default 3600 = 1 hour)
 */
async function getSignedUrl(key, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(key, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

module.exports = {
  ensureBucketExists,
  uploadBuffer,
  removeObject,
  getPublicUrl,
  getSignedUrl,
};

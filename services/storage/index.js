// services/storage/index.js
const providerName = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
let provider;

try {
  if (providerName === 'supabase') {
    provider = require('./supabaseStorage'); // file must be named supabaseStorage.js
  } else {
    provider = require('./localStorage'); // file must be named localStorage.js
  }
} catch (err) {
  throw new Error(
    `Failed to load storage provider "${providerName}". Make sure the file exists in /services/storage. Original error: ${err.message}`
  );
}

// Unified storage interface
const storage = {
  async upload(opts) {
    if (typeof provider.upload === 'function') return provider.upload(opts);
    if (typeof provider.uploadFile === 'function') return provider.uploadFile(opts);
    throw new Error(`No upload method found in ${providerName} storage provider`);
  },

  async remove(key) {
    if (typeof provider.remove === 'function') return provider.remove(key);
    if (typeof provider.removeFile === 'function') return provider.removeFile(key);
    throw new Error(`No remove method found in ${providerName} storage provider`);
  },

  async getUrl(key, opts = {}) {
    if (typeof provider.getUrl === 'function') return provider.getUrl(key, opts);

    if (opts.preferSigned && typeof provider.getSignedUrl === 'function') {
      return provider.getSignedUrl(key, opts);
    }

    if (!opts.preferSigned && typeof provider.getPublicUrl === 'function') {
      return provider.getPublicUrl(key);
    }

    throw new Error(`No URL getter method found in ${providerName} storage provider`);
  }
};

module.exports = storage;

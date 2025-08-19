// services/storage/index.js
const providerName = process.env.STORAGE_PROVIDER || 'local';
let provider;

if (providerName === 'supabase') {
  provider = require('./supabaseStorage');
} else {
  provider = require('./localStorage');
}

// Wrap with a unified interface
const storage = {
  async upload(opts) {
    if (typeof provider.upload === 'function') return provider.upload(opts);
    if (typeof provider.uploadFile === 'function') return provider.uploadFile(opts);
    throw new Error('No upload method found in storage provider');
  },
  async remove(key) {
    if (typeof provider.remove === 'function') return provider.remove(key);
    if (typeof provider.removeFile === 'function') return provider.removeFile(key);
    throw new Error('No remove method found in storage provider');
  },
  async getUrl(key, opts = {}) {
    if (typeof provider.getUrl === 'function') return provider.getUrl(key, opts);
    if (opts.preferSigned && typeof provider.getSignedUrl === 'function') {
      return provider.getSignedUrl(key, opts);
    }
    if (!opts.preferSigned && typeof provider.getPublicUrl === 'function') {
      return provider.getPublicUrl(key);
    }
    throw new Error('No URL getter method found in storage provider');
  }
};

module.exports = storage;

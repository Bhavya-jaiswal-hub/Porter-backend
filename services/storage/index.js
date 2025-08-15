// services/storage/index.js
const provider = process.env.STORAGE_PROVIDER || 'local';

let storage;
if (provider === 'supabase') {
  storage = require('./supabaseStorage'); // only loaded if explicitly selected
} else {
  storage = require('./localStorage');    // default local provider
}

module.exports = storage;

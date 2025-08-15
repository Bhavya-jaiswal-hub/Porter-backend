const mongoose = require('mongoose');
const { Schema } = mongoose;

// 📍 Reusable location schema
const locationSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
}, { _id: false });

// 📄 Sub-schema for driver documents
const documentSchema = new Schema({
  type: {
    type: String,
    enum: ['license', 'rc', 'id'],
    required: true,
  },
  url: { type: String, required: true },        // Supabase/public storage URL
  status: {
    type: String,
    enum: ['submitted', 'approved', 'rejected'],
    default: 'submitted',
  },
  notes: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const driverSchema = new Schema({
  // 👤 Auth + identity
  name: {
    type: String,
    required: true,
    trim: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    required: true, // hash stored here
  },

  phone: {
    type: String,
    default: null,
    trim: true,
  },

  vehicleType: {
    type: String,
    set: (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    enum: [
      'bike',
      'two-wheeler',
      'threewheeler',
      'truck',
      'minitruck',
      'tempo',
    ],
    required: true,
  },

  // 📍 Tracking
  currentLocation: {
    type: locationSchema,
    default: null,
    validate: {
      validator: (v) => !v || (
        Number.isFinite(v.lat) &&
        Number.isFinite(v.lng) &&
        v.lat >= -90 && v.lat <= 90 &&
        v.lng >= -180 && v.lng <= 180
      ),
      message: 'Invalid currentLocation coordinates',
    }
  },

  isAvailable: {
    type: Boolean,
    default: true,
    index: true,
  },

  // 📑 Onboarding + docs
  documents: [documentSchema],

  onboarding: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    updatedAt: { type: Date, default: Date.now },
  }

}, { timestamps: true });

// 🛡️ Strip sensitive data from JSON outputs
driverSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  }
});

module.exports =
  mongoose.models.Driver || mongoose.model('Driver', driverSchema);

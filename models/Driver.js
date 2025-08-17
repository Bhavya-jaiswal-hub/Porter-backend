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
  url: { type: String, required: true }, // Supabase/public storage URL
  status: {
    type: String,
    enum: ['submitted', 'approved', 'rejected'],
    default: 'submitted',
  },
  notes: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

// 🚦 Allowed onboarding states
const onboardingStatusEnum = [
  'pending',
  'personal_in_progress',
  'vehicle_in_progress',
  'docs_in_progress',
  'review',
  'approved',
  'rejected'
];

// 📄 Sub-schema for onboarding steps
const personalSchema = new Schema({
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  completed: { type: Boolean, default: false }
}, { _id: false });

const vehicleSchema = new Schema({
  type: { type: String, default: '' },
  number: { type: String, default: '' },
  completed: { type: Boolean, default: false }
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
    required: true, // hashed password
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

  // 📑 Documents
  documents: [documentSchema],

  // 📑 Onboarding + steps
  onboarding: {
    status: {
      type: String,
      enum: onboardingStatusEnum,
      default: 'pending',
    },
    personal: { type: personalSchema, default: () => ({}) },
    vehicle: { type: vehicleSchema, default: () => ({}) },
    documentsUploaded: { type: Boolean, default: false },
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

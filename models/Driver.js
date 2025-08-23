const mongoose = require('mongoose');
const { Schema } = mongoose;

// 📍 Reusable location schema
const locationSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

// 📄 Sub-schema for each uploaded driver document
const onboardingDocSchema = new Schema(
  {
    url: { type: String, required: true },        // Local/Supabase/public storage URL
    storageKey: { type: String, required: true }, // Internal storage reference
    mime: { type: String, default: null },
    size: { type: Number, default: null },
    name: { type: String, default: '' },          // Original filename
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// 🚦 Allowed onboarding states
const onboardingStatusEnum = [
  'pending',
  'in_progress',
  'personal_in_progress',
  'vehicle_in_progress',
  'docs_in_progress',
  'ready_for_review',
  'approved',
  'rejected',
];

// 📄 Sub-schema for onboarding steps
const personalSchema = new Schema(
  {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const vehicleSchema = new Schema(
  {
    type: { type: String, default: '' },
    number: { type: String, default: '' },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

// ✅ Fixed: Proper sub-schema for missingDocs
const missingDocsSchema = new Schema(
  {
    missingDocs: { type: [String], default: [] },
    personalMissing: { type: Boolean, default: false },
    vehicleMissing: { type: Boolean, default: false },
    readyToSubmit: { type: Boolean, default: false },
  },
  { _id: false }
);

const driverSchema = new Schema(
  {
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
      enum: ['bike', 'two-wheeler', 'threewheeler', 'truck', 'minitruck', 'tempo'],
      required: true,
    },

    // 📍 Tracking
    currentLocation: {
      type: locationSchema,
      default: null,
      validate: {
        validator: (v) =>
          !v ||
          (Number.isFinite(v.lat) &&
            Number.isFinite(v.lng) &&
            v.lat >= -90 &&
            v.lat <= 90 &&
            v.lng >= -180 &&
            v.lng <= 180),
        message: 'Invalid currentLocation coordinates',
      },
    },

    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },

    // 📑 Onboarding + steps
    onboarding: {
      status: {
        type: String,
        enum: onboardingStatusEnum,
        default: 'pending',
      },
      personal: { type: personalSchema, default: () => ({}) },
      vehicle: { type: vehicleSchema, default: () => ({}) },

      // ✅ Now supports per-docType objects instead of a flat array
      documents: {
        aadhar: { type: onboardingDocSchema, default: null },
        pan: { type: onboardingDocSchema, default: null },
        dl: { type: onboardingDocSchema, default: null },
        rc: { type: onboardingDocSchema, default: null },
      },

      // ✅ Fixed: now stores objects, not just strings
      missingDocs: { type: [missingDocsSchema], default: [] },
      documentsUploaded: { type: Boolean, default: false },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

// 🛡️ Strip sensitive data from JSON outputs
driverSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports =
  mongoose.models.Driver || mongoose.model('Driver', driverSchema);

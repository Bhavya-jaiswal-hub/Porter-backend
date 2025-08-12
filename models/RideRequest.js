const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const locationSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const rideRequestSchema = new Schema(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    vehicleType: {
      type: String,
      // Canonicalize to lowercase for consistent matching with drivers
      set: (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      enum: [
        'bike',
        'two-wheeler',     // will accept "Two-Wheeler" from client, stored as lowercase
        'threewheeler',    // will accept "threeWheeler" from client, stored as lowercase
        'truck',
        'minitruck',
        'tempo',
      ],
      required: true,
    },

    pickupLocation: {
      type: locationSchema,
      required: true,
      validate: {
        validator: (v) =>
          Number.isFinite(v?.lat) &&
          Number.isFinite(v?.lng) &&
          v.lat >= -90 &&
          v.lat <= 90 &&
          v.lng >= -180 &&
          v.lng <= 180,
        message: 'Invalid pickupLocation coordinates',
      },
    },

    dropLocation: {
      type: locationSchema,
      required: true,
      validate: {
        validator: (v) =>
          Number.isFinite(v?.lat) &&
          Number.isFinite(v?.lng) &&
          v.lat >= -90 &&
          v.lat <= 90 &&
          v.lng >= -180 &&
          v.lng <= 180,
        message: 'Invalid dropLocation coordinates',
      },
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // guests supported
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      // Gracefully handle legacy non-ObjectId values like "DRIVER123"
      set: (v) => (Types.ObjectId.isValid(v) ? v : null),
    },

    fareEstimate: {
      type: Number,
      required: true,
      min: [0, 'fareEstimate must be >= 0'],
    },

    status: {
      type: String,
      enum: ['searching', 'accepted', 'cancelled', 'completed'],
      default: 'searching',
      index: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Index for fast lookups by bookingId
rideRequestSchema.index({ bookingId: 1 }, { unique: true });

// Optional: compact JSON output
rideRequestSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
});

module.exports =
  mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);

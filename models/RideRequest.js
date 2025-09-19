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

    // ✅ GeoJSON point for geospatial queries
    pickupPoint: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined, // prevents empty array indexing issues
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
      default: null,
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      set: (v) => (Types.ObjectId.isValid(v) ? v : null),
    },

    fareEstimate: {
      type: Number,
      required: true,
      min: [0, 'fareEstimate must be >= 0'],
    },

    userSocketId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: [
        'pending',
        'searching',
        'accepted',
        'pickup_complete',
        'in_progress',
        'cancelled',
        'completed',
      ],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Keep pickupPoint in sync with pickupLocation
rideRequestSchema.pre('save', function (next) {
  if (this.pickupLocation?.lat && this.pickupLocation?.lng) {
    this.pickupPoint = {
      type: 'Point',
      coordinates: [this.pickupLocation.lng, this.pickupLocation.lat],
    };
  }
  next();
});

// ✅ Indexes
rideRequestSchema.index({ bookingId: 1 }, { unique: true });
rideRequestSchema.index({ pickupPoint: '2dsphere' }); // correct 2dsphere index

// Optional: compact JSON output
rideRequestSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
});

module.exports =
  mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);

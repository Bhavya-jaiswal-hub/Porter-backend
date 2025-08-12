const mongoose = require('mongoose');
const { Schema } = mongoose;

const locationSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
}, { _id: false });

const driverSchema = new Schema({
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

}, { timestamps: true });

module.exports = mongoose.models.Driver || mongoose.model('Driver', driverSchema);

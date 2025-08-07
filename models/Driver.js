const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: String,
  vehicleType: String,
  currentLocation: {
    lat: Number,
    lng: Number,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});


module.exports = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
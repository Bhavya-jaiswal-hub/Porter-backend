const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema({
  vehicleType: String,
  pickupLocation: {
    lat: Number,
    lng: Number,
    address: String,
  },
  dropLocation: {
    lat: Number,
    lng: Number,
    address: String,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver', // if you have a separate driver model
    default: null,
  },
  fareEstimate: Number,
  status: {
    type: String,
    enum: ['searching', 'accepted', 'cancelled', 'completed'],
    default: 'searching',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);

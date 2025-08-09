const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    enum: ['bike', 'threeWheeler', 'Truck', 'miniTruck', 'tempo','Two-Wheeler'], // allowed types
    required: true,
  },
  pickupLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true },
  },
  dropLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true },
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // ✅ now optional for guests
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null,
  },
  fareEstimate: { type: Number, required: true },
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

module.exports =
  mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);

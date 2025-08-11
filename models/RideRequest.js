const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true // prevents duplicate booking IDs
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'threeWheeler', 'Truck', 'miniTruck', 'tempo', 'Two-Wheeler'], // allowed types
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
    default: null // ✅ null for guests
  },
driverId: {
  type: mongoose.Schema.Types.Mixed, // can store ObjectId OR string
  ref: 'Driver',
  default: null
},

  fareEstimate: { type: Number, required: true },
  status: {
    type: String,
    enum: ['searching', 'accepted', 'cancelled', 'completed'],
    default: 'searching'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports =
  mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);

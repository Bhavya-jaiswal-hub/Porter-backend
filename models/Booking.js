const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  pickupLocation: { type: String, required: true },
  dropLocation: { type: String, required: true },
  distance: { type: Number, required: true },
  fare: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'enroute', 'arrived', 'delivered'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);

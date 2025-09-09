const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true }, // hashed password
  phone: { type: String, default: null },
  vehicleType: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

module.exports = mongoose.models.Otp || mongoose.model('Otp', otpSchema);

// models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // ✅

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin' }
}, { timestamps: true });

// Hash before save
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('Admin', adminSchema);

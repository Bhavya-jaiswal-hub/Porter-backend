const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  isAdmin: {
  type: Boolean,
  default: false
}
});


module.exports = mongoose.model('User', userSchema);

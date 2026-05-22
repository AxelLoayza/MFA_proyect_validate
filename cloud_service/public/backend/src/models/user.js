const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: { type: String, index: true, unique: true, sparse: true },
  email: { type: String, index: true },
  name: { type: String },
  role: { type: String, default: 'user', index: true },
  biometricTemplate: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);

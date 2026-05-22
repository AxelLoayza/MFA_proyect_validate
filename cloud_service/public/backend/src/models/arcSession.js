const mongoose = require('mongoose');

const ArcSessionSchema = new mongoose.Schema({
  jti: { type: String, index: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String },
  acr: { type: String },
  amr: { type: [String] },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
});

module.exports = mongoose.model('ArcSession', ArcSessionSchema);

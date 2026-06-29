const mongoose = require('mongoose');

const ArcSessionSchema = new mongoose.Schema({
  jti: { type: String, index: true, unique: true },
  tokenJti: { type: String, index: true, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String },
  acr: { type: String },
  amr: { type: [String] },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  tenantKey: { type: String, default: null, index: true },
  source: { type: String, default: null },
  result: { type: String, default: null },
  reason: { type: String, default: null },
  confidence: { type: Number, default: null },
  distance: { type: Number, default: null },
  threshold: { type: Number, default: null },
  userAgent: { type: String, default: null },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
});

module.exports = mongoose.model('ArcSession', ArcSessionSchema);

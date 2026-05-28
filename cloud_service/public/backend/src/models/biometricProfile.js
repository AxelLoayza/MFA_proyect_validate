const mongoose = require('mongoose');

const BiometricProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  tenantKey: { type: String, default: null, index: true },
  authTag: { type: String, required: true },
  iv: { type: String, required: true },
  masterFeatureEncrypted: { type: String, required: true },
  samplesUsed: { type: Number, default: 5 },
  modelVersion: { type: String, default: 'lstm_v1' },
  lastUpdated: { type: Date, default: null }
}, {
  collection: 'biometricprofile',
  timestamps: true,
  versionKey: false
});

module.exports = mongoose.model('BiometricProfile', BiometricProfileSchema);
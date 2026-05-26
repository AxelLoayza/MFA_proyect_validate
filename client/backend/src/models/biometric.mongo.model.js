const mongoose = require('mongoose');

const BiometricSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.Mixed,
    index: true
  },
  tenantKey: {
    type: String,
    index: true
  },
  masterFeatureEncrypted: {
    type: String,
    required: true
  },
  iv: {
    type: String,
    required: true
  },
  authTag: {
    type: String,
    required: true
  },
  samplesUsed: {
    type: Number,
    default: 5
  },
  modelVersion: {
    type: String,
    default: 'lstm_mini_v1'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'biometricprofile',
  timestamps: true,
  versionKey: false
});

BiometricSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
BiometricSchema.index({ userId: 1, tenantKey: 1 });

module.exports = mongoose.model('BiometricProfile', BiometricSchema);

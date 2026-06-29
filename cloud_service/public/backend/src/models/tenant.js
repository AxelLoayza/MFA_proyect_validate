const mongoose = require('mongoose');

const TokenSettingsSchema = new mongoose.Schema({
  arcTokenExpirySeconds: { type: Number, default: 300 },
  issuerName: { type: String, required: true },
  algorithm: { type: String, default: 'RS256' }
}, { _id: false });

const TenantSchema = new mongoose.Schema({
  tenantKey: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  domain: { type: String, default: null },
  status: { type: String, default: 'active' },
  tier: { type: String, default: 'none' },
  tokenSettings: { type: TokenSettingsSchema, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tenant', TenantSchema);

const mongoose = require('mongoose');

const TenantMembershipSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  key: { type: String, default: null },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  tenantKey: { type: String, default: null },
  role: { type: String, default: 'user' },
  status: { type: String, default: 'active' },
  isPrimary: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const TenantRefSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  key: { type: String, default: null },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  tenantKey: { type: String, default: null },
  memberships: { type: [TenantMembershipSchema], default: [] }
}, { _id: false });

const BiometricTemplateSchema = new mongoose.Schema({
  biometricProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricProfile', default: null },
  modelVersion: { type: String, default: null },
  samplesUsed: { type: Number, default: 0 },
  enrolledAt: { type: Date, default: null }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  googleId: { type: String, index: true, unique: true, sparse: true },
  email: { type: String, index: true },
  name: { type: String },
  role: { type: String, default: 'user', index: true },
  active: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  status: { type: String, default: 'active', index: true },
  tenant: { type: TenantRefSchema, default: null },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  tenantKey: { type: String, default: null, index: true },
  biometricTemplate: { type: BiometricTemplateSchema, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);

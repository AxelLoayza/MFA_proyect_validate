const mongoose = require('mongoose')

const TenantInviteSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // store the hashed invite code in the same field name the existing collection used
  inviteCode: { type: String, required: true },
  email: { type: String, required: true },
  name: { type: String, default: null },
  role: { type: String, default: 'user' },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
}, { collection: 'tenant_invites' })

module.exports = mongoose.model('TenantInvite', TenantInviteSchema)

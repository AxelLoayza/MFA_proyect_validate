const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({}, {
  collection: 'tenants',
  strict: false,
  versionKey: false
});

module.exports = mongoose.models.TenantMongo || mongoose.model('TenantMongo', TenantSchema);

const express = require('express');
const router = express.Router();
const Tenant = require('../models/tenant');

// Create tenant
router.post('/', async (req, res) => {
  try {
    const { tenantKey, companyName, domain, tier } = req.body;
    if (!tenantKey || !companyName) return res.status(400).json({ error: 'missing_fields' });

    const exists = await Tenant.findOne({ tenantKey });
    if (exists) return res.status(409).json({ error: 'tenant_exists', message: 'tenantKey already registered' });

    const issuerName = `https://arc-auth.service/${tenantKey}`;
    const tokenSettings = { arcTokenExpirySeconds: 300, issuerName, algorithm: 'RS256' };

    const tenant = await Tenant.create({ tenantKey, companyName, domain: domain || null, tier: tier || 'none', tokenSettings });
    res.status(201).json({ tenant });
  } catch (err) {
    console.error('create tenant error', err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// List tenants
router.get('/', async (req, res) => {
  try {
    const tenants = await Tenant.find().lean();
    res.json({ tenants });
  } catch (err) {
    console.error('list tenants error', err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

module.exports = router;

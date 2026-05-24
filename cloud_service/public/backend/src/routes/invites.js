const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const Tenant = require('../models/tenant')
const TenantInvite = require('../models/tenantInvite')
const nodemailer = require('nodemailer')

function generateInviteCode(tenantKey) {
  const prefix = (tenantKey || 'INV').toString().split('_')[0].toUpperCase()
  const partA = Math.random().toString(36).substring(2, 6).toUpperCase()
  const partB = Math.floor(10 + Math.random() * 90)
  return `${prefix}-${partA}-${partB}`
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

async function sendInviteEmail(to, code, tenant, name) {
  // configure transporter using env vars
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '465', 10),
    secure: (process.env.MAIL_ENCRYPTION || 'ssl') === 'ssl',
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD
    }
  })

  const from = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME
  const subject = `Invitación a ${process.env.APP_NAME || 'ARC Secure Cloud'}`
  const text = `Hola ${name || ''},\n\nHas sido invitado a registrarte en ${process.env.APP_NAME || 'ARC Secure Cloud'} para la organización ${tenant.companyName || tenant.tenantKey}.\n\nCódigo de invitación: ${code}\n\nPega este código en la pantalla de registro para completar tu cuenta.\n\nSaludos.`

  return transporter.sendMail({ from, to, subject, text })
}

// POST /invites
router.post('/', async (req, res) => {
  try {
    const { tenantKey, tenantId, email, name, role } = req.body
    if (!email) return res.status(400).json({ error: 'missing_email' })

    let tenant = null

    if (tenantId && tenantKey) {
      const tenantById = await Tenant.findById(tenantId)
      const tenantByKey = await Tenant.findOne({ tenantKey })

      if (!tenantById || !tenantByKey || tenantById._id.toString() !== tenantByKey._id.toString()) {
        return res.status(400).json({ error: 'tenant_mismatch', message: 'tenantKey and tenantId must reference the same tenant' })
      }

      tenant = tenantById
    } else if (tenantId) {
      tenant = await Tenant.findById(tenantId)
    } else if (tenantKey) {
      tenant = await Tenant.findOne({ tenantKey })
    }

    if (!tenant) return res.status(404).json({ error: 'tenant_not_found' })

    const code = generateInviteCode(tenant.tenantKey || tenantKey)
    const hashed = hashCode(code)

    const days = parseInt(process.env.INVITE_EXPIRATION_DAYS || '7', 10)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + days * 24 * 3600 * 1000)

    const invite = await TenantInvite.create({ tenantId: tenant._id, inviteCode: hashed, email, name: name || null, role: role || 'user', status: 'pending', createdAt: now, expiresAt })

    // attempt to send email (do not fail overall if mail fails?)
    try {
      await sendInviteEmail(email, code, tenant, name)
    } catch (mailErr) {
      console.error('Mail send failed', mailErr)
    }

    res.status(201).json({ ok: true, inviteId: invite._id, expiresAt })
  } catch (err) {
    console.error('create invite error', err)
    res.status(500).json({ error: 'server_error', details: err.message })
  }
})

module.exports = router

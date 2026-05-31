const express = require('express');
const router = express.Router();
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const mongoose = require('mongoose');
const crypto = require('crypto');
const authenticate = require('../middleware/authenticate');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const User = require('../models/user');
const ArcSession = require('../models/arcSession');
const Tenant = require('../models/tenant');
const BiometricProfile = require('../models/biometricProfile');
const { encryptBiometric, decryptBiometric } = require('../utils/crypto');

const PRIVATE_BIOMETRIC_URL = process.env.SDK_URL || 'http://localhost:8000';
const PRIVATE_LSTM_URL = process.env.PRIVATE_LSTM_URL || process.env.PRIVATE_BIOMETRIC_URL || 'http://localhost:9001';
const PRIVATE_LSTM_USERNAME = process.env.ML_SERVICE_USERNAME || 'bmfa_user';
const PRIVATE_LSTM_PASSWORD = process.env.ML_SERVICE_PASSWORD || 'your_secure_password_here';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}

function verifyArc05Token(token) {
  const algorithm = process.env.JWT_ALGO || 'RS256';
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || process.env.JWT_PRIVATE_KEY_PATH;
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

  try {
    return jwt.verify(token, publicKey, { algorithms: [algorithm] });
  } catch (firstError) {
    if (!process.env.JWT_PRIVATE_KEY_PATH || publicKeyPath === process.env.JWT_PRIVATE_KEY_PATH) {
      throw firstError;
    }

    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const derivedPublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    return jwt.verify(token, derivedPublicKey, { algorithms: [algorithm] });
  }
}

async function fetchMasterFeature(signatures) {
  const response = await fetch(`${PRIVATE_BIOMETRIC_URL}/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ signatures })
  });

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    payload = { error: responseText };
  }

  if (!response.ok) {
    const error = new Error(payload.detail || payload.message || 'Enrollment normalization failed');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function verifyIdToken(idToken) {
  const allowed = process.env.GOOGLE_ALLOWED_CLIENT_IDS
    ? process.env.GOOGLE_ALLOWED_CLIENT_IDS.split(',').map(s => s.trim())
    : process.env.GOOGLE_CLIENT_ID;
  const ticket = await client.verifyIdToken({ idToken, audience: allowed });
  return ticket.getPayload();
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

function resolveArcLevel(decoded) {
  return decoded?.arc?.acr || decoded?.arc?.level || decoded?.arc || null;
}

function toObjectIdString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return String(value);
}

function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function buildTenantMembership(tenant, { role = 'user', status = 'active', isPrimary = true, joinedAt = new Date() } = {}) {
  if (!tenant) return null;

  const tenantId = toObjectIdString(tenant._id || tenant.tenantId || null);
  const tenantKey = tenant.tenantKey || null;

  if (!tenantId && !tenantKey) return null;

  return {
    _id: tenantId,
    key: tenant.companyName || tenant.key || tenantKey || null,
    tenantId,
    tenantKey,
    role,
    status,
    isPrimary,
    joinedAt
  };
}

function buildTenantContextDocument(tenant, { role = 'user', status = 'active' } = {}) {
  const membership = buildTenantMembership(tenant, { role, status, isPrimary: true });

  if (!membership) {
    return null;
  }

  return {
    _id: membership._id,
    key: membership.key,
    tenantId: membership.tenantId,
    tenantKey: membership.tenantKey,
    memberships: [membership]
  };
}

function getTenantMemberships(user) {
  if (Array.isArray(user?.tenant?.memberships) && user.tenant.memberships.length > 0) {
    return user.tenant.memberships;
  }

  const fallbackMembership = buildTenantMembership({
    _id: user?.tenant?._id || user?.tenantId || null,
    companyName: user?.tenant?.key || user?.tenantKey || null,
    tenantKey: user?.tenant?.tenantKey || user?.tenantKey || null
  }, {
    role: user?.tenant?.role || user?.role || 'user',
    status: user?.tenant?.status || user?.status || 'active',
    isPrimary: true,
  });

  return fallbackMembership ? [fallbackMembership] : [];
}

function getBiometricProfileId(user, biometricProfile) {
  return toObjectIdString(
    biometricProfile?._id ||
    user?.biometricTemplate?.biometricProfileId ||
    user?.biometricProfileId ||
    user?.biometricTemplate?.biometricProfileId ||
    user?.biometricTemplate?.profileId ||
    null
  );
}

function getTenantDetails(user) {
  const memberships = getTenantMemberships(user);
  const activeMembership = memberships.find((membership) => membership?.isPrimary) || memberships[0] || null;
  const tenantId = toObjectIdString(activeMembership?._id || activeMembership?.tenantId || user?.tenantId || user?.tenant?._id || user?.tenant?.tenantId || null);
  const tenantKey = activeMembership?.tenantKey || user?.tenantKey || user?.tenant?.tenantKey || null;
  const tenantLabel = activeMembership?.key || user?.tenant?.key || tenantKey || null;

  if (!tenantId && !tenantKey && !tenantLabel) {
    return null;
  }

  return {
    _id: tenantId,
    key: tenantLabel,
    tenantId,
    tenantKey,
    memberships
  };
}

function getBiometricTemplateDetails(user, biometricProfile = null) {
  const biometricProfileId = getBiometricProfileId(user, biometricProfile);
  const template = user?.biometricTemplate || {};

  if (!biometricProfileId && !template.modelVersion && !template.samplesUsed && !template.enrolledAt && !template.preprocessingProfile && !template.representationStrategy && !biometricProfile) {
    return null;
  }

  return {
    biometricProfileId,
    modelVersion: template.modelVersion || biometricProfile?.modelVersion || null,
    preprocessingProfile: template.preprocessingProfile || biometricProfile?.preprocessingProfile || null,
    representationStrategy: template.representationStrategy || biometricProfile?.representationStrategy || null,
    templateShape: template.templateShape || biometricProfile?.templateShape || null,
    samplesUsed: template.samplesUsed ?? biometricProfile?.samplesUsed ?? null,
    enrolledAt: template.enrolledAt || null
  };
}

async function resolveUserFromDecodedClaims(decoded) {
  if (!decoded) return null;

  const sub = decoded.sub;
  const email = decoded.email || null;
  const googleId = decoded.googleId || decoded.providerId || null;

  if (sub && mongoose.Types.ObjectId.isValid(sub)) {
    const byId = await User.findById(sub);
    if (byId) return byId;
  }

  const candidates = [];
  if (googleId) candidates.push({ googleId });
  if (email) candidates.push({ email });
  if (sub) candidates.push({ googleId: sub });
  if (sub) candidates.push({ email: sub });

  for (const filter of candidates) {
    const found = await User.findOne(filter);
    if (found) return found;
  }

  return null;
}

async function ensureDevelopmentIdentity(decoded) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const sub = decoded?.sub || decoded?.email || crypto.randomUUID();
  const email = normalizeEmail(decoded?.email) || `${String(sub).replace(/[^a-zA-Z0-9._-]/g, '_')}@dev.local`;
  const name = decoded?.name || email.split('@')[0];

  let tenant = await Tenant.findOne({ tenantKey: 'dev-local' });
  if (!tenant) {
    tenant = await Tenant.create({
      tenantKey: 'dev-local',
      companyName: 'Development Tenant',
      domain: null,
      status: 'active',
      tier: 'none',
      tokenSettings: {
        arcTokenExpirySeconds: 300,
        issuerName: process.env.JWT_ISSUER || 'LocalAzure',
        algorithm: 'RS256'
      }
    });
  }

  const tenantContextDocument = buildTenantContextDocument(tenant, { role: 'user', status: 'active' });
  let user = await User.findOne({ $or: [{ googleId: sub }, { email }] });

  if (!user) {
    user = await User.create({
      googleId: String(sub),
      email: normalizeEmail(email),
      name,
      role: 'user',
      active: true,
      isActive: true,
      status: 'active',
      tenant: tenantContextDocument,
      tenantId: tenant._id,
      tenantKey: tenant.tenantKey,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  return user;
}

function buildArcUserResponse(user, biometricProfile = null) {
  const biometricProfileId = getBiometricProfileId(user, biometricProfile);
  const tenant = getTenantDetails(user);
  const biometricTemplate = getBiometricTemplateDetails(user, biometricProfile);
  const tenants = tenant?.memberships || [];

  return {
    id: toObjectIdString(user?._id),
    _id: toObjectIdString(user?._id),
    sub: toObjectIdString(user?._id),
    googleId: user?.googleId || null,
    email: user?.email || null,
    name: user?.name || null,
    displayName: user?.name || null,
    role: user?.role || 'user',
    status: user?.status || null,
    active: user?.active ?? user?.isActive ?? null,
    isActive: user?.isActive ?? user?.active ?? null,
    tenant,
    tenantId: tenant?._id || toObjectIdString(user?.tenantId),
    tenantKey: tenant?.tenantKey || user?.tenantKey || null,
    tenants,
    biometricProfileId,
    biometricEnrolled: Boolean(biometricProfileId),
    biometricTemplate,
    enrolledAt: biometricTemplate?.enrolledAt || null,
    modelVersion: biometricTemplate?.modelVersion || null,
    samplesUsed: biometricTemplate?.samplesUsed ?? null
  };
}

function buildArcSessionPayload({ jti, user, arc, amr, source, req, tenantKey = null, tenantId = null, extra = {} }) {
  const tenant = getTenantDetails(user);
  return {
    jti,
    tokenJti: jti,
    userId: user._id,
    clientId: process.env.GOOGLE_CLIENT_ID,
    acr: arc,
    amr,
    tenantId: tenantId || tenant?._id || user.tenantId || null,
    tenantKey: tenantKey || tenant?.tenantKey || user.tenantKey || null,
    source,
    userAgent: req?.headers?.['user-agent'] || null,
    ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null,
    result: extra.result || null,
    reason: extra.reason || null,
    confidence: extra.confidence ?? null,
    distance: extra.distance ?? null,
    threshold: extra.threshold ?? null,
    expiresAt: extra.expiresAt
  };
}

function getDeviceIdFromRequest(req) {
  return req?.body?.device?.deviceId || req?.body?.deviceId || req?.headers?.['x-device-id'] || null;
}

async function resolveTenantContext(user) {
  const tenant = getTenantDetails(user);

  if (!tenant) {
    return {
      tenant: null,
      tenantId: null,
      tenantKey: null,
      issuer: process.env.JWT_ISSUER || process.env.ARC_ISSUER || null,
    };
  }

  const tenantRecord = user?.tenant?.tokenSettings
    ? user.tenant
    : await Tenant.findOne({
        $or: [
          { _id: tenant._id },
          { tenantKey: tenant.tenantKey },
        ],
      }).lean();

  const tenantId = tenantRecord?._id ? toObjectIdString(tenantRecord._id) : tenant._id;
  const tenantKey = tenantRecord?.tenantKey || tenant.tenantKey || null;
  const issuer = tenantRecord?.tokenSettings?.issuerName || process.env.JWT_ISSUER || process.env.ARC_ISSUER || (tenantKey ? `https://arc-auth.service/${tenantKey}` : null);

  return {
    tenant: tenantRecord,
    tenantId,
    tenantKey,
    issuer,
  };
}

function buildArcJwtClaims({ user, tenantContext, arcLevel, amr, jti, biometricProfileId = null, deviceId = null }) {
  const claims = {
    sub: toObjectIdString(user?._id),
    email: user?.email || null,
    role: user?.role || 'user',
    status: user?.active === false || user?.isActive === false ? 0 : 1,
    // Keep tenant identity normalized here so tokens stay readable and consistent.
    tenantId: tenantContext?.tenantKey || tenantContext?.tenantId || user?.tenantKey || toObjectIdString(user?.tenantId),
    tenantObjectId: tenantContext?.tenantId || toObjectIdString(user?.tenantId) || null,
    // ARC is always grouped as: acr for level, amr for the authentication methods used.
    arc: {
      acr: arcLevel,
      amr,
    },
    // Reuse the JWT id as the session id to make replay/session tracing straightforward.
    session: {
      sid: jti,
    },
  };

  if (tenantContext?.issuer) {
    claims.iss = tenantContext.issuer;
  }

  if (user?.name) {
    claims.name = user.name;
  }

  if (biometricProfileId) {
    claims.biometricProfileId = biometricProfileId;
  }

  if (deviceId) {
    claims.device = { deviceId };
  }

  return claims;
}

function buildTokenResponse({ token, user, arcSessionId, expiresIn, arc, amr, biometricProfile = null, success = true, status = 'accepted', message = null, meta = null }) {
  return {
    success,
    status,
    message: message || undefined,
    access_token: token,
    token,
    token_type: 'Bearer',
    arc,
    amr,
    arcSessionId,
    expires_in: expiresIn,
    user: buildArcUserResponse(user, biometricProfile),
    meta: meta || undefined
  };
}

function normalizeStepUpSignature(body) {
  const normalizedSignature = body?.normalized_signature || body?.normalizedSignature || body?.signature || null;

  if (!normalizedSignature || !Array.isArray(normalizedSignature.normalized_stroke)) {
    const error = new Error('normalized_signature required');
    error.statusCode = 400;
    throw error;
  }

  return {
    normalized_stroke: normalizedSignature.normalized_stroke,
    real_length: Number(normalizedSignature.real_length || normalizedSignature.normalized_stroke.length),
    features: normalizedSignature.features || {
      real_length: Number(normalizedSignature.real_length || normalizedSignature.normalized_stroke.length)
    }
  };
}

async function callPrivateLstmValidation(normalizedSignature) {
  const response = await fetch(`${PRIVATE_LSTM_URL}/api/biometric/validate`, {
    method: 'POST',
    headers: {
      'Authorization': buildBasicAuthHeader(PRIVATE_LSTM_USERNAME, PRIVATE_LSTM_PASSWORD),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(normalizedSignature)
  });

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    payload = { error: responseText };
  }

  if (!response.ok) {
    const error = new Error(payload.detail || payload.message || 'Private LSTM validation failed');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

router.post('/google', async (req, res) => {
  try {
    const { id_token, action = 'login' } = req.body;
    if (!id_token) return res.status(400).json({ error: 'id_token required' });

    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email: rawEmail, name } = payload;
    const email = normalizeEmail(rawEmail);

    let user = await User.findOne({ googleId }).lean();

    if (!user && action === 'login') {
      return res.status(404).json({ error: 'needs_registration', message: 'El correo no está registrado. Debes completar el registro primero.' });
    }

    if (!user && action === 'register') {
      const { tenantKey } = req.body;
      if (!tenantKey) return res.status(400).json({ error: 'missing_tenantKey', message: 'tenantKey is required to register' });
      const Tenant = require('../models/tenant');
      const tenant = await Tenant.findOne({ tenantKey }).lean();
      if (!tenant) return res.status(404).json({ error: 'tenant_not_found', message: 'Tenant not found for tenantKey' });
      const tenantContextDocument = buildTenantContextDocument(tenant, { role: 'superadmin', status: 'active' });

      user = await User.create({
        googleId,
        email,
        name,
        role: 'superadmin',
        active: true,
        status: tenant.status || 'active',
        tenant: tenantContextDocument,
        tenantId: tenant._id,
        tenantKey: tenant.tenantKey,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      user = user.toObject();
    }

    if (user && action === 'register') {
      return res.status(409).json({ error: 'already_registered', message: 'Este correo ya está registrado. Usa iniciar sesión.' });
    }

    if (!user) {
      return res.status(404).json({ error: 'needs_registration', message: 'El correo no está registrado. Debes completar el registro primero.' });
    }

    if (!(getTenantDetails(user)?._id)) {
      return res.status(403).json({
        error: 'tenant_required',
        message: 'Usuario sin tenant asociado. Debes registrarte con tenantKey o aceptar una invitación válida antes de continuar.'
      });
    }

    // Sign server JWT with RS256 and record session (ARC)
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const tenantContext = await resolveTenantContext(user);
    const deviceId = getDeviceIdFromRequest(req);
    const token = jwt.sign(
      buildArcJwtClaims({
        user,
        tenantContext,
        arcLevel: 'urn:arc:level:0.5',
        amr: ['federated'],
        jti,
        biometricProfileId: getBiometricProfileId(user),
        deviceId
      }),
      privateKey,
      { algorithm: 'RS256', expiresIn: expirationSeconds, jwtid: jti }
    );

    // Persist arc session
    const amr = payload.amr || [];
    const arcSession = new ArcSession(buildArcSessionPayload({
      jti,
      user,
      arc: 'urn:arc:level:0.5',
      amr,
      source: 'google-login',
      req,
      extra: { expiresAt: new Date(Date.now() + expirationSeconds * 1000) }
    }));
    await arcSession.save();

    res.json({
      ...buildTokenResponse({
        token,
        user,
        arcSessionId: arcSession._id,
        expiresIn: expirationSeconds,
        arc: '0.5',
        amr: ['federated']
      }),
      user: buildArcUserResponse(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'auth_failed', details: err.message });
  }
});

/**
 * Endpoint para SDK: Verifica Google id_token y emite ARC 0.5
 * 
 * Flujo:
 * 1. SDK recibe id_token de Backend Node.js
 * 2. SDK lo pasa a Cloud Service aquí
 * 3. Cloud Service verifica con Google (tiene CLIENT_SECRET)
 * 4. Busca usuario en BD:
 *    a) Si existe en users → emite ARC 0.5
 *    b) Si existe en tenant_invites → crea user y emite ARC 0.5
 *    c) Si no existe → retorna error needs_registration
 * 5. Retorna ARC 0.5 token al SDK
 */
router.post('/google/verify-arc-05', async (req, res) => {
  try {
    const { id_token } = req.body;
    
    if (!id_token) {
      return res.status(400).json({
        error: 'id_token_required',
        message: 'Google id_token is required'
      });
    }

    console.log('[Cloud Service] Verificando Google token para ARC 0.5...');

    // Paso 1: Verificar id_token con Google
    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email: rawEmail, name } = payload;
    const email = normalizeEmail(rawEmail);

    console.log(`[Cloud Service] Google token válido para ${email}`);

    // Paso 2: Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      // Paso 2b: Si no está en users, buscar en tenant_invites
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }  // No expirada
      }).lean();

      if (invite) {
        // Crear nuevo usuario desde la invitación
        console.log(`[Cloud Service] Usuario en tenant_invites, creando user...`);
        const tenant = await Tenant.findById(invite.tenantId).lean();
        const tenantContextDocument = buildTenantContextDocument(tenant || { _id: invite.tenantId, tenantKey: null }, { role: invite.role || 'user', status: 'active' });
        
        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          active: true,
          status: 'active',
          tenant: tenantContextDocument,
          tenantId: tenant?._id || invite.tenantId,
          tenantKey: tenant?.tenantKey || null,
          biometricTemplate: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        user = user.toObject();

        console.log(`[Cloud Service] ✓ Usuario creado desde invitación`);
      } else {
        // No está ni en users ni en tenant_invites válida
        return res.status(404).json({
          error: 'needs_registration',
          message: 'Usuario no registrado. Requiere invitación válida.'
        });
      }
    }

    if (!getTenantDetails(user)?._id) {
      return res.status(403).json({
        error: 'tenant_required',
        message: 'Usuario sin tenant asociado. Debes registrarte con tenantKey o aceptar una invitación válida antes del enrolamiento.'
      });
    }

    // Paso 3: Generar ARC 0.5 token
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();

    // Crear token ARC 0.5 completo
    const arcToken = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId?.toString(),
        arc: {
          acr: 'urn:arc:level:0.5',
          amr: ['federated']  // Solo Google
        }
      },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    // Paso 4: Guardar sesión ARC
    const arcSession = new ArcSession(buildArcSessionPayload({
      jti,
      user,
      arc: 'urn:arc:level:0.5',
      amr: ['federated'],
      source: 'google-verify-arc-05',
      req,
      extra: { expiresAt: new Date(Date.now() + expirationSeconds * 1000) }
    }));
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token generado para ${user.email}`);
                tenant: tenant
                  ? {
                    _id: tenant._id,
                    key: tenant.tenantKey,
                    tenantId: tenant._id,
                    tenantKey: tenant.tenantKey
                  }
                  : {
                    _id: null,
                    key: null,
                    tenantId: null,
                    tenantKey: null
                  },
    // Paso 5: Retornar a SDK
    res.status(200).json({
      success: true,
      access_token: arcToken,
      token_type: 'Bearer',
      arc: '0.5',
      amr: ['federated'],
      user: buildArcUserResponse(user),
      arcSessionId: arcSession._id,
      expires_in: expirationSeconds
    });

  } catch (err) {
    console.error('[Cloud Service] Error en google/verify-arc-05:', err);
    res.status(500).json({
      error: 'verification_failed',
      message: err.message || 'Google verification failed'
    });
  }
});

/**
 * Nuevo endpoint: verificar usando Google `access_token` (cuando no hay id_token)
 * Recibe { access_token: "ya29..." }
 */
router.post('/google/verify-access', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'access_token_required', message: 'Google access_token is required' });

    console.log('[Cloud Service] Verificando Google access_token para ARC 0.5...');

    // Llamar al endpoint userinfo de Google para obtener sub/email/name
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    });

    if (!userinfoRes.ok) {
      const errorText = await userinfoRes.text();
      return res.status(400).json({ error: 'google_userinfo_failed', message: errorText || 'Google userinfo request failed' });
    }

    const payload = await userinfoRes.json(); // contiene sub, email, name, etc.
    const { sub: googleId, email: rawEmail, name } = payload;
    const email = normalizeEmail(rawEmail);

    if (!googleId || !email) {
      return res.status(400).json({ error: 'invalid_token', message: 'Google access_token did not return valid profile' });
    }

    console.log(`[Cloud Service] Google access_token válido para ${email}`);

    // Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      }).lean();

      if (invite) {
        const tenant = await Tenant.findById(invite.tenantId).lean();
        const tenantContextDocument = buildTenantContextDocument(tenant || { _id: invite.tenantId, tenantKey: null }, { role: invite.role || 'user', status: 'active' });
        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          active: true,
          status: 'active',
          tenant: tenantContextDocument,
          tenantId: tenant?._id || invite.tenantId,
          tenantKey: tenant?.tenantKey || null,
          biometricTemplate: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        user = user.toObject();
        console.log(`[Cloud Service] ✓ Usuario creado desde invitación (access_token flow)`);
      } else {
        return res.status(404).json({ error: 'needs_registration', message: 'Usuario no registrado. Requiere invitación válida.' });
      }
    }

    if (!(getTenantDetails(user)?._id)) {
      return res.status(403).json({
        error: 'tenant_required',
        message: 'Usuario sin tenant asociado. Debes registrarte con tenantKey o aceptar una invitación válida antes del enrolamiento.'
      });
    }

    // Generar ARC 0.5 token
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const tenantContext = await resolveTenantContext(user);
    const deviceId = getDeviceIdFromRequest(req);

    const arcToken = jwt.sign(
      buildArcJwtClaims({
        user,
        tenantContext,
        arcLevel: 'urn:arc:level:0.5',
        amr: ['federated'],
        jti,
        deviceId
      }),
      privateKey,
      { algorithm: 'RS256', expiresIn: expirationSeconds, jwtid: jti }
    );

    const arcSession = new ArcSession({ jti, userId: user._id, clientId: process.env.GOOGLE_CLIENT_ID, acr: 'urn:arc:level:0.5', amr: ['federated'], expiresAt: new Date(Date.now() + expirationSeconds * 1000) });
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token (access_token flow) generado para ${user.email}`);

    res.status(200).json({ success: true, access_token: arcToken, token_type: 'Bearer', arc: '0.5', amr: ['federated'], user: { sub: user._id.toString(), email: user.email, name: user.name, role: user.role, biometricEnrolled: Boolean(user.biometricTemplate?.biometricProfileId) }, arcSessionId: arcSession._id, expires_in: expirationSeconds });

  } catch (err) {
    console.error('[Cloud Service] Error en google/verify-access:', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'verification_failed', message: err.message || 'Google verification failed' });
  }
});

/**
 * Endpoint para SDK: Intercambia authorization_code por ARC 0.5
 * 
 * Flujo Code Flow + PKCE:
 * 1. SDK recibe authorization_code de Backend Node.js
 * 2. Cloud Service intercambia code con Google (usa CLIENT_SECRET)
 * 3. Extrae sub, email, name del id_token resultante
 * 4. Busca/crea usuario en BD
 * 5. Firma y retorna ARC 0.5 token al SDK
 * 
 * Entrada:
 * {
 *   "code": "4/0AY0e-g...",
 *   "redirect_uri": "https://localhost:4000/api/auth/callback/google"
 * }
 * 
 * Salida:
 * {
 *   "success": true,
 *   "access_token": "arc_0.5_token",
 *   "arc": "0.5",
                tenant: await Tenant.findById(invite.tenantId).lean()
                  ? {
                    _id: tenant._id,
                    key: tenant.tenantKey,
                    tenantId: tenant._id,
                    tenantKey: tenant.tenantKey
                  }
                  : {
                    _id: invite.tenantId,
                    key: null,
                    tenantId: invite.tenantId,
                    tenantKey: null
                  },
 *   "user": {...},
 *   "arcSessionId": "..."
 * }
 */
router.post('/google/exchange', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'code_required',
        message: 'Google authorization code is required'
      });
    }

    console.log('[Cloud Service] Intercambiando authorization_code con Google...');

    // Paso 1: POST a Google OAuth token endpoint usando form-urlencoded
    const tokenBody = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect_uri || `https://localhost:4000/api/auth/callback/google`,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString()
    });


    if (!tokenRes.ok) {
      return res.status(400).json({
        error: 'google_token_exchange_failed',
        message: tokenJson.error_description || tokenJson.error || 'Google token exchange failed'
      });
    }

    const { id_token, access_token: googleAccessToken } = tokenJson;

    if (!id_token) {
      return res.status(400).json({
        error: 'no_id_token',
        message: 'Google did not return id_token'
      });
    }

    console.log('[Cloud Service] ✓ Google retornó id_token, verificando...');

    // Paso 2: Verificar id_token con Google
    const payload = await verifyIdToken(id_token);
    const { sub: googleId, email: rawEmail, name } = payload;
    const email = normalizeEmail(rawEmail);

    console.log(`[Cloud Service] Google token válido para ${email}`);

    // Paso 3: Buscar usuario en collection users
    let user = await User.findOne({ googleId }).lean();

    if (!user) {
      // Paso 3b: Si no está en users, buscar en tenant_invites
      const TenantInvite = require('../models/tenantInvite');
      const invite = await TenantInvite.findOne({
        email: email,
        status: 'pending',
        expiresAt: { $gt: new Date() }  // No expirada
      }).lean();

      if (invite) {
        // Crear nuevo usuario desde la invitación
        console.log(`[Cloud Service] Usuario en tenant_invites, creando user...`);
        const tenant = await Tenant.findById(invite.tenantId).lean();
        const tenantContextDocument = buildTenantContextDocument(tenant || { _id: invite.tenantId, tenantKey: null }, { role: invite.role || 'user', status: 'active' });

        user = await User.create({
          googleId,
          email,
          name: name || invite.name || '',
          role: invite.role || 'user',
          active: true,
          status: 'active',
          tenant: tenantContextDocument,
          tenantId: tenant?._id || invite.tenantId,
          tenantKey: tenant?.tenantKey || null,
          biometricTemplate: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        user = user.toObject();

        console.log(`[Cloud Service] ✓ Usuario creado desde invitación`);
      } else {
        // No está ni en users ni en tenant_invites válida
        return res.status(404).json({
          error: 'needs_registration',
          message: 'Usuario no registrado. Requiere invitación válida.'
        });
      }
    }

    // Paso 4: Generar ARC 0.5 token (igual que en /google/verify-arc-05)
    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const tenantContext = await resolveTenantContext(user);
    const deviceId = getDeviceIdFromRequest(req);
    const arcToken = jwt.sign(
      buildArcJwtClaims({
        user,
        tenantContext,
        arcLevel: 'urn:arc:level:0.5',
        amr: ['federated'],
        jti,
        biometricProfileId: getBiometricProfileId(user),
        deviceId
      }),
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    // Paso 5: Guardar sesión ARC
    const arcSession = new ArcSession({
      jti,
      userId: user._id,
      clientId: process.env.GOOGLE_CLIENT_ID,
      acr: 'urn:arc:level:0.5',
      amr: ['federated'],
      expiresAt: new Date(Date.now() + expirationSeconds * 1000)
    });
    await arcSession.save();

    console.log(`[Cloud Service] ✓ ARC 0.5 token generado para ${user.email}`);

    // Paso 6: Retornar a SDK
    res.status(200).json({
      success: true,
      access_token: arcToken,
      token_type: 'Bearer',
      arc: '0.5',
      amr: ['federated'],
      user: {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        biometricEnrolled: Boolean(user.biometricTemplate?.biometricProfileId)
      },
      arcSessionId: arcSession._id,
      expires_in: expirationSeconds
    });

  } catch (err) {
    console.error('[Cloud Service] Error en google/exchange:', err);
    
    // Manejo específico de errores de Google
    if (err.response?.data?.error) {
      return res.status(400).json({
        error: err.response.data.error,
        message: err.response.data.error_description || 'Google OAuth error'
      });
    }

    res.status(500).json({
      error: 'exchange_failed',
      message: err.message || 'Code exchange failed'
    });
  }
});

router.post('/enroll', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const biometricPayload = req.body?.master_feature || req.body?.biometric_template || req.body?.signatures;
    const samplesUsed = Array.isArray(req.body?.signatures) ? req.body.signatures.length : (req.body?.samplesUsed || 5);

    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    if (!biometricPayload) {
      return res.status(400).json({
        error: 'missing_biometric_payload',
        message: 'Se requiere master_feature, biometric_template o signatures'
      });
    }

    if (Array.isArray(req.body?.signatures) && req.body.signatures.length !== 5) {
      return res.status(400).json({
        error: 'invalid_signatures',
        message: 'Se requieren exactamente 5 firmas para el enrolamiento'
      });
    }

    let decoded;
    try {
      decoded = verifyArc05Token(token);
    } catch (err) {
      console.error('[Cloud Service] ARC 0.5 verification failed:', err.message);
      return res.status(401).json({ error: 'Token inválido', details: err.message });
    }

    const arcLevel = decoded?.arc?.acr || decoded?.arc?.level || decoded?.arc;
    const allowedArcLevels = new Set([
      'urn:arc:level:0',
      '0',
      '0.0',
      'urn:arc:level:0.5',
      '0.5'
    ]);

    if (!allowedArcLevels.has(String(arcLevel))) {
      return res.status(403).json({ error: 'insufficient_arc', message: 'Se requiere un token pre-enrolamiento válido para registrar biometría' });
    }

    let user = await resolveUserFromDecodedClaims(decoded);
    if (!user) {
      user = await ensureDevelopmentIdentity(decoded);
    }
    if (!user) {
      return res.status(404).json({ error: 'user_not_found', message: 'No se encontró el usuario autenticado' });
    }

    const decodedTenantObjectId = decoded.tenantObjectId || (decoded.tenantId && mongoose.Types.ObjectId.isValid(decoded.tenantId) ? decoded.tenantId : null);
    const tenantObjectId = user.tenantId
      ? new mongoose.Types.ObjectId(user.tenantId)
      : (decodedTenantObjectId
          ? new mongoose.Types.ObjectId(decodedTenantObjectId)
          : null);

    if (!tenantObjectId) {
      return res.status(403).json({ error: 'tenant_required', message: 'No se pudo resolver el tenant asociado al usuario' });
    }

    const representationStrategy = req.body?.representation_strategy || req.body?.representationStrategy || 'dtw_medoid';

    const enrollmentTemplate = {
      templateVersion: 'arc_signature_template_v1',
      preprocessingProfile: 'repo_compat',
      representationStrategy,
      templateShape: Array.isArray(biometricPayload) ? 'raw_5_signatures' : (biometricPayload?.dtw_medoid ? 'raw_4' : 'unknown'),
      samplesUsed,
      masterFeature: biometricPayload
    };

    const { encryptedData, iv, authTag } = encryptBiometric(enrollmentTemplate);

    const profile = await BiometricProfile.findOneAndUpdate(
      { userId: user._id.toString() },
      {
        userId: user._id.toString(),
        tenantId: tenantObjectId,
        authTag,
        iv,
        masterFeatureEncrypted: encryptedData,
        preprocessingProfile: enrollmentTemplate.preprocessingProfile,
        representationStrategy: enrollmentTemplate.representationStrategy,
        templateShape: enrollmentTemplate.templateShape,
        samplesUsed,
        modelVersion: 'lstm_v1'
      },
      { upsert: true, new: true }
    );

    user.biometricTemplate = {
      biometricProfileId: profile._id.toString(),
      modelVersion: profile.modelVersion,
      preprocessingProfile: profile.preprocessingProfile,
      representationStrategy: profile.representationStrategy,
      templateShape: profile.templateShape,
      samplesUsed: profile.samplesUsed,
      enrolledAt: profile.updatedAt
    };
    user.updatedAt = new Date();
    await user.save();

    const TenantInvite = require('../models/tenantInvite');
    const acceptedInvite = await TenantInvite.findOneAndUpdate(
      {
        email: user.email,
        tenantId: user.tenantId,
        status: 'pending'
      },
      { status: 'accepted' },
      {
        new: true,
        sort: { createdAt: -1 }
      }
    );

    if (acceptedInvite) {
      console.log(`[Cloud Service] ✓ Invitación marcada como accepted para ${user.email}`);
    }

    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const finalToken = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: tenantObjectId.toString(),
        biometricProfileId: profile._id.toString(),
        arc: {
          acr: 'urn:arc:level:1.0',
          amr: ['federated', 'biometric']
        }
      },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    const arcSession = new ArcSession(buildArcSessionPayload({
      jti,
      user,
      arc: 'urn:arc:level:1.0',
      amr: ['federated', 'biometric'],
      source: 'enroll',
      req,
      tenantId: user.tenantId || null,
      tenantKey: user.tenantKey || null,
      extra: {
        result: 'accepted',
        reason: 'biometric_profile_created',
        confidence: null,
        distance: null,
        threshold: null,
        expiresAt: new Date(Date.now() + expirationSeconds * 1000)
      }
    }));
    await arcSession.save();

    return res.status(201).json({
      ...buildTokenResponse({
        token: finalToken,
        user,
        arcSessionId: arcSession._id,
        expiresIn: expirationSeconds,
        arc: '1.0',
        amr: ['federated', 'biometric'],
        biometricProfile: profile,
        status: 'accepted',
        message: 'Biometric profile stored successfully',
        meta: null
      }),
      biometricProfile: {
        id: profile._id.toString(),
        userId: profile.userId,
        tenantId: profile.tenantId,
        samplesUsed: profile.samplesUsed,
        modelVersion: profile.modelVersion,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt
      },
      user: buildArcUserResponse(user, profile)
    });
  } catch (err) {
    console.error('[Cloud Service] Error en /auth/enroll:', err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details || undefined
      });
    }
    return res.status(500).json({ error: 'enrollment_failed', message: err.message });
  }
});

router.post('/step-up', async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const normalizedSignature = normalizeStepUpSignature(req.body);

    let decoded;
    try {
      decoded = verifyArc05Token(token);
    } catch (err) {
      console.error('[Cloud Service] ARC 0.5 verification failed:', err.message);
      return res.status(401).json({ error: 'Token inválido', details: err.message });
    }

    const arcLevel = resolveArcLevel(decoded);
    const allowedArcLevels = new Set([
      'urn:arc:level:0.5',
      '0.5',
      '0.5.0',
      'urn:arc:level:0',
      '0',
      '0.0'
    ]);

    if (!allowedArcLevels.has(String(arcLevel))) {
      return res.status(403).json({
        error: 'insufficient_arc',
        message: 'Se requiere un token ARC 0.5 válido para el step-up biométrico'
      });
    }

    const resolvedUser = await resolveUserFromDecodedClaims(decoded);
    const user = resolvedUser ? resolvedUser.toObject() : null;
    if (!user) {
      return res.status(404).json({ error: 'user_not_found', message: 'No se encontró el usuario autenticado' });
    }

    const biometricProfile = await BiometricProfile.findOne({ userId: user._id.toString() }).lean();
    if (!biometricProfile) {
      return res.status(404).json({
        error: 'biometric_profile_not_found',
        message: 'El usuario no tiene perfil biométrico registrado'
      });
    }

    let referenceTemplate;
    try {
      referenceTemplate = decryptBiometric(
        biometricProfile.masterFeatureEncrypted,
        biometricProfile.iv,
        biometricProfile.authTag
      );
    } catch (error) {
      return res.status(500).json({
        success: false,
        status: 'error',
        error: 'template_decrypt_failed',
        message: 'No se pudo recuperar la plantilla maestra biométrica'
      });
    }

    normalizedSignature.reference_template = referenceTemplate;

    const privateResult = await callPrivateLstmValidation(normalizedSignature);

    if (!privateResult.is_valid) {
      return res.status(401).json({
        success: false,
        status: 'rejected',
        error: 'biometric_rejected',
        message: privateResult.message || 'Firma biométrica no reconocida',
        meta: {
          confidence: privateResult.confidence || null,
          details: privateResult.details || null
        }
      });
    }

    const privateKey = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
    const expirationSeconds = parseInt(process.env.JWT_EXPIRATION_SECONDS || '3600', 10);
    const jti = crypto.randomUUID();
    const tenantContext = await resolveTenantContext(user);
    const deviceId = getDeviceIdFromRequest(req);
    const finalToken = jwt.sign(
      buildArcJwtClaims({
        user,
        tenantContext,
        arcLevel: 'urn:arc:level:1.0',
        amr: ['federated', 'biometric'],
        jti,
        biometricProfileId: biometricProfile._id.toString(),
        deviceId
      }),
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: expirationSeconds,
        jwtid: jti
      }
    );

    const arcSession = new ArcSession(buildArcSessionPayload({
      jti,
      user,
      arc: 'urn:arc:level:1.0',
      amr: ['federated', 'biometric'],
      source: 'step-up',
      req,
      tenantId: user.tenantId || null,
      tenantKey: user.tenantKey || null,
      extra: {
        result: 'accepted',
        reason: privateResult.message || null,
        confidence: privateResult.confidence || null,
        distance: privateResult.distance || null,
        threshold: privateResult.threshold || null,
        expiresAt: new Date(Date.now() + expirationSeconds * 1000)
      }
    }));
    await arcSession.save();

    return res.status(200).json({
      ...buildTokenResponse({
        token: finalToken,
        user,
        arcSessionId: arcSession._id,
        expiresIn: expirationSeconds,
        arc: '1.0',
        amr: ['federated', 'biometric'],
        biometricProfile,
        status: 'accepted',
        meta: {
          confidence: privateResult.confidence || null,
          decision: privateResult.is_valid ? 'accept' : 'reject',
          reason: privateResult.message || null,
          lstmSignature: privateResult.lstmSignature || null
        }
      }),
      meta: {
        confidence: privateResult.confidence || null,
        decision: privateResult.is_valid ? 'accept' : 'reject',
        reason: privateResult.message || null,
        lstmSignature: privateResult.lstmSignature || null
      }
    });
  } catch (err) {
    console.error('[Cloud Service] Error en /auth/step-up:', err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details || undefined
      });
    }
    return res.status(500).json({
      error: 'step_up_failed',
      message: err.message || 'Biometric step-up failed'
    });
  }
});

// Protected endpoint to get current user based on server JWT
router.get('/me', authenticate, async (req, res) => {
  try {
    const sub = req.serverJwt && req.serverJwt.sub;
    if (!sub) return res.status(401).json({ error: 'invalid_token' });
    const user = await User.findById(sub).lean();
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    res.json({
      user: buildArcUserResponse(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/users', authenticate, async (req, res) => {
  try {
    const currentUser = req.serverJwt?.sub
      ? await User.findById(req.serverJwt.sub).lean()
      : null;

    if (!currentUser) {
      return res.status(401).json({ error: 'user_not_found' });
    }

    if (currentUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'forbidden', message: 'Solo el superadmin puede listar usuarios' });
    }

    const primaryTenant = getTenantDetails(currentUser);
    const tenantFilter = req.query.tenantId || primaryTenant?._id || currentUser.tenantId || null;
    if (!tenantFilter) {
      return res.status(400).json({ error: 'tenant_required', message: 'No se pudo resolver el tenant activo' });
    }

    if (!mongoose.Types.ObjectId.isValid(tenantFilter)) {
      return res.status(400).json({ error: 'invalid_tenant', message: 'tenantId no es válido' });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantFilter);
    const users = await User.aggregate([
      {
        $match: {
          $or: [
            { tenantId: tenantObjectId },
            { 'tenant.tenantId': tenantObjectId },
            { 'tenant.memberships.tenantId': tenantObjectId }
          ]
        }
      },
      {
        $lookup: {
          from: ArcSession.collection.name,
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                _id: 1,
                createdAt: 1,
                expiresAt: 1,
                acr: 1,
                amr: 1,
                clientId: 1,
                jti: 1
              }
            }
          ],
          as: 'lastSession'
        }
      },
      { $unwind: { path: '$lastSession', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          googleId: 0,
          __v: 0
        }
      },
      { $sort: { name: 1, email: 1 } }
    ]);

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

module.exports = router;


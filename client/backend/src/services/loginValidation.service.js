const axios = require('axios');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const BiometricProfile = require('../models/biometric.mongo.model');
const Tenant = require('../models/tenant.mongo.model');
const { findActiveMongoUserByTenant, idCandidates } = require('../models/user.model');
const { createArcSessionAudit } = require('../models/session.model');
const { decryptBiometric } = require('../utils/crypto.util');
const { verifyToken, signFinalToken } = require('./token.service');

const PYTHON_SERVICE_URL = process.env.PRIVATE_LSTM_SERVICE_URL || process.env.CLOUD_SERVICE_URL || 'http://localhost:8000';
const ML_USERNAME = process.env.ML_SERVICE_USERNAME || 'bmfa_user';
const ML_PASSWORD = process.env.ML_SERVICE_PASSWORD || 'your_secure_password_here';

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    const error = new Error('Bearer token required');
    error.statusCode = 401;
    throw error;
  }
  return header.slice('Bearer '.length).trim();
}

function getArc(payload) {
  if (typeof payload.arc === 'string') return payload.arc;
  if (payload.arc && typeof payload.arc.acr === 'string') return payload.arc.acr;
  if (typeof payload.acr === 'string') return payload.acr;
  return null;
}

function normalizeAcr(acr) {
  if (!acr) return null;
  if (acr === '0.5' || acr.endsWith(':0.5') || acr.endsWith(':level:0.5')) return '0.5';
  if (acr === '1.0' || acr.endsWith(':1.0') || acr.endsWith(':level:1.0')) return '1.0';
  return acr;
}

function extractTenant(payload, body) {
  return {
    tenantId: body.tenantId || payload.tenantId || payload.tenant_id || payload.tid,
    tenantKey: body.tenantKey || payload.tenantKey || payload.tenant_key
  };
}

function ensurePoint(point) {
  return {
    x: Number(point.x),
    y: Number(point.y),
    t: Number(point.t),
    p: point.p === undefined ? 0.5 : Number(point.p)
  };
}

function buildLiveSignature(body) {
  if (body.normalized_signature) return body.normalized_signature;
  if (body.normalizedSignature) return body.normalizedSignature;

  const signature = body.signature || body;
  const points = signature.stroke_points || signature.normalized_stroke;
  if (!Array.isArray(points)) {
    const error = new Error('signature.stroke_points or normalized_signature required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedStroke = points.map(ensurePoint);
  const realLength = Number(signature.real_length || normalizedStroke.length);
  const durationMs = Number(signature.stroke_duration_ms || normalizedStroke.at(-1)?.t || 0);

  return {
    normalized_stroke: normalizedStroke,
    real_length: realLength,
    features: {
      num_points: normalizedStroke.length,
      real_length: realLength,
      total_distance: 0,
      velocity_mean: 0,
      velocity_max: 0,
      duration_ms: durationMs
    }
  };
}

function validateLiveSignature(liveSignature) {
  const points = liveSignature.normalized_stroke;
  if (!Array.isArray(points)) {
    const error = new Error('normalized_stroke must be an array');
    error.statusCode = 400;
    throw error;
  }
  if (points.length < 100 || points.length > 1200) {
    const error = new Error(`Signature must contain between 100 and 1200 points. Received ${points.length}`);
    error.statusCode = 400;
    throw error;
  }
}

async function verifyTenantIsActive({ tenantId, tenantKey }) {
  const tenantOr = [];
  if (tenantId) {
    tenantOr.push({ _id: { $in: idCandidates(tenantId) } });
    tenantOr.push({ tenantId: { $in: idCandidates(tenantId) } });
  }
  if (tenantKey) {
    tenantOr.push({ key: tenantKey });
    tenantOr.push({ tenantKey });
  }

  if (tenantOr.length === 0) return null;

  const tenant = await Tenant.findOne({
    $and: [
      { $or: tenantOr },
      {
        $or: [
          { status: { $in: ['Active', 'active', 'ACTIVE', 1, '1', true] } },
          { active: true },
          { isActive: true }
        ]
      }
    ]
  }).lean();

  if (!tenant && process.env.REQUIRE_ACTIVE_TENANT === 'true') {
    const error = new Error('Tenant is not active or does not exist');
    error.statusCode = 403;
    throw error;
  }

  return tenant;
}

function resolveTenantId({ tokenTenantId, tenant, user }) {
  return tokenTenantId || tenant?._id || user?.tenantId || user?.tenant?._id;
}

async function findBiometricProfile({ userId, tenantId, tenantKey }) {
  const tenantOr = [];
  if (tenantId) tenantOr.push({ tenantId: { $in: idCandidates(tenantId) } });
  if (tenantKey) tenantOr.push({ tenantKey });

  const query = {
    userId: String(userId)
  };
  if (tenantOr.length > 0) query.$or = tenantOr;

  return BiometricProfile.findOne(query).lean();
}

async function callPrivateLstmService({ liveSignature, masterFeature }) {
  const token = Buffer.from(`${ML_USERNAME}:${ML_PASSWORD}`, 'utf8').toString('base64');
  const response = await axios.post(
    `${PYTHON_SERVICE_URL}/api/biometric/validate`,
    {
      live_signature: liveSignature,
      master_feature: masterFeature
    },
    {
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: Number(process.env.PRIVATE_LSTM_TIMEOUT_MS || 30000)
    }
  );
  return response.data;
}

async function writeAudit({ req, userId, tenantId, tenantKey, payload, result, decision, reason }) {
  try {
    await createArcSessionAudit({
      userId: String(userId),
      tenantId,
      tenantKey,
      acr: decision === 'accept' ? '1.0' : '0.5',
      amr: decision === 'accept' ? ['biometric_signature'] : [],
      result: decision,
      distance: result?.distance,
      confidence: result?.confidence,
      threshold: result?.details?.threshold,
      reason,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      tokenJti: payload.jti
    });
  } catch (error) {
    logger.warn(`[LoginValidation] Could not write arcsessions audit: ${error.message}`);
  }
}

async function validateSignatureStepUp(req) {
  const token = extractBearerToken(req);
  const payload = verifyToken(token);
  const acr = normalizeAcr(getArc(payload));

  if (acr !== '0.5') {
    const error = new Error('ARC 0.5 token required for biometric step-up');
    error.statusCode = 403;
    throw error;
  }

  const userId = req.body.userId || payload.sub || payload.userId || payload.user_id;
  if (!userId) {
    const error = new Error('Token does not contain user id');
    error.statusCode = 401;
    throw error;
  }

  const { tenantId: tokenTenantId, tenantKey } = extractTenant(payload, req.body);
  const tenant = await verifyTenantIsActive({ tenantId: tokenTenantId, tenantKey });
  const user = await findActiveMongoUserByTenant({ userId, tenantId: tokenTenantId, tenantKey });

  if (!user) {
    const error = new Error('User not found, inactive, or outside tenant');
    error.statusCode = 403;
    throw error;
  }

  const tenantId = resolveTenantId({ tokenTenantId, tenant, user });
  if (!tenantId && !tenantKey) {
    const error = new Error('tenantId or tenantKey required for multi-tenant biometric login');
    error.statusCode = 400;
    throw error;
  }

  const profile = await findBiometricProfile({ userId: user._id || userId, tenantId, tenantKey });
  if (!profile) {
    const error = new Error('Biometric profile not found for user and tenant');
    error.statusCode = 404;
    throw error;
  }

  const liveSignature = buildLiveSignature(req.body);
  validateLiveSignature(liveSignature);

  const masterFeature = decryptBiometric(profile.masterFeatureEncrypted, profile.iv, profile.authTag);
  let lstmResult;

  try {
    lstmResult = await callPrivateLstmService({ liveSignature, masterFeature });
  } catch (error) {
    await writeAudit({ req, userId, tenantId, tenantKey, payload, result: null, decision: 'error', reason: error.message });
    throw error;
  }

  const decision = lstmResult.is_valid ? 'accept' : 'reject';
  await writeAudit({
    req,
    userId,
    tenantId,
    tenantKey,
    payload,
    result: lstmResult,
    decision,
    reason: lstmResult.message
  });

  if (decision !== 'accept') {
    const error = new Error('Biometric signature rejected');
    error.statusCode = 401;
    error.details = lstmResult;
    throw error;
  }

  const finalToken = signFinalToken({
    userId: String(user._id || userId),
    role: user.role || payload.role || 'user',
    customClaims: {
      tenantId: String(tenantId || ''),
      tenantKey,
      email: user.email || payload.email,
      amr: ['federated', 'biometric_signature']
    }
  });

  return {
    access_token: finalToken,
    token_type: 'Bearer',
    arc: '1.0',
    amr: ['federated', 'biometric_signature'],
    tenantId: String(tenantId || ''),
    tenantKey,
    biometric: {
      decision,
      confidence: lstmResult.confidence,
      distance: lstmResult.distance,
      threshold: lstmResult.details?.threshold
    },
    expires_in: parseInt(process.env.FINAL_TOKEN_TTL_SECONDS || '900', 10)
  };
}

module.exports = {
  validateSignatureStepUp
};

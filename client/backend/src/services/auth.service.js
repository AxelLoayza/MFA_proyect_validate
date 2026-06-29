// src/services/auth.service.js
const pool = require('../config/database');
const TokenService = require('./token.service');
const userService = require('./user.service');
const { verifyAssertion } = require('./cloudScoring.service');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const sessionModel = require('../models/session.model');

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function login(email, password) {
  if (process.env.AUTH_DEV_BYPASS === 'true') {
    const user = {
      id: uuidv4(),
      email,
      role: 'user',
    };

    const loginId = uuidv4();
    const nonce = uuidv4();
    const tempPayload = {
      sub: user.id,
      email: user.email,
      login_id: loginId,
      nonce,
    };

    const { token: tempToken, payload: signedPayload } = await TokenService.signTempToken(tempPayload);

    logger.info(`Dev bypass login created for user ${user.email}`);
    return { token: tempToken, tokenPayload: signedPayload, arc: '0.5', user };
  }

  const user = await userService.validatePassword(email, password);
  if (!user) {
    const error = new Error('Credenciales inválidas');
    error.statusCode = 401;
    throw error;
  }

  // create login session with login_id + nonce
  const loginId = uuidv4();
  const nonce = uuidv4();
  const tempPayload = {
    sub: user.id,
    email: user.email,
    login_id: loginId,
    nonce,
  };

  const { token: tempToken, payload: signedPayload } = await TokenService.signTempToken(tempPayload);

  // TTL from env or 120s
  const ttlSeconds = parsePositiveInt(process.env.TEMP_TOKEN_TTL_SECONDS, 900);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO login_sessions (login_id, user_id, nonce, temp_token, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
    [loginId, user.id, nonce, tempToken, 'pending', expiresAt]
  );

  logger.info(`Created login_session ${loginId} for user ${user.email}`);

  return { token: tempToken, tokenPayload: signedPayload, arc: '0.5', user };
}

/**
 * stepUp receives:
 * - signedAssertion: JWS produced by cloud (includes login_id, score, nonce)
 *
 * Flow:
 * - verify signedAssertion via cloudScoring.service.verifyAssertion
 * - check session exists and status pending, nonce matches, not expired
 * - check score >= threshold
 * - mark session completed and store final token
 * - return final token
 */
async function stepUp({ signedAssertion }) {
  // verify signature & claims
  const payload = await verifyAssertion(signedAssertion, { maxAgeSeconds: 120 });
  const { login_id: loginId, sub: userId, score, nonce } = payload;

  // fetch login_session
  const { rows } = await pool.query('SELECT * FROM login_sessions WHERE login_id = $1', [loginId]);
  const session = rows[0];
  if (!session) {
    const error = new Error('Login session not found');
    error.statusCode = 400;
    throw error;
  }
  if (session.status !== 'pending') {
    const error = new Error('Login session not pending');
    error.statusCode = 400;
    throw error;
  }
  if (session.nonce !== nonce) {
    const error = new Error('Nonce mismatch');
    error.statusCode = 400;
    throw error;
  }
  if (new Date(session.expires_at) < new Date()) {
    const error = new Error('Login session expired');
    error.statusCode = 400;
    throw error;
  }

  // check biometric score threshold
  const threshold = parseFloat(process.env.BIOMETRIC_SCORE_THRESHOLD || '0.85');
  if (typeof score !== 'number' || score < threshold) {
    const error = new Error('Biometric verification failed');
    error.statusCode = 401;
    throw error;
  }

  // Register biometric validation in audit system
  const validationId = `bio_val_${uuidv4()}`;
  await pool.query(
    `SELECT register_biometric_validation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      userId,                  // p_user_id
      loginId,                 // p_login_session_id
      validationId,            // p_validation_id
      nonce,                   // p_nonce
      'accepted',              // p_decision
      score,                   // p_confidence_score
      signedAssertion,         // p_assertion_jws (JWS completo)
      JSON.stringify(payload), // p_assertion_claims
      null,                    // p_device_fingerprint (agregar desde request si está disponible)
      null                     // p_ip_address (agregar desde request si está disponible)
    ]
  );

  // issue final token with validation_id
  const { token: finalToken } = await TokenService.signFinalToken({ 
    userId, 
    role: session.role || 'user',
    customClaims: {
      validation_id: validationId,  // Link to biometric validation
      biometric: {
        verified_at: new Date().toISOString(),
        score,
        method: 'cloud-scoring'
      }
    }
  });

  // update session
  await pool.query(
    `UPDATE login_sessions SET final_token = $1, status = 'completed' WHERE login_id = $2`,
    [finalToken, loginId]
  );

  logger.info(`Login session ${loginId} completed for user ${userId} (score=${score}, validation_id=${validationId})`);

  return finalToken;
}

module.exports = { login, stepUp };

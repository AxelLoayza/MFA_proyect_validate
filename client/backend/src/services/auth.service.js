// src/services/auth.service.js
const pool = require('../config/database');
const TokenService = require('./token.service');
const userService = require('./user.service');
const { verifyAssertion } = require('./cloudScoring.service');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const sessionModel = require('../models/session.model');

async function login(email, password) {
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

  const tempToken = TokenService.signTempToken(tempPayload);

  // TTL from env or 120s
  const ttlSeconds = parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO login_sessions (login_id, user_id, nonce, temp_token, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
    [loginId, user.id, nonce, tempToken, 'pending', expiresAt]
  );

  logger.info(`Created login_session ${loginId} for user ${user.email}`);

  return { token: tempToken, arc: '0.5', user };
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
  const finalToken = TokenService.signFinalToken({ 
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

/**
 * devStepUp: development helper to complete a pending login_session without JWKS.
 * Accepts { login_id, score, confidence } and issues a final token with arc '2'.
 */
async function devStepUp({ login_id, score = 0, confidence = 0.9 }) {
  if (process.env.NODE_ENV !== 'development') {
    const error = new Error('devStepUp only allowed in development');
    error.statusCode = 403;
    throw error;
  }

  const session = await sessionModel.getSessionByLoginId(login_id);
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
  if (new Date(session.expires_at) < new Date()) {
    const error = new Error('Login session expired');
    error.statusCode = 400;
    throw error;
  }

  const threshold = parseFloat(process.env.BIOMETRIC_SCORE_THRESHOLD || '0.85');
  if (typeof score !== 'number') score = parseFloat(score);
  if (score < threshold) {
    const error = new Error('Biometric verification failed (score below threshold)');
    error.statusCode = 401;
    throw error;
  }

  // Register biometric validation in audit system (dev mode)
  const validationId = `dev_bio_${uuidv4()}`;
  await pool.query(
    `SELECT register_biometric_validation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      session.user_id,         // p_user_id
      login_id,                // p_login_session_id
      validationId,            // p_validation_id
      session.nonce,           // p_nonce
      'accepted',              // p_decision
      score,                   // p_confidence_score
      null,                    // p_assertion_jws (null en modo dev)
      JSON.stringify({         // p_assertion_claims
        dev_mode: true,
        score,
        confidence,
        method: 'dev-simulated'
      }),
      null,                    // p_device_fingerprint
      null                     // p_ip_address
    ]
  );

  // issue final token with arc=2 and amr including bio
  const finalToken = TokenService.signFinalToken({
    userId: session.user_id,
    role: session.role || 'user',
    customClaims: {
      arc: '2',
      amr: ['pwd', 'bio'],
      validation_id: validationId,  // Link to validation
      biometric: {
        verified_at: new Date().toISOString(),
        score,
        confidence,
        method: 'dev-simulated'
      }
    }
  });

  await sessionModel.markSessionCompleted(login_id, finalToken);
  logger.info(`Dev step-up completed for login ${login_id} (validation_id=${validationId})`);

  return finalToken;
}

module.exports = { login, stepUp, devStepUp };

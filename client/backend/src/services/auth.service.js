// src/services/auth.service.js
const pool = require('../config/database');
const TokenService = require('./token.service');
const userService = require('./user.service');
const { verifyAssertion } = require('./cloudScoring.service');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const sessionModel = require('../models/session.model');
const https = require('https');
const http = require('http');

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
 * callBMFA: Internal helper to call BMFA service for stroke normalization
 * Returns normalized_points or null if BMFA unavailable
 */
async function callBMFA({ user_id, login_id, nonce, stroke_points, stroke_duration_ms, timestamp, tempToken }) {
  const bmfaUrl = process.env.BMFA_URL || 'http://localhost:9001';
  
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        user_id,
        login_id,
        nonce,
        stroke_points,
        stroke_duration_ms,
        timestamp
      });

      const url = new URL(`${bmfaUrl}/normalize`);
      const options = {
        hostname: url.hostname,
        port: url.port || 9001,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${tempToken}`
        },
        timeout: 5000
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const result = JSON.parse(data);
              logger.info(`BMFA normalized ${result.point_count} points (was_padded: ${result.was_padded})`);
              resolve(result);
            } else {
              logger.warn(`BMFA returned status ${res.statusCode}`);
              resolve(null);
            }
          } catch (e) {
            logger.warn(`BMFA response parse error: ${e.message}`);
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        logger.warn(`BMFA not available: ${e.message}`);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        logger.warn('BMFA request timeout');
        resolve(null);
      });

      req.write(payload);
      req.end();
    } catch (error) {
      logger.warn(`BMFA call failed: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * devStepUp: TEMPORARY development helper - SOLO PARA TESTING
 * 
 * ⚠️ IMPORTANTE: Este endpoint NO debería emitir ARC 2 en producción
 * El flujo correcto requiere:
 *   1. BMFA normaliza stroke_points
 *   2. BMFA envía a bmcloud para validación ML
 *   3. bmcloud retorna signedAssertion (JWS firmado)
 *   4. Node.js valida signedAssertion en /auth/step-up
 *   5. RECIÉN ahí se emite ARC 1.0
 * 
 * Este endpoint es SOLO para testing mientras bmcloud no está disponible
 * Accepts { login_id, stroke_points, stroke_duration_ms, timestamp }
 * Optional: score, confidence (simulados localmente)
 * Internally calls BMFA for normalization if available
 * Registers biometric validation with stroke data and issues ARC 2 (SIMULADO)
 */
async function devStepUp({ login_id, score, confidence, stroke_points, stroke_duration_ms, timestamp }) {
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

  // Intentar llamar a BMFA para normalización
  let normalizedPoints = stroke_points;
  let bmfaResult = null;
  
  if (stroke_points && Array.isArray(stroke_points)) {
    // Obtener temp_token para autenticar contra BMFA
    const tempToken = session.temp_token;
    
    bmfaResult = await callBMFA({
      user_id: session.user_id,
      login_id,
      nonce: session.nonce,
      stroke_points,
      stroke_duration_ms,
      timestamp,
      tempToken
    });
    
    if (bmfaResult && bmfaResult.normalized_points) {
      normalizedPoints = bmfaResult.normalized_points;
      logger.info(`Using BMFA normalized points: ${bmfaResult.point_count} points`);
    } else {
      logger.info('BMFA not available, using original stroke_points');
    }
  }

  // Si no se proporciona score, simularlo basado en stroke_points
  if (score === undefined || score === null) {
    // Simulación básica: más puntos = mejor score (máx 0.95)
    const pointCount = normalizedPoints?.length || 0;
    score = Math.min(0.95, 0.70 + (pointCount / 100) * 0.25);
  }
  
  // Si no se proporciona confidence, usar default alto
  if (confidence === undefined || confidence === null) {
    confidence = 0.92;
  }

  const threshold = parseFloat(process.env.BIOMETRIC_SCORE_THRESHOLD || '0.85');
  if (typeof score !== 'number') score = parseFloat(score);
  if (score < threshold) {
    const error = new Error('Biometric verification failed (score below threshold)');
    error.statusCode = 401;
    throw error;
  }

  // Build assertion claims with stroke data if provided
  const assertionClaims = {
    dev_mode: true,
    score,
    confidence,
    method: 'dev-simulated'
  };
  
  if (normalizedPoints && Array.isArray(normalizedPoints)) {
    assertionClaims.stroke_count = normalizedPoints.length;
    assertionClaims.original_stroke_count = stroke_points?.length;
    assertionClaims.stroke_duration_ms = stroke_duration_ms;
    assertionClaims.timestamp = timestamp;
    assertionClaims.bmfa_processed = bmfaResult !== null;
    assertionClaims.was_padded = bmfaResult?.was_padded || false;
    assertionClaims.stroke_points = normalizedPoints; // Store normalized points
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
      JSON.stringify(assertionClaims), // p_assertion_claims (incluye stroke_points)
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
        stroke_count: stroke_points?.length,
        method: 'dev-simulated'
      }
    }
  });

  await sessionModel.markSessionCompleted(login_id, finalToken);
  logger.info(`Dev step-up completed for login ${login_id} (${stroke_points?.length || 0} stroke points, validation_id=${validationId})`);

  return finalToken;
}

module.exports = { login, stepUp, devStepUp };

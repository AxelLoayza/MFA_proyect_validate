
// jose v5+ is pure ESM - use dynamic import() instead of require()
const { CLOUD_JWKS_URL, CLOUD_ISSUER, CLOUD_AUDIENCE } = require('../config/cloud_keys');
const logger = require('../config/logger');

let JWKS = null;
let _jwtVerify = null;

async function _initJose() {
  if (_jwtVerify) return;
  try {
    const jose = await import('jose');
    JWKS = jose.createRemoteJWKSet(new URL(CLOUD_JWKS_URL));
    _jwtVerify = jose.jwtVerify;
  } catch (err) {
    logger.warn('JOSE initialization failed:', err.message);
    JWKS = null;
    _jwtVerify = null;
  }
}

/**
 * verifyAssertion: verifica un JWT/JWS firmado por cloud.
 * - signedAssertion: string JWT
 * - expectedLoginId: optional (to check login_id matches)
 * - maxAgeSeconds: allowed age
 *
 * Retorna payload si es válido, lanza error en caso contrario.
 */
async function verifyAssertion(signedAssertion, { expectedLoginId = null, maxAgeSeconds = 120 } = {}) {
  await _initJose();
  if (!JWKS || !_jwtVerify) {
    throw new Error('JWKS not configured or invalid');
  }
  try {
    const { payload, protectedHeader } = await _jwtVerify(
      signedAssertion,
      JWKS,
      {
        issuer: CLOUD_ISSUER,
        audience: CLOUD_AUDIENCE,
        maxTokenAge: `${maxAgeSeconds}s`,
      }
    );

    // Chequeos semánticos
    if (expectedLoginId && payload.login_id !== expectedLoginId) {
      throw new Error('login_id mismatch');
    }

    // payload expected fields: sub (user id), login_id, score, confidence, nonce, ts, hash_features
    const required = ['sub', 'login_id', 'score', 'nonce'];
    for (const r of required) {
      if (typeof payload[r] === 'undefined') {
        throw new Error(`Missing required claim ${r}`);
      }
    }

    logger.info(`Cloud assertion valid for user ${payload.sub} (score=${payload.score})`);
    return payload;
  } catch (err) {
    logger.warn('Cloud assertion verification failed:', err.message);
    throw err;
  }
}

module.exports = { verifyAssertion };

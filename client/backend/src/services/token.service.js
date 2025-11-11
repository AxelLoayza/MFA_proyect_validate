// src/services/token.service.js
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const PRIV_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '../keys/jwt_private.pem');
const PUB_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '../keys/jwt_public.pem');

let PRIV_KEY, PUB_KEY;
try {
  PRIV_KEY = fs.readFileSync(PRIV_KEY_PATH, 'utf8');
  PUB_KEY = fs.readFileSync(PUB_KEY_PATH, 'utf8');
} catch (e) {
  logger.error('❌ Error loading JWT keys: ' + e.message);
}

const ISS = process.env.JWT_ISSUER || 'LocalAzure';
const ALGO = process.env.JWT_ALGO || 'RS256';
const { v4: uuidv4 } = require('uuid');

function signTempToken(payload = {}) {
  const ttl = parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10);
  const jti = `temp_${uuidv4()}`;
  
  return jwt.sign(
    { 
      iss: ISS, 
      ...payload, 
      arc: '0.5',
      jti,  // JWT ID único para prevenir replay attacks
      aud: 'node-backend'  // Audience específico
    },
    PRIV_KEY,
    { algorithm: ALGO, expiresIn: `${ttl}s` }
  );
}

function signFinalToken({ userId, role = 'user', customClaims = {} } = {}) {
  const ttl = parseInt(process.env.FINAL_TOKEN_TTL_SECONDS || '900', 10);
  const jti = `final_${uuidv4()}`;
  
  return jwt.sign(
    { 
      iss: ISS, 
      sub: userId, 
      role, 
      arc: '1.0', 
      jti,  // JWT ID único
      aud: ['node-backend', 'flutter-app'],  // Multiple audiences
      ...customClaims 
    },
    PRIV_KEY,
    { algorithm: ALGO, expiresIn: `${ttl}s` }
  );
}

function verifyToken(token) {
  return jwt.verify(token, PUB_KEY, { algorithms: [ALGO], issuer: ISS });
}

module.exports = { signTempToken, signFinalToken, verifyToken };

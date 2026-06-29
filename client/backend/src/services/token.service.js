// src/services/token.service.js
const axios = require('axios');
const logger = require('../config/logger');

function requiredEnv(name) {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const CLOUD_PUBLIC_BACKEND_URL = requiredEnv('CLOUD_PUBLIC_BACKEND_URL');
const CLOUD_TOKEN_SIGN_PATH = process.env.CLOUD_TOKEN_SIGN_PATH || '/api/token/sign';
const CLOUD_TOKEN_VERIFY_PATH = process.env.CLOUD_TOKEN_VERIFY_PATH || '/api/token/verify';
const SERVICE_API_KEY = (process.env.SERVICE_API_KEY || '').trim();

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildApiKeyHeaders() {
  return SERVICE_API_KEY ? { 'X-API-Key': SERVICE_API_KEY } : {};
}

async function signRemoteToken(payload = {}, expirySeconds = 300) {
  try {
    const response = await axios.post(
      `${CLOUD_PUBLIC_BACKEND_URL}${CLOUD_TOKEN_SIGN_PATH}`,
      {
        payload,
        expiry_seconds: expirySeconds,
      },
      {
        headers: {
          ...buildApiKeyHeaders(),
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (!response.data?.token) {
      throw new Error('Cloud service did not return a signed token');
    }

    return {
      token: response.data.token,
      payload: response.data.payload || payload,
    };
  } catch (error) {
    logger.error(`[Token Service] Remote sign failed: ${error.message}`);
    throw error;
  }
}

async function verifyRemoteToken(token) {
  try {
    const response = await axios.post(
      `${CLOUD_PUBLIC_BACKEND_URL}${CLOUD_TOKEN_VERIFY_PATH}`,
      { token },
      {
        headers: {
          ...buildApiKeyHeaders(),
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data?.payload;
  } catch (error) {
    logger.error(`[Token Service] Remote verify failed: ${error.message}`);
    const authError = new Error(error.response?.data?.detail || error.response?.data?.message || error.message);
    authError.statusCode = error.response?.status || 401;
    throw authError;
  }
}

async function signTempToken(payload = {}) {
  const ttl = parsePositiveInt(process.env.TEMP_TOKEN_TTL_SECONDS, 900);
  return signRemoteToken(
    {
      ...payload,
      arc: '0.5',
      aud: 'node-backend',
    },
    ttl
  );
}

async function signFinalToken({ userId, role = 'user', customClaims = {} } = {}) {
  const ttl = parsePositiveInt(process.env.FINAL_TOKEN_TTL_SECONDS, 3600);
  return signRemoteToken(
    {
      sub: userId,
      role,
      arc: '1.0',
      aud: ['node-backend', 'flutter-app'],
      ...customClaims,
    },
    ttl
  );
}

async function verifyToken(token) {
  return verifyRemoteToken(token);
}

module.exports = { signTempToken, signFinalToken, verifyToken };

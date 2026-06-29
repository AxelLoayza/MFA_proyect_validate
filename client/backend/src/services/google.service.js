/**
 * Google OAuth Service
 * 
 * Delega verificación de Google tokens al SDK (ApiContainer),
 * que a su vez delega al gateway público para emitir ARC 0.5.
 */

const axios = require('axios');
const logger = require('../config/logger');

if (!process.env.SDK_URL) throw new Error('SDK_URL is required');
const SDK_URL = process.env.SDK_URL;
const SDK_API_KEY = process.env.SDK_API_KEY || 'sdk_default_key';
const SDK_SECRET = process.env.SDK_SECRET || 'sdk_default_secret';

/**
 * Verifica Google id_token con Cloud Service (vía SDK)
 * 
 * Flujo:
 * 1. Client Backend recibe id_token de Flutter
 * 2. Client Backend envía a SDK (ApiContainer)
 * 3. SDK delega al gateway público
 * 4. El gateway público verifica con Google (tiene CLIENT_SECRET)
 * 5. El gateway público retorna ARC 0.5 token
 * 
 * @param {string} idToken - Google id_token de Flutter
 * @returns {Object} - { access_token, arc, user, ... }
 */
async function verifyGoogleToken(idTokenOrAccessToken, tokenType = 'id_token', options = {}) {
  try {
    logger.info('[Google Service] Iniciando verificación de Google token');
    
    if (!idTokenOrAccessToken) {
      const error = new Error('Google token requerido');
      error.statusCode = 400;
      throw error;
    }

    // Paso 1: Crear credenciales Basic Auth para SDK
    const credentials = Buffer.from(
      `${SDK_API_KEY}:${SDK_SECRET}`,
      'utf8'
    ).toString('base64');

    // Paso 2: Delegar a SDK (ApiContainer)
    logger.info(`[Google Service] Enviando a SDK (${SDK_URL}/api/auth/google/verify)`);
    
    const payload = tokenType === 'id_token'
      ? { id_token: idTokenOrAccessToken }
      : { access_token: idTokenOrAccessToken };

    if (options.action) {
      payload.action = options.action;
    }

    if (options.tenantKey) {
      payload.tenantKey = options.tenantKey;
    }

    const response = await axios.post(
      `${SDK_URL}/auth/google/verify`,
      payload,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logger.info(`[Google Service] ✓ Respuesta del SDK recibida`);
    
    // Paso 3: Extraer datos de la respuesta
    const {
      access_token,
      arc,
      amr,
      user,
      arcSessionId
    } = response.data;

    if (!access_token) {
      throw new Error('SDK no retornó access_token');
    }

    logger.info(`[Google Service] ✓ ARC ${arc} token generado para usuario ${user?.email}`);

    return {
      success: true,
      access_token,
      arc,          // "0.5" para login/nuevo registro
      amr,          // ["federated"]
      user,
      arcSessionId,
      expiresIn: 3600
    };

  } catch (error) {
    logger.error(`[Google Service] Error: ${error.message}`);
    
    // Re-lanzar con información del error
    if (error.response?.data) {
      const sdkError = error.response.data;
      const sdkDetail = sdkError.detail || {};
      error.statusCode = error.response.status || 500;
      error.message =
        sdkError.error ||
        sdkError.message ||
        sdkDetail.error ||
        sdkDetail.message ||
        error.message;
      error.details = sdkError.details || sdkError.description || sdkDetail;
    } else {
      error.statusCode = error.statusCode || 500;
    }
    
    throw error;
  }
}

/**
 * Flujo de registro con Google: reusa verificación delegada al SDK,
 * pero fuerza action=register y tenantKey para que Cloud Service cree el usuario.
 */
async function registerGoogleToken(idTokenOrAccessToken, tenantKey, tokenType = 'id_token') {
  if (!tenantKey) {
    const error = new Error('tenantKey requerido para registro');
    error.statusCode = 400;
    throw error;
  }

  try {
    return await verifyGoogleToken(idTokenOrAccessToken, tokenType, {
      action: 'register',
      tenantKey,
    });
  } catch (error) {
    const isAlreadyRegistered =
      error.statusCode === 409 &&
      (
        error.message === 'already_registered' ||
        error.response?.data?.error === 'already_registered' ||
        error.response?.data?.message === 'already_registered'
      );

    if (!isAlreadyRegistered) {
      throw error;
    }

    logger.info('[Google Service] tenantKey already registered; falling back to login verification');

    return verifyGoogleToken(idTokenOrAccessToken, tokenType, {
      action: 'login',
    });
  }
}

/**
 * Intercambia authorization_code por ARC 0.5 token
 * 
 * Flujo Code Flow + PKCE:
 * 1. Backend recibe authorization_code de Flutter
 * 2. Backend delega al SDK (ApiContainer)
 * 3. SDK delega al gateway público
 * 4. El gateway público intercambia con Google (tiene CLIENT_SECRET)
 * 5. El gateway público retorna ARC 0.5 token
 * 
 * @param {string} code - Google authorization code
 * @param {string} redirectUri - Redirect URI (debe coincidir con lo registrado)
 * @returns {Object} - { access_token, arc, user, ... }
 */
async function exchangeGoogleCode(code, redirectUri = null) {
  try {
    logger.info('[Google Service] Iniciando intercambio de authorization_code');
    
    if (!code) {
      const error = new Error('Google authorization code requerido');
      error.statusCode = 400;
      throw error;
    }

    // Paso 1: Crear credenciales Basic Auth para SDK
    const credentials = Buffer.from(
      `${SDK_API_KEY}:${SDK_SECRET}`,
      'utf8'
    ).toString('base64');

    // Paso 2: Delegar a SDK (ApiContainer)
    logger.info(`[Google Service] Enviando authorization_code a SDK (${SDK_URL}/api/auth/google/exchange)`);
    
    const response = await axios.post(
      `${SDK_URL}/auth/google/exchange`,
      { 
        code: code,
        redirect_uri: redirectUri || process.env.BACKEND_GOOGLE_REDIRECT
      },
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logger.info(`[Google Service] ✓ Respuesta del SDK recibida`);
    
    // Paso 3: Extraer datos de la respuesta
    const {
      access_token,
      arc,
      amr,
      user,
      arcSessionId
    } = response.data;

    if (!access_token) {
      throw new Error('SDK no retornó access_token');
    }

    logger.info(`[Google Service] ✓ ARC ${arc} token generado para usuario ${user?.email}`);

    return {
      success: true,
      access_token,
      arc,          // "0.5" para login/nuevo registro
      amr,          // ["federated"]
      user,
      arcSessionId,
      expiresIn: 3600
    };

  } catch (error) {
    logger.error(`[Google Service] Error en exchange: ${error.message}`);
    
    // Re-lanzar con información del error
    if (error.response?.data) {
      const sdkError = error.response.data;
      const sdkDetail = sdkError.detail || {};
      error.statusCode = error.response.status || 500;
      error.message =
        sdkError.error ||
        sdkError.message ||
        sdkDetail.error ||
        sdkDetail.message ||
        error.message;
      error.details = sdkError.details || sdkError.description || sdkDetail;
    } else {
      error.statusCode = error.statusCode || 500;
    }
    
    throw error;
  }
}

module.exports = {
  verifyGoogleToken,
  exchangeGoogleCode,
  registerGoogleToken,
};

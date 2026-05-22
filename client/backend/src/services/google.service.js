/**
 * Google OAuth Service
 * 
 * Delega verificación de Google tokens a ApiContainer (SDK)
 * que a su vez delega a Cloud Service para emitir ARC 0.5
 */

const axios = require('axios');
const logger = require('../config/logger');

const SDK_URL = process.env.SDK_URL || 'http://localhost:8000';
const SDK_API_KEY = process.env.SDK_API_KEY || 'sdk_default_key';
const SDK_SECRET = process.env.SDK_SECRET || 'sdk_default_secret';

/**
 * Verifica Google id_token con Cloud Service (vía SDK)
 * 
 * Flujo:
 * 1. Client Backend recibe id_token de Flutter
 * 2. Client Backend envía a SDK (ApiContainer)
 * 3. SDK envía a Cloud Service
 * 4. Cloud Service verifica con Google (tiene CLIENT_SECRET)
 * 5. Cloud Service retorna ARC 0.5 token
 * 
 * @param {string} idToken - Google id_token de Flutter
 * @returns {Object} - { access_token, arc, user, ... }
 */
async function verifyGoogleToken(idTokenOrAccessToken, tokenType = 'id_token') {
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
      error.statusCode = error.response.status || 500;
      error.message = sdkError.error || sdkError.message || error.message;
      error.details = sdkError.details || sdkError.description;
    } else {
      error.statusCode = error.statusCode || 500;
    }
    
    throw error;
  }
}

/**
 * Intercambia authorization_code por ARC 0.5 token
 * 
 * Flujo Code Flow + PKCE:
 * 1. Backend recibe authorization_code de Flutter
 * 2. Backend delega al SDK (ApiContainer)
 * 3. SDK delega a Cloud Service
 * 4. Cloud Service intercambia con Google (tiene CLIENT_SECRET)
 * 5. Cloud Service retorna ARC 0.5 token
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
        redirect_uri: redirectUri || `https://localhost:${process.env.PORT || 4000}/api/auth/callback/google`
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
      error.statusCode = error.response.status || 500;
      error.message = sdkError.error || sdkError.message || error.message;
      error.details = sdkError.details || sdkError.description;
    } else {
      error.statusCode = error.statusCode || 500;
    }
    
    throw error;
  }
}

module.exports = {
  verifyGoogleToken,
  exchangeGoogleCode
};

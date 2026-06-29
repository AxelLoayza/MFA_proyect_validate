const crypto = require('crypto');
require('dotenv').config();

// Debe ser estrictamente de 32 bytes (256 bits) para aes-256-gcm
// En producción, esto debe estar en el archivo .env como BIOMETRIC_SECRET_KEY
// Ejemplo de generación segura: require('crypto').randomBytes(32).toString('hex')
function resolveSecretKey() {
  const rawKey = (process.env.BIOMETRIC_SECRET_KEY || '').trim();

  if (!rawKey) {
    console.warn('⚠️ Utilizando clave de cifrado local. Por seguridad, configura BIOMETRIC_SECRET_KEY en el .env.');
    return crypto.randomBytes(32);
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  console.warn('⚠️ BIOMETRIC_SECRET_KEY no tiene 64 caracteres hex; se deriva una clave estable de 32 bytes desde su valor UTF-8.');
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

const SECRET_KEY = resolveSecretKey();

const ALGORITHM = 'aes-256-gcm';

/**
 * Encripta el "Feature Maestro" matemático que nos devuelve Python
 * @param {Object|Array} masterFeature - El biométrico matemático puro
 * @returns {Object} { encryptedData, iv, authTag } strings en Hexadecimal
 */
function encryptBiometric(masterFeature) {
  const jsonString = JSON.stringify(masterFeature);
  
  // El Vector de Inicialización debe ser aleatorio (12 bytes para GCM)
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  
  let encrypted = cipher.update(jsonString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Tag criptográfico propio de GCM (Asegura que el dato no fue alterado en BD)
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

/**
 * Desencripta de BD el biométrico (para enviarlo a Python a comparar en Inicios de Sesión)
 * @param {String} encryptedHex 
 * @param {String} ivHex 
 * @param {String} authTagHex 
 * @returns {Object|Array} El Master Feature original
 */
function decryptBiometric(encryptedHex, ivHex, authTagHex) {
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      SECRET_KEY,
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error("🚨 Error grave de seguridad: Intento de manipular el biométrico en la BD.", error.message);
    throw new Error("Integridad de biometría comprometida");
  }
}

module.exports = {
  encryptBiometric,
  decryptBiometric
};

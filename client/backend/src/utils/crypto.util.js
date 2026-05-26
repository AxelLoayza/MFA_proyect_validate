const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-gcm';

function resolveSecretKey() {
  if (process.env.BIOMETRIC_SECRET_KEY && /^[a-fA-F0-9]{64}$/.test(process.env.BIOMETRIC_SECRET_KEY)) {
    return Buffer.from(process.env.BIOMETRIC_SECRET_KEY, 'hex');
  }

  if (process.env.SECURITY_KEY) {
    console.warn('BIOMETRIC_SECRET_KEY missing; deriving development biometric key from SECURITY_KEY.');
    return crypto.createHash('sha256').update(process.env.SECURITY_KEY).digest();
  }

  console.warn('BIOMETRIC_SECRET_KEY and SECURITY_KEY are missing; using an ephemeral biometric key.');
  return crypto.randomBytes(32);
}

const SECRET_KEY = resolveSecretKey();

function encryptBiometric(masterFeature) {
  const jsonString = JSON.stringify(masterFeature);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(jsonString, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

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
    console.error('Biometric data integrity check failed:', error.message);
    throw new Error('Integridad de biometria comprometida');
  }
}

module.exports = {
  encryptBiometric,
  decryptBiometric
};

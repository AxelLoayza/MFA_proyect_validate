const crypto = require('crypto');

function resolveSecretKey() {
  const rawKey = (process.env.BIOMETRIC_SECRET_KEY || '').trim();

  if (!rawKey) {
    console.warn('WARNING: BIOMETRIC_SECRET_KEY is not configured; using a temporary development key.');
    return crypto.randomBytes(32);
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  console.warn('WARNING: BIOMETRIC_SECRET_KEY is not a 64-character hex string; deriving a stable 32-byte key from its UTF-8 value.');
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

const SECRET_KEY = resolveSecretKey();

const ALGORITHM = 'aes-256-gcm';

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

function decryptBiometric(encryptedData, iv, authTag) {
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

module.exports = {
  encryptBiometric,
  decryptBiometric
};
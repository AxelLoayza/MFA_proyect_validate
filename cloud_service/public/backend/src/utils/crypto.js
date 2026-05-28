const crypto = require('crypto');

const SECRET_KEY = process.env.BIOMETRIC_SECRET_KEY
  ? Buffer.from(process.env.BIOMETRIC_SECRET_KEY, 'hex')
  : crypto.randomBytes(32);

if (!process.env.BIOMETRIC_SECRET_KEY) {
  console.warn('WARNING: BIOMETRIC_SECRET_KEY is not configured; using a temporary development key.');
}

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
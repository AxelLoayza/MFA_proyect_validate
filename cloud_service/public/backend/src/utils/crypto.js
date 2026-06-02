const crypto = require('crypto');

function deriveSecretKey() {
  const configuredKey = process.env.BIOMETRIC_SECRET_KEY || process.env.SECURITY_KEY;

  if (!configuredKey) {
    throw new Error(
      'BIOMETRIC_SECRET_KEY or SECURITY_KEY must be configured to encrypt/decrypt biometric profiles.'
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(configuredKey)) {
    return Buffer.from(configuredKey, 'hex');
  }

  return crypto.createHash('sha256').update(configuredKey, 'utf8').digest();
}

const SECRET_KEY = deriveSecretKey();

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
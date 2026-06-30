const CLOUD_JWKS_URL = process.env.CLOUD_JWKS_URL || 'http://localhost:9000/.well-known/jwks.json';
const CLOUD_ISSUER = process.env.CLOUD_ISSUER || 'cloud-scorer.local';
const CLOUD_AUDIENCE = process.env.CLOUD_AUDIENCE || 'local-azure-emulator';

module.exports = {
  CLOUD_JWKS_URL,
  CLOUD_ISSUER,
  CLOUD_AUDIENCE,
};
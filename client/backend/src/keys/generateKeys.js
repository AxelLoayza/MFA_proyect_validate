// Local-only helper for generating a development RSA keypair.
// The runtime flow should use the gateway public keys for ARC tokens.
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

fs.writeFileSync('jwt_private.pem', privateKey);
fs.writeFileSync('jwt_public.pem', publicKey);

console.log('Claves RSA generadas');

const jwksRsa = require('jwks-rsa');
const jwt = require('jsonwebtoken');

const jwksUri = process.env.GOOGLE_JWKS_URI || 'https://www.googleapis.com/oauth2/v3/certs';
const audience = process.env.GOOGLE_CLIENT_ID;

const client = jwksRsa({
  jwksUri,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey ? key.getPublicKey() : key.rsaPublicKey;
    callback(null, signingKey);
  });
}

async function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { audience, algorithms: ['RS256'] }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

module.exports = { verifyToken };

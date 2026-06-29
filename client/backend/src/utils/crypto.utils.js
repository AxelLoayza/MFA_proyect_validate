// src/utils/crypto.utils.js
const crypto = require('crypto');

function sha256Hex(input) {
  if (typeof input === 'object') input = JSON.stringify(input);
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function genNonce() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * timeSafeEqual for comparing hashes/nonces without timing attacks
 * returns boolean
 */
function safeEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

module.exports = { sha256Hex, genNonce, safeEqual };

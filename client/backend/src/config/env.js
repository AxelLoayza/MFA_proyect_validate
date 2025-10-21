// src/config/env.js
require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 4000,

  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 5432,
  DB_NAME: process.env.DB_NAME || 'azure_emulator',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',

  JWT_ALGO: process.env.JWT_ALGO || 'RS256',
  JWT_ISSUER: process.env.JWT_ISSUER || 'LocalAzure',
  TEMP_TOKEN_TTL_SECONDS: parseInt(process.env.TEMP_TOKEN_TTL_SECONDS || '120', 10),
  FINAL_TOKEN_TTL_SECONDS: parseInt(process.env.FINAL_TOKEN_TTL_SECONDS || '900', 10),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
};

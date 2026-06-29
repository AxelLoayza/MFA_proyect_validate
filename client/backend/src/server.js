
require('dotenv').config();
const app = require('./app');
const pool = require('./config/database');
const logger = require('./config/logger');
const { run: runMigrations } = require('./scripts/migrate');

function parseListenUrl(listenUrl) {
  const parsed = new URL(listenUrl);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);

  if (!host || Number.isNaN(port)) {
    throw new Error(`Invalid LISTEN_URL: ${listenUrl}`);
  }

  return { host, port };
}

const LISTEN_URL = process.env.LISTEN_URL ;
const { host: HOST, port: PORT } = parseListenUrl(LISTEN_URL);
const LISTEN_HOST = HOST === '0.0.0.0' || HOST === '::' ? undefined : HOST;

(async () => {
  try {
    await runMigrations({ closePool: false });
    if (process.exitCode && process.exitCode !== 0) {
      throw new Error('Database migrations failed');
    }

    if (process.env.AUTH_DEV_BYPASS === 'true') {
      logger.warn('⚠️ AUTH_DEV_BYPASS enabled, skipping PostgreSQL connection');
    } else {
      await pool.connect();
      logger.info('✅ Connected to local PostgreSQL');
    }
    app.listen(PORT, LISTEN_HOST, () => logger.info(`🚀 Server running on ${LISTEN_URL}`));
  } catch (err) {
    logger.error('❌ Startup error: ' + err.message);
    process.exit(1);
  }
})();

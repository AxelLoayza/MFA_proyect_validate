
require('dotenv').config();
const app = require('./app');
const pool = require('./config/database');
const logger = require('./config/logger');

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    if (process.env.AUTH_DEV_BYPASS === 'true') {
      logger.warn('⚠️ AUTH_DEV_BYPASS enabled, skipping PostgreSQL connection');
    } else {
      await pool.connect();
      logger.info('✅ Connected to local PostgreSQL');
    }
    app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    logger.error('❌ Startup error: ' + err.message);
    process.exit(1);
  }
})();

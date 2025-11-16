
require('dotenv').config();
const app = require('./app');
const pool = require('./config/database');
const logger = require('./config/logger');

const PORT = process.env.PORT;

(async () => {
  try {
    await pool.connect();
    logger.info('✅ Connected to local PostgreSQL');
    app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    logger.error('❌ Startup error: ' + err.message);
    process.exit(1);
  }
})();

const app = require('./app');
const { Pool } = require('pg');
require('dotenv').config();
const logger = require('./config/logger');

const PORT = process.env.PORT || 4000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => {
    logger.info('✅ Conectado a PostgreSQL');
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    logger.error('❌ Error de conexión DB:', err.message);
    process.exit(1);
  });

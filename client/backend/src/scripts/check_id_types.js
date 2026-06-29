const pool = require('../config/database');
const logger = require('../config/logger');

async function run() {
  try {
    await pool.connect();
    const usersId = await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='users' AND column_name='id'");
    logger.info('users.id: ' + JSON.stringify(usersId.rows));
    const sessionsUserId = await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='sessions' AND column_name='user_id'");
    logger.info('sessions.user_id: ' + JSON.stringify(sessionsUserId.rows));
    process.exit(0);
  } catch (err) {
    logger.error('check_id_types failed: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) run();

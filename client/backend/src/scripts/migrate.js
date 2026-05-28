const fs = require('fs')
const path = require('path')
const pool = require('../config/database')
const logger = require('../config/logger')

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations')
const MIGRATIONS = ['schema.sql', 'alter_session.sql']

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `)
}

async function getAppliedMigrations() {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY applied_at ASC')
  return new Set(rows.map(row => row.filename))
}

async function applyMigration(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filename}`)
  }

  const sql = fs.readFileSync(filePath, 'utf8').trim()
  if (!sql) {
    logger.info(`Skipping empty migration ${filename}`)
    return
  }

  await pool.query('BEGIN')
  try {
    await pool.query(sql)
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
    await pool.query('COMMIT')
    logger.info(`Applied migration ${filename}`)
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}

async function run(options = {}) {
  const { closePool = true } = options
  try {
    await ensureMigrationsTable()
    const applied = await getAppliedMigrations()

    for (const filename of MIGRATIONS) {
      if (applied.has(filename)) {
        logger.info(`Skipping already applied migration ${filename}`)
        continue
      }

      await applyMigration(filename)
    }

    logger.info('Database migrations completed successfully')
  } catch (error) {
    logger.error(`Migration run failed: ${error.message}`)
    process.exitCode = 1
  } finally {
    if (closePool) {
      try {
        await pool.end()
      } catch (error) {
        // ignore shutdown errors
      }
    }
  }
}

if (require.main === module) {
  run()
}

module.exports = { run }
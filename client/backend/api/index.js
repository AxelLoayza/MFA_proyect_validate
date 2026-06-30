/**
 * Vercel serverless entry point.
 * Exports the Express app without calling listen().
 * Migrations run lazily on the first cold-start request.
 */
const app = require('../src/app');
const { run: runMigrations } = require('../src/scripts/migrate');

let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    await runMigrations({ closePool: false });
  } catch (e) {
    console.warn('[vercel] Migration warning on cold start:', e.message);
  }
}

module.exports = async (req, res) => {
  await init();
  return app(req, res);
};

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { connect } = require('./db');
const authRouter = require('./routes/auth');
const tenantsRouter = require('./routes/tenants');
const invitesRouter = require('./routes/invites');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.use('/auth', authRouter);
app.use('/tenants', tenantsRouter);
app.use('/invites', invitesRouter);

function parseListenUrl(listenUrl) {
  const parsed = new URL(listenUrl);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);

  if (!host || Number.isNaN(port)) {
    throw new Error(`Invalid LISTEN_URL: ${listenUrl}`);
  }

  return { host, port, protocol: parsed.protocol };
}

const LISTEN_URL = process.env.LISTEN_URL ;
const { host: HOST, port: PORT } = parseListenUrl(LISTEN_URL);

async function start() {
  await connect();
  app.listen(PORT, HOST, () => console.log(`Public backend listening on ${LISTEN_URL}`));
}

start().catch(err => {
  console.error('Failed to start backend', err);
  process.exit(1);
});

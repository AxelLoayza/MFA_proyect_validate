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

app.use('/auth', authRouter);
app.use('/tenants', tenantsRouter);
app.use('/invites', invitesRouter);

const PORT = process.env.PORT || 4003;

async function start() {
  await connect();
  app.listen(PORT, () => console.log(`Public backend listening on ${PORT}`));
}

start().catch(err => {
  console.error('Failed to start backend', err);
  process.exit(1);
});

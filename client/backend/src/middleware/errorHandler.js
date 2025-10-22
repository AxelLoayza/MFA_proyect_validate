
const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`);

  const body = { error: err.message };
  if (process.env.NODE_ENV === 'development') body.stack = err.stack;
  res.status(status).json(body);
}

module.exports = errorHandler;


const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { limiter } = require('./middleware/limiter.middleware');

const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');
require('dotenv').config();
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');

const app = express();

app.use(helmet());
app.use(cors({
  origin: 'http://localhost:59671',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(limiter);




console.log('authRoutes es:', typeof authRoutes);

app.use('/auth', authRoutes);
app.use('/users', userRoutes);

app.use(errorHandler);

module.exports = app;

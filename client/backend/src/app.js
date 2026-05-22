
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { limiter } = require('./middleware/limiter.middleware');

const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');
require('dotenv').config();
const authRoutes = require('./routes/auth.routes');
const authController = require('./controllers/auth.controller');
const userRoutes = require('./routes/user.routes');

const app = express();

app.use(helmet());

// CORS configuration - configured from .env for flexibility
// Use CORS=* to allow all origins (development only)
// Use CORS=http://localhost:59671,http://localhost:61992 for specific origins
const corsOrigins = process.env.CORS === '*' 
  ? true  // Allow all origins
  : (process.env.CORS 
      ? process.env.CORS.split(',').map(o => o.trim())
      : ['http://localhost:59671', 'http://localhost:61992','http://localhost:8080', 'http://localhost:8000']);

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

logger.info(`CORS habilitado: ${corsOrigins === true ? 'TODOS los orígenes (*)' : corsOrigins.join(', ')}`);

app.use(express.json());
app.use(morgan('dev'));
app.use(limiter);



console.log('authRoutes es:', typeof authRoutes);

// Montar rutas de autenticación bajo el prefijo /api/auth para mantener el contrato
app.use('/api/auth', authRoutes);
// Public callback path compatible with your Google Console registration
app.get('/api/auth/callback/google', authController.googleCallback);
app.use('/users', userRoutes);

app.use(errorHandler);

module.exports = app;

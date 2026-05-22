const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyJWT = require('../middleware/jwt.middleware');
const { requireArc } = require('../middleware/arc.middleware');

router.post('/login', authController.login);
router.post('/step-up', authController.stepUp);
router.post('/dev-step-up', authController.devStepUp);

// Inicia OAuth con Google (backend redirige al endpoint de Google)
router.get('/google/start', authController.googleStart);

// Google OAuth - Verificar id_token y obtener ARC 0.5
router.post('/google/verify', authController.googleVerify);

// NUEVO: Ruta de enrolamiento protegida (requiere token de login ARC 0.5)
router.post('/enroll', verifyJWT, requireArc('0.5'), authController.enrollBiometric);

// Intercambio de código Google (frontend envía serverAuthCode)
router.post('/google_exchange', authController.googleExchange);

module.exports = router;

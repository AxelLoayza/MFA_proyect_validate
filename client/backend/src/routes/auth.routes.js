const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/step-up', authController.stepUp);

router.post('/dev-step-up', authController.devStepUp);

module.exports = router;

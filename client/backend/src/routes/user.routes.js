
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const verifyJWT = require('../middleware/jwt.middleware');


router.post('/register', userController.register);


router.get('/me', verifyJWT, userController.me);

module.exports = router;

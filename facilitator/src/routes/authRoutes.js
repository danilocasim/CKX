const express = require('express');
const authController = require('../controllers/authController');
const authValidators = require('../middleware/authValidators');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', authValidators.validateRegister, authController.register);
router.post('/login', authValidators.validateLogin, authController.login);
router.post('/refresh', authValidators.validateRefresh, authController.refresh);

// Protected routes
router.post('/logout', authenticate, authValidators.validateLogout, authController.logout);

module.exports = router;

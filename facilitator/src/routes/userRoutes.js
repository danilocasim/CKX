const express = require('express');
const userController = require('../controllers/userController');
const authValidators = require('../middleware/authValidators');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Profile routes
router.get('/me', userController.getProfile);
router.patch('/me', authValidators.validateUpdateProfile, userController.updateProfile);

// Stats route
router.get('/me/stats', userController.getStats);

// Exam history routes
router.get('/me/exams', userController.getExamHistory);
router.get('/me/exams/:id', userController.getExamAttempt);

module.exports = router;

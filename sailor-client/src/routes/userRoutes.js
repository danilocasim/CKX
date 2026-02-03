const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/me', requireAuth, userController.getProfile);
router.patch('/me', requireAuth, userController.updateProfile);
router.get('/me/stats', requireAuth, userController.getStats);
router.get('/me/exams', requireAuth, userController.getExamHistory);
router.get('/me/exams/:id', requireAuth, userController.getExamAttempt);

module.exports = router;

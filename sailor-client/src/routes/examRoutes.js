const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

router.get('/labs', optionalAuth, examController.getLabsList);
router.post('/', requireAuth, examController.createExam);
router.get('/current', requireAuth, examController.getCurrentExam);
router.post('/:examId/terminate', requireAuth, examController.terminateExam);

module.exports = router;

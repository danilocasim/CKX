const express = require('express');
const examController = require('../controllers/examController');
const { validateCreateExam, validateEvaluateExam, validateExamEvents } = require('../middleware/validators');
const { optionalAuth } = require('../middleware/authMiddleware');
const { requireFullAccess, requireSessionAccess } = require('../middleware/accessMiddleware');

const router = express.Router();

/**
 * @route GET /api/v1/exams/labs
 * @desc Get list of available labs
 * @access Public (mock exams) / Authenticated (full exams)
 */
router.get('/labs', optionalAuth, examController.getLabsList);

/**
 * @route POST /api/v1/exams
 * @desc Create a new exam
 * @access Public (mock exams) / Access pass required (full exams)
 */
router.post('/', optionalAuth, validateCreateExam, requireFullAccess, examController.createExam);

/**
 * @route GET /api/v1/exams/current
 * @desc Get the current active exam
 * @access Public
 */
router.get('/current', examController.getCurrentExam);

/**
 * @route GET /api/v1/exams/:examId/assets
 * @desc Get exam assets
 * @access Public
 */
router.get('/:examId/assets', examController.getExamAssets);

/**
 * @route GET /api/v1/exams/:examId/questions
 * @desc Get exam questions
 * @access Public (mock exams) / Access pass required (full exams)
 */
router.get('/:examId/questions', requireSessionAccess, examController.getExamQuestions);

/**
 * @route POST /api/v1/exams/:examId/evaluate
 * @desc Evaluate an exam
 * @access Public (mock exams) / Access pass required (full exams)
 */
router.post('/:examId/evaluate', requireSessionAccess, validateEvaluateExam, examController.evaluateExam);

/**
 * @route POST /api/v1/exams/:examId/terminate
 * @desc End an exam
 * @access Public
 */
router.post('/:examId/terminate', examController.endExam);

/**
 * @route GET /api/v1/exams/:examId/answers
 * @desc Get exam answers
 * @access Public
 */
router.get('/:examId/answers', examController.getExamAnswers);

/**
 * @route GET /api/v1/exams/:examId/status
 * @desc Get exam status
 * @access Public
 */
router.get('/:examId/status', examController.getExamStatus);

/**
 * @route GET /api/v1/exams/:examId/result
 * @desc Get exam result
 * @access Public
 */
router.get('/:examId/result', examController.getExamResult);

/**
 * @route POST /api/v1/exams/:examId/events
 * @desc Update exam events
 * @access Public (mock exams) / Access pass required (full exams)
 */
router.post('/:examId/events', requireSessionAccess, validateExamEvents, examController.updateExamEvents);

/**
 * @route POST /api/v1/exams/metrics/:examId
 * @desc Submit feedback metrics for an exam
 * @access Public
 */
router.post('/metrics/:examId', examController.submitMetrics);

module.exports = router; 
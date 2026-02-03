const express = require('express');
const examController = require('../controllers/examController');
const {
  validateCreateExam,
  validateEvaluateExam,
  validateExamEvents,
} = require('../middleware/validators');
const { optionalAuth } = require('../middleware/authMiddleware');
const {
  requireFullAccess,
  requireSessionAccess,
  requireExamOwnership,
} = require('../middleware/accessMiddleware');

const router = express.Router();

/**
 * @route GET /api/v1/exams/labs
 * @desc Get list of available labs
 * @access Public (mock exams) / Authenticated (full exams)
 */
router.get('/labs', optionalAuth, examController.getLabsList);

/**
 * @route POST /api/v1/exams
 * @desc Create a new exam (one active exam per user)
 * @access Public (mock exams) / Access pass required (full exams)
 */
router.post(
  '/',
  optionalAuth,
  validateCreateExam,
  requireFullAccess,
  examController.createExam
);

/**
 * @route GET /api/v1/exams/current
 * @desc Get the current active exam for the user (one per user when authenticated)
 * @access Public
 */
router.get('/current', optionalAuth, examController.getCurrentExam);

/**
 * @route GET /api/v1/exams/:examId/assets
 * @desc Get exam assets
 * @access Owner only (or mock/legacy)
 */
router.get(
  '/:examId/assets',
  optionalAuth,
  requireExamOwnership,
  examController.getExamAssets
);

/**
 * @route GET /api/v1/exams/:examId/questions
 * @desc Get exam questions
 * @access Owner + session access (mock/full)
 */
router.get(
  '/:examId/questions',
  optionalAuth,
  requireSessionAccess,
  examController.getExamQuestions
);

/**
 * @route POST /api/v1/exams/:examId/evaluate
 * @desc Evaluate an exam
 * @access Owner + session access
 */
router.post(
  '/:examId/evaluate',
  optionalAuth,
  requireSessionAccess,
  validateEvaluateExam,
  examController.evaluateExam
);

/**
 * @route POST /api/v1/exams/:examId/terminate
 * @desc End an exam
 * @access Owner only (or mock/legacy)
 */
router.post(
  '/:examId/terminate',
  optionalAuth,
  requireExamOwnership,
  examController.endExam
);

/**
 * @route GET /api/v1/exams/:examId/answers
 * @desc Get exam answers
 * @access Owner only (or mock/legacy)
 */
router.get(
  '/:examId/answers',
  optionalAuth,
  requireExamOwnership,
  examController.getExamAnswers
);

/**
 * @route GET /api/v1/exams/:examId/status
 * @desc Get exam status
 * @access Owner only (or mock/legacy)
 */
router.get(
  '/:examId/status',
  optionalAuth,
  requireExamOwnership,
  examController.getExamStatus
);

/**
 * @route GET /api/v1/exams/:examId/result
 * @desc Get exam result
 * @access Owner only (or mock/legacy)
 */
router.get(
  '/:examId/result',
  optionalAuth,
  requireExamOwnership,
  examController.getExamResult
);

/**
 * @route POST /api/v1/exams/:examId/events
 * @desc Update exam events
 * @access Owner + session access
 */
router.post(
  '/:examId/events',
  optionalAuth,
  requireSessionAccess,
  validateExamEvents,
  examController.updateExamEvents
);

/**
 * @route POST /api/v1/exams/metrics/:examId
 * @desc Submit feedback metrics for an exam
 * @access Owner only (session isolation)
 */
router.post(
  '/metrics/:examId',
  optionalAuth,
  requireExamOwnership,
  examController.submitMetrics
);

module.exports = router;

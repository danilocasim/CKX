/**
 * Terminal session routes
 * All terminal access validated server-side by user_id + exam_session_id.
 */

const express = require('express');
const terminalController = require('../controllers/terminalController');
const { optionalAuth } = require('../middleware/authMiddleware');
const { requireExamOwnership } = require('../middleware/accessMiddleware');

const router = express.Router();

/**
 * @route GET /api/v1/terminal/validate
 * @desc Validate that the authenticated user can connect to the terminal for this exam
 * @query examId - Exam (session) ID
 * @access Authenticated; returns 403 if user does not own exam/terminal session
 */
router.get(
  '/validate',
  optionalAuth,
  terminalController.validateTerminalAccess
);

/**
 * @route GET /api/v1/terminal/session/:examId
 * @desc Get terminal session for an exam (owner only)
 * @access Owner only (requireExamOwnership)
 */
router.get(
  '/session/:examId',
  optionalAuth,
  requireExamOwnership,
  terminalController.getTerminalSession
);

module.exports = router;

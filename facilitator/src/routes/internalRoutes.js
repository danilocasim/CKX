/**
 * Internal API Routes (CKX Execution Engine)
 *
 * These endpoints are ONLY accessible by Sailor-Client (service-to-service).
 * Browsers must NEVER call these directly.
 *
 * All requests require:
 * - Service authentication (HMAC or service token)
 * - Session context (exam_session_id, user_id, expires_at)
 */

const express = require('express');
const router = express.Router();
const internalController = require('../controllers/internalController');
const {
  requireServiceAuth,
  requireSessionContext,
} = require('../middleware/serviceAuthMiddleware');

/**
 * @route POST /internal/exams/start
 * @desc Start isolated exam runtime (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 *
 * Body:
 * - exam_session_id: UUID (from Sailor-Client)
 * - user_id: UUID (from Sailor-Client)
 * - expires_at: ISO timestamp (from Sailor-Client)
 * - exam_template_id: string (lab ID)
 * - asset_path: string (path to exam assets)
 * - config: object (exam configuration)
 */
router.post(
  '/exams/start',
  requireServiceAuth,
  requireSessionContext,
  internalController.startExamRuntime
);

/**
 * @route POST /internal/exams/terminate
 * @desc Terminate exam runtime (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 *
 * Body:
 * - exam_session_id: UUID
 * - user_id: UUID (for validation)
 */
router.post(
  '/exams/terminate',
  requireServiceAuth,
  requireSessionContext,
  internalController.terminateExamRuntime
);

/**
 * @route GET /internal/runtime/routing
 * @desc Get VNC/SSH routing for exam session (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 *
 * Query params:
 * - exam_session_id: UUID
 * - user_id: UUID (for validation)
 */
router.get(
  '/runtime/routing',
  requireServiceAuth,
  internalController.getRuntimeRouting
);

/**
 * @route POST /internal/exams/validate-access
 * @desc Validate that a session is still valid (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 *
 * Body:
 * - exam_session_id: UUID
 * - user_id: UUID
 */
router.post(
  '/exams/validate-access',
  requireServiceAuth,
  internalController.validateAccess
);

/**
 * @route POST /internal/exams/evaluate
 * @desc Evaluate exam solutions (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 *
 * Body:
 * - exam_session_id: UUID
 * - user_id: UUID
 * - answers: object (user answers)
 */
router.post(
  '/exams/evaluate',
  requireServiceAuth,
  requireSessionContext,
  internalController.evaluateExam
);

/**
 * @route GET /internal/exams/:examSessionId/status
 * @desc Get exam runtime status (called by Sailor-Client)
 * @access Service only (Sailor-Client)
 */
router.get(
  '/exams/:examSessionId/status',
  requireServiceAuth,
  internalController.getRuntimeStatus
);

module.exports = router;

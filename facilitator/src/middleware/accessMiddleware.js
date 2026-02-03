/**
 * Access Middleware
 * Enforces access pass requirements for full exams
 */

const accessService = require('../services/accessService');
const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');
const fs = require('fs');
const path = require('path');

/**
 * Get lab info from labs.json
 * @param {string} labId - The lab ID
 * @returns {Object|null} Lab info or null
 */
function getLabInfo(labId) {
  try {
    const labsPath = path.join(__dirname, '../../assets/exams/labs.json');
    const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
    return labsData.labs.find((l) => l.id === labId) || null;
  } catch (error) {
    logger.error('Failed to load lab info', { error: error.message, labId });
    return null;
  }
}

/**
 * Middleware to require a valid access pass for full exams
 * - Mock exams (isFree: true) are always allowed
 * - Full exams require an active access pass
 * - Auto-activates pending passes when starting a full exam
 */
async function requireFullAccess(req, res, next) {
  const { labId } = req.body;
  const userId = req.userId;

  if (!labId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'labId is required',
    });
  }

  // Get lab info
  const lab = getLabInfo(labId);
  if (!lab) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Lab "${labId}" not found`,
    });
  }

  // Mock/free exams are always allowed
  if (lab.isFree || lab.type === 'mock') {
    logger.debug('Mock exam access granted', { labId, userId });
    req.examType = 'mock';
    return next();
  }

  // Full exams require authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message:
        'Authentication required for full exams. Please login or try a mock exam.',
    });
  }

  // Check for valid access pass
  try {
    // Auto-activate pending pass if user has one
    const access = await accessService.ensureActivePass(userId);

    if (!access.hasValidPass) {
      logger.info('Access denied - no valid pass', { userId, labId });
      return res.status(403).json({
        success: false,
        error: 'Access Required',
        message: 'An active access pass is required for full exams.',
        data: {
          hasPendingPass: access.hasPendingPass,
          pricing: '/pricing',
        },
      });
    }

    // Attach access info to request for logging/analytics
    req.accessPass = access;
    req.examType = 'full';

    logger.debug('Full exam access granted', {
      userId,
      labId,
      passType: access.passType,
      hoursRemaining: access.hoursRemaining,
    });

    next();
  } catch (error) {
    logger.error('Access check failed', {
      error: error.message,
      userId,
      labId,
    });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to verify access',
    });
  }
}

/**
 * Middleware to check access status (doesn't block, just attaches info)
 * Useful for endpoints that work for both authenticated and anonymous users
 */
async function checkAccess(req, res, next) {
  const userId = req.userId;

  if (!userId) {
    req.access = { hasValidPass: false, anonymous: true };
    return next();
  }

  try {
    const access = await accessService.checkUserAccess(userId);
    req.access = access;
    next();
  } catch (error) {
    logger.error('Access check failed', { error: error.message, userId });
    req.access = { hasValidPass: false, error: true };
    next();
  }
}

/**
 * Middleware to enforce session ownership.
 * STRICT ISOLATION: Validates ownership using exam_sessions table (Sailor-Client owns this).
 * Never trusts Redis - only PostgreSQL exam_sessions table.
 * - Returns 404 if exam not found or not owned (do not leak existence).
 * - Sets req.examInfo for downstream use.
 */
async function requireExamOwnership(req, res, next) {
  const examId = req.params.examId; // This should be exam_session_id from Sailor-Client
  const userId = req.userId;

  if (!examId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'examId is required',
    });
  }

  // STRICT ISOLATION: Check exam_sessions table (Sailor-Client owns this)
  // Never trust Redis - only PostgreSQL exam_sessions table
  try {
    const db = require('../utils/db');
    const result = await db.query(
      `SELECT * FROM exam_sessions 
       WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [examId, userId]
    );

    if (result.rows.length === 0) {
      logger.warn(
        'ISOLATION BREACH PREVENTED: Exam session not found or not owned',
        {
          examId,
          userId,
        }
      );
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    const examSession = result.rows[0];
    req.examInfo = {
      id: examSession.id,
      exam_session_id: examSession.id,
      user_id: examSession.user_id,
      lab_id: examSession.lab_id,
      exam_type: examSession.exam_type,
      status: examSession.status,
      expires_at: examSession.expires_at,
    };
    next();
  } catch (error) {
    logger.error('Ownership check failed', {
      error: error.message,
      examId,
      userId,
    });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to verify session access',
    });
  }
}

/**
 * Middleware to validate ongoing session access for full exams.
 * Fetches exam only by (examId + userId); never by examId alone.
 * - Returns 404 if exam not found or not owned.
 * - Mock exams bypass access validation; full exams require valid pass.
 */
async function requireSessionAccess(req, res, next) {
  const examId = req.params.examId;
  const userId = req.userId;

  if (!examId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'examId is required',
    });
  }

  try {
    const examInfo = await redisClient.getExamInfoForUser(examId, userId);
    if (!examInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Exam not found',
      });
    }
    req.examInfo = examInfo;

    // Mock exams bypass access validation
    if (examSession.exam_type === 'mock' || examSession.exam_type === 'mock') {
      logger.debug('Mock exam session - access check bypassed', { examId });
      return next();
    }

    // Full exams: Check access pass (Sailor-Client owns this logic)
    // Note: Access pass validation is handled by Sailor-Client before creating exam_session
    // CKX only enforces expires_at (time enforcement)
    // If we reach here, the session exists and belongs to the user, so allow access
    logger.debug('Full exam session - access validated by Sailor-Client', {
      examId,
      userId,
      expires_at: examSession.expires_at,
    });

    next();
  } catch (error) {
    logger.error('Session access check failed', {
      error: error.message,
      examId,
    });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to verify session access',
    });
  }
}

module.exports = {
  requireFullAccess,
  checkAccess,
  requireSessionAccess,
  requireExamOwnership,
};

/**
 * Terminal Controller
 * Validates terminal access: terminal_session must be bound to user_id + exam_session_id.
 * All checks server-side; no client can connect without passing validation.
 */

const terminalSessionService = require('../services/terminalSessionService');
const runtimeSessionService = require('../services/runtimeSessionService');
const logger = require('../utils/logger');

/**
 * Validate terminal attach for /ssh websocket.
 * Requires: terminalSessionId, examId in query; Authorization Bearer token.
 * Validates: token -> userId; terminal_session belongs to userId and examId; session active.
 * Runtime is keyed by terminalSessionId only (no shared SSH by examId).
 */
async function validateTerminalAccess(req, res) {
  const terminalSessionId = req.query.terminalSessionId;
  const examId = req.query.examId;
  const userId = req.userId;

  if (!terminalSessionId || !examId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'terminalSessionId and examId are required',
    });
  }

  if (!userId) {
    logger.warn('SECURITY: Terminal attach rejected - no authenticated user', {
      terminalSessionId,
      examId,
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required to connect to terminal',
    });
  }

  try {
    const session = await terminalSessionService.validateAttach(
      terminalSessionId,
      examId,
      userId
    );
    if (!session) {
      logger.warn('SECURITY: Terminal attach validation failed', {
        terminalSessionId,
        examId,
        userId,
      });
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Terminal session not available or access denied',
      });
    }

    logger.info('Terminal attach validated (user-scoped runtime)', {
      terminal_session_id: session.id,
      exam_session_id: examId,
      user_id: userId,
    });

    const routing = await runtimeSessionService.getRoutingForUser(
      examId,
      userId
    );
    const sshHost = routing?.ssh?.host || null;
    const sshPort = routing?.ssh?.port ?? null;

    // STRICT ISOLATION: Authenticated users must have dedicated SSH target — never fall back to shared
    if (userId != null && (!sshHost || sshPort == null)) {
      logger.warn(
        'ISOLATION BREACH PREVENTED: No dedicated SSH routing for authenticated user',
        { examId, userId, terminal_session_id: session.id }
      );
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message:
          'Dedicated terminal runtime is required but unavailable. Please end this exam and try again.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        valid: true,
        terminalSessionId: session.id,
        examSessionId: examId,
        expiresAt: session.expires_at,
        sshHost,
        sshPort,
      },
    });
  } catch (error) {
    logger.error('Terminal validate failed', {
      error: error.message,
      terminalSessionId,
      examId,
      userId,
    });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to validate terminal access',
    });
  }
}

/**
 * Get terminal session for an exam (owner only).
 * GET /api/v1/terminal/session/:examId
 * Uses requireExamOwnership so examId + userId are validated.
 * STRICT ISOLATION: Validates ownership from exam_sessions table.
 */
async function getTerminalSession(req, res) {
  const examId = req.params.examId; // This should be exam_session_id from Sailor-Client
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  try {
    // STRICT ISOLATION: Validate ownership from exam_sessions table first
    const db = require('../utils/db');
    const examResult = await db.query(
      `SELECT * FROM exam_sessions 
       WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [examId, userId]
    );

    if (examResult.rows.length === 0) {
      logger.warn(
        'ISOLATION BREACH PREVENTED: Terminal session access denied - user does not own exam session',
        {
          examId,
          userId,
        }
      );
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to this exam session.',
      });
    }

    const session = await terminalSessionService.validateAccess(examId, userId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Terminal session not found or not active',
      });
    }

    const routing = await runtimeSessionService.getRoutingForUser(
      examId,
      userId
    );
    const sshHost = routing?.ssh?.host || null;
    const sshPort = routing?.ssh?.port ?? null;

    return res.status(200).json({
      success: true,
      data: {
        id: session.id,
        examSessionId: session.exam_session_id,
        status: session.status,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
        sshHost,
        sshPort,
      },
    });
  } catch (error) {
    logger.error('Get terminal session failed', {
      error: error.message,
      examId,
      userId,
    });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to get terminal session',
    });
  }
}

module.exports = {
  validateTerminalAccess,
  getTerminalSession,
};

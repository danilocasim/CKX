/**
 * Terminal Controller
 * Validates terminal access: terminal_session must be bound to user_id + exam_session_id.
 * All checks server-side; no client can connect without passing validation.
 */

const terminalSessionService = require('../services/terminalSessionService');
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

    return res.status(200).json({
      success: true,
      data: {
        valid: true,
        terminalSessionId: session.id,
        examSessionId: examId,
        expiresAt: session.expires_at,
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
 */
async function getTerminalSession(req, res) {
  const examId = req.params.examId;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  try {
    const session = await terminalSessionService.validateAccess(examId, userId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Terminal session not found or not active',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: session.id,
        examSessionId: session.exam_session_id,
        status: session.status,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
      },
    });
  } catch (error) {
    logger.error('Get terminal session failed', {
      error: error.message,
      examId,
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

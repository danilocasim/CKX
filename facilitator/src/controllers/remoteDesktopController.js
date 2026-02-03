const remoteDesktopService = require('../services/remoteDesktopService');
const runtimeSessionService = require('../services/runtimeSessionService');
const logger = require('../utils/logger');

/**
 * Controller for handling remote desktop operations
 */
class RemoteDesktopController {
  /**
   * Get VNC (and optionally SSH) routing for the current user's exam.
   * Validates ownership; returns dedicated host/port when SESSION_MODE=ISOLATED, else useShared.
   * @param {Object} req - Express request (req.params.examId, req.userId from requireExamOwnership + optionalAuth)
   * @param {Object} res - Express response
   */
  async getRouting(req, res) {
    try {
      const examId = req.params.examId; // This should be exam_session_id from Sailor-Client
      const userId = req.userId;
      if (!examId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'examId is required',
        });
      }

      // STRICT ISOLATION: Validate ownership from exam_sessions table first
      if (userId != null) {
        const db = require('../utils/db');
        const result = await db.query(
          `SELECT * FROM exam_sessions 
           WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > NOW()`,
          [examId, userId]
        );

        if (result.rows.length === 0) {
          logger.warn(
            'ISOLATION BREACH PREVENTED: VNC routing denied - user does not own exam session',
            {
              examId,
              userId,
            }
          );
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have access to this exam session.',
          });
        }
      }

      const routing = await runtimeSessionService.getRoutingForUser(
        examId,
        userId
      );
      if (routing) {
        return res.status(200).json({
          vnc: routing.vnc,
          ssh: routing.ssh,
          useShared: false,
        });
      }
      // STRICT ISOLATION: Authenticated users must have dedicated runtime — never fall back to shared
      if (userId != null) {
        logger.warn(
          'ISOLATION BREACH PREVENTED: No dedicated runtime for authenticated user',
          {
            examId,
            userId,
          }
        );
        return res.status(403).json({
          error: 'Forbidden',
          message:
            'Dedicated runtime is required but unavailable. Please end this exam and try again.',
        });
      }
      // Anonymous users can use shared (mock exams)
      return res.status(200).json({
        useShared: true,
        message: 'Use default shared VNC/SSH endpoint',
      });
    } catch (error) {
      logger.error('Error in getRouting controller', { error: error.message });
      return res.status(500).json({
        error: 'Error',
        message: 'Failed to get routing',
      });
    }
  }
  /**
   * Copy content to remote desktop clipboard
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async copyToClipboard(req, res) {
    try {
      const { content } = req.body;

      if (!content) {
        return res.sendStatus(400);
      }

      await remoteDesktopService.copyToClipboard(content);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error in copyToClipboard controller', {
        error: error.message,
      });
      res.sendStatus(500);
    }
  }
}

module.exports = new RemoteDesktopController();

/**
 * Session Controller
 *
 * Handles HTTP requests for session management API.
 * Provides RESTful endpoints for session lifecycle operations.
 */

const sessionOrchestrator = require('../services/sessionOrchestrator');
const portAllocator = require('../services/portAllocator');
const logger = require('../utils/logger');

/**
 * Create a new session
 * POST /api/v1/sessions
 */
const createSession = async (req, res) => {
  try {
    const { sessionId, options = {} } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'sessionId is required'
      });
    }

    // Check if session already exists
    const existing = await sessionOrchestrator.getSessionInfo(sessionId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: `Session ${sessionId} already exists`
      });
    }

    // Initialize the session
    const sessionInfo = await sessionOrchestrator.initializeSession(sessionId, options);

    logger.info(`Session created: ${sessionId}`);

    res.status(201).json({
      success: true,
      data: {
        sessionId: sessionInfo.id,
        state: sessionInfo.state,
        mode: sessionInfo.mode,
        ports: sessionInfo.ports,
        createdAt: sessionInfo.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to create session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * List all active sessions
 * GET /api/v1/sessions
 */
const listSessions = async (req, res) => {
  try {
    const sessions = await sessionOrchestrator.getAllSessions();

    // Filter by state if requested
    const { state } = req.query;
    let filteredSessions = sessions;
    if (state) {
      filteredSessions = sessions.filter(s => s.state === state.toUpperCase());
    }

    res.json({
      success: true,
      data: {
        count: filteredSessions.length,
        sessions: filteredSessions.map(s => ({
          sessionId: s.id,
          state: s.state,
          mode: s.mode,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }))
      }
    });
  } catch (error) {
    logger.error('Failed to list sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Get session metadata
 * GET /api/v1/sessions/:sessionId
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionInfo = await sessionOrchestrator.getSessionInfo(sessionId);

    if (!sessionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Session ${sessionId} not found`
      });
    }

    res.json({
      success: true,
      data: sessionInfo
    });
  } catch (error) {
    logger.error(`Failed to get session ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Get session status
 * GET /api/v1/sessions/:sessionId/status
 */
const getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionInfo = await sessionOrchestrator.getSessionInfo(sessionId);

    if (!sessionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Session ${sessionId} not found`
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: sessionInfo.id,
        state: sessionInfo.state,
        createdAt: sessionInfo.createdAt,
        updatedAt: sessionInfo.updatedAt,
        activatedAt: sessionInfo.activatedAt || null,
        terminatedAt: sessionInfo.terminatedAt || null,
        error: sessionInfo.error || null
      }
    });
  } catch (error) {
    logger.error(`Failed to get session status ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Terminate a session
 * DELETE /api/v1/sessions/:sessionId
 */
const terminateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Check if session exists
    const sessionInfo = await sessionOrchestrator.getSessionInfo(sessionId);
    if (!sessionInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Session ${sessionId} not found`
      });
    }

    await sessionOrchestrator.terminateSession(sessionId);

    logger.info(`Session terminated: ${sessionId}`);

    res.json({
      success: true,
      data: {
        sessionId,
        message: 'Session terminated successfully'
      }
    });
  } catch (error) {
    logger.error(`Failed to terminate session ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Terminate all sessions
 * DELETE /api/v1/sessions/all
 */
const terminateAllSessions = async (req, res) => {
  try {
    const sessions = await sessionOrchestrator.listSessions();
    const sessionIds = sessions.map(s => s.sessionId || s.id);
    
    let terminated = 0;
    let failed = 0;
    
    for (const sessionId of sessionIds) {
      try {
        await sessionOrchestrator.terminateSession(sessionId);
        terminated++;
      } catch (err) {
        logger.error(`Failed to terminate session ${sessionId}:`, err);
        failed++;
      }
    }

    logger.info(`Terminated ${terminated} sessions, ${failed} failed`);

    res.json({
      success: true,
      data: {
        terminated,
        failed,
        message: `Terminated ${terminated} session(s)${failed > 0 ? `, ${failed} failed` : ''}`
      }
    });
  } catch (error) {
    logger.error('Failed to terminate all sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Get session routing information
 * GET /api/v1/sessions/:sessionId/routing
 */
const getSessionRouting = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const routing = await sessionOrchestrator.getSessionRouting(sessionId);

    if (!routing) {
      // Return default routing for backward compatibility
      return res.json({
        success: true,
        data: {
          sessionId,
          mode: 'SHARED',
          vnc: {
            host: process.env.VNC_HOST || 'remote-desktop',
            port: parseInt(process.env.VNC_PORT || '6901', 10)
          },
          ssh: {
            host: process.env.SSH_HOST || 'remote-terminal',
            port: parseInt(process.env.SSH_PORT || '22', 10)
          }
        }
      });
    }

    res.json({
      success: true,
      data: routing
    });
  } catch (error) {
    logger.error(`Failed to get routing for ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Get session ports
 * GET /api/v1/sessions/:sessionId/ports
 */
const getSessionPorts = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const ports = await portAllocator.getSessionPorts(sessionId);

    if (!ports) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `No port allocations found for session ${sessionId}`
      });
    }

    res.json({
      success: true,
      data: ports
    });
  } catch (error) {
    logger.error(`Failed to get ports for ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Get session statistics
 * GET /api/v1/sessions/stats
 */
const getStats = async (req, res) => {
  try {
    const stats = await sessionOrchestrator.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get session stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

/**
 * Activate a session (mark as in-use)
 * POST /api/v1/sessions/:sessionId/activate
 */
const activateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionInfo = await sessionOrchestrator.activateSession(sessionId);

    res.json({
      success: true,
      data: {
        sessionId: sessionInfo.id,
        state: sessionInfo.state,
        activatedAt: sessionInfo.activatedAt
      }
    });
  } catch (error) {
    logger.error(`Failed to activate session ${req.params.sessionId}:`, error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
    }

    if (error.message.includes('not ready')) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

module.exports = {
  createSession,
  listSessions,
  getSession,
  getSessionStatus,
  terminateSession,
  terminateAllSessions,
  getSessionRouting,
  getSessionPorts,
  getStats,
  activateSession
};

/**
 * Internal Controller (CKX Execution Engine)
 *
 * Handles all internal API requests from Sailor-Client.
 * Enforces strict isolation and never trusts browser requests.
 */

const logger = require('../utils/logger');
const runtimeSessionService = require('../services/runtimeSessionService');
const examService = require('../services/examService');
const redisClient = require('../utils/redisClient');
const jumphostService = require('../services/jumphostService');
const portAllocator = require('../services/portAllocator');
const fs = require('fs');
const path = require('path');

/**
 * Start isolated exam runtime
 * CKX creates runtime resources but does NOT create exam_session (Sailor-Client owns that)
 */
async function startExamRuntime(req, res) {
  const {
    exam_session_id,
    user_id,
    expires_at,
    exam_template_id,
    asset_path,
    config: examConfig,
  } = req.body;
  const sessionContext = req.sessionContext;

  logger.info('Starting exam runtime (internal API)', {
    exam_session_id,
    user_id,
    expires_at,
    exam_template_id,
    service: req.serviceAuth?.service,
  });

  try {
    // STRICT ENFORCEMENT: Validate session context matches request body
    if (
      sessionContext.exam_session_id !== exam_session_id ||
      sessionContext.user_id !== user_id
    ) {
      logger.error('ISOLATION BREACH PREVENTED: Session context mismatch', {
        sessionContext,
        body: { exam_session_id, user_id },
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Session context validation failed',
      });
    }

    // Check if runtime already exists (should not happen, but fail if it does)
    const existingRuntime = await runtimeSessionService.getByExamId(
      exam_session_id
    );
    if (existingRuntime) {
      if (String(existingRuntime.user_id) !== String(user_id)) {
        logger.error(
          'ISOLATION BREACH PREVENTED: Runtime exists for different user',
          {
            exam_session_id,
            requested_user_id: user_id,
            existing_user_id: existingRuntime.user_id,
          }
        );
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Runtime session exists for different user',
        });
      }
      // Runtime exists and belongs to this user - return existing routing
      const routing = await runtimeSessionService.getRoutingForUser(
        exam_session_id,
        user_id
      );
      return res.status(200).json({
        success: true,
        exam_session_id,
        runtime_exists: true,
        routing,
      });
    }

    // Allocate ports for this session
    let sessionPorts;
    try {
      sessionPorts = await portAllocator.allocateSessionPorts(exam_session_id);
      logger.info(
        `Allocated ports for session ${exam_session_id}:`,
        sessionPorts
      );
    } catch (portError) {
      logger.error(`Failed to allocate ports for session ${exam_session_id}`, {
        error: portError.message,
      });
      return res.status(500).json({
        error: 'Resource Allocation Failed',
        message: 'Unable to allocate ports for new session',
        details: portError.message,
      });
    }

    // Create isolated runtime (VNC + SSH containers)
    try {
      await runtimeSessionService.create(exam_session_id, user_id, expires_at);
    } catch (runtimeErr) {
      logger.error('ISOLATION BREACH PREVENTED: Runtime creation failed', {
        exam_session_id,
        user_id,
        error: runtimeErr.message,
        stack: runtimeErr.stack,
      });
      // Release ports on failure
      try {
        await portAllocator.releaseSessionPorts(exam_session_id);
      } catch (releaseErr) {
        logger.error('Failed to release ports after runtime creation failure', {
          exam_session_id,
          error: releaseErr.message,
        });
      }
      return res.status(500).json({
        error: 'Runtime Unavailable',
        message: 'Could not start isolated exam environment',
        details: runtimeErr.message,
        stack:
          process.env.NODE_ENV === 'development' ? runtimeErr.stack : undefined,
      });
    }

    // Store exam info in Redis (CKX needs this for runtime operations)
    // Note: Sailor-Client owns the exam_session record, but CKX needs runtime metadata
    const examData = {
      exam_session_id,
      user_id,
      exam_template_id,
      asset_path,
      config: examConfig,
      started_at: new Date().toISOString(),
      expires_at,
    };
    const ttlSeconds = Math.min(
      Math.max(
        60,
        Math.ceil((new Date(expires_at).getTime() - Date.now()) / 1000)
      ),
      48 * 3600
    );
    await redisClient.persistExamInfo(exam_session_id, examData, ttlSeconds);
    await redisClient.persistExamStatus(exam_session_id, 'CREATED', ttlSeconds);
    await redisClient.registerSession(exam_session_id, ttlSeconds);

    // Set up exam environment asynchronously (K8s namespace, etc.)
    const nodeCount = examConfig?.workerNodes || 1;
    setupExamEnvironmentAsync(exam_session_id, nodeCount, sessionPorts);

    // Get routing information
    const routing = await runtimeSessionService.getRoutingForUser(
      exam_session_id,
      user_id
    );
    if (!routing) {
      logger.error('Failed to get routing after runtime creation', {
        exam_session_id,
        user_id,
      });
      return res.status(500).json({
        error: 'Runtime Error',
        message: 'Runtime created but routing unavailable',
      });
    }

    logger.info('Exam runtime started successfully', {
      exam_session_id,
      user_id,
      vnc_host: routing.vnc.host,
      ssh_host: routing.ssh.host,
    });

    return res.status(201).json({
      success: true,
      exam_session_id,
      routing,
      ports: sessionPorts,
      status: 'CREATED',
    });
  } catch (error) {
    logger.error('Error starting exam runtime', {
      exam_session_id,
      user_id,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start exam runtime',
      details: error.message,
    });
  }
}

/**
 * Terminate exam runtime
 * CKX destroys runtime resources but does NOT delete exam_session (Sailor-Client owns that)
 */
async function terminateExamRuntime(req, res) {
  const { exam_session_id, user_id } = req.body;
  const sessionContext = req.sessionContext;

  logger.info('Terminating exam runtime (internal API)', {
    exam_session_id,
    user_id,
    service: req.serviceAuth?.service,
  });

  try {
    // Validate ownership
    if (
      sessionContext.exam_session_id !== exam_session_id ||
      sessionContext.user_id !== user_id
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Session context validation failed',
      });
    }

    // Terminate runtime session (stops containers, cleans up)
    await runtimeSessionService.terminate(exam_session_id);

    // Clean up exam environment (K8s namespace, etc.)
    try {
      await jumphostService.cleanupExamEnvironment(exam_session_id);
    } catch (cleanupErr) {
      logger.error('Error cleaning up exam environment', {
        exam_session_id,
        error: cleanupErr.message,
      });
    }

    // Release ports
    try {
      await portAllocator.releaseSessionPorts(exam_session_id);
    } catch (portErr) {
      logger.error('Error releasing ports', {
        exam_session_id,
        error: portErr.message,
      });
    }

    // Remove from Redis (CKX cleanup - Sailor-Client still owns exam_session record)
    await redisClient.unregisterSession(exam_session_id);
    await redisClient.deleteExamInfo(exam_session_id);
    await redisClient.deleteExamStatus(exam_session_id);

    return res.status(200).json({
      success: true,
      exam_session_id,
      message: 'Runtime terminated',
    });
  } catch (error) {
    logger.error('Error terminating exam runtime', {
      exam_session_id,
      user_id,
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to terminate exam runtime',
      details: error.message,
    });
  }
}

/**
 * Get runtime routing (VNC/SSH endpoints)
 */
async function getRuntimeRouting(req, res) {
  const { exam_session_id, user_id } = req.query;

  if (!exam_session_id || !user_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'exam_session_id and user_id are required',
    });
  }

  logger.info('Getting runtime routing (internal API)', {
    exam_session_id,
    user_id,
    service: req.serviceAuth?.service,
  });

  try {
    const routing = await runtimeSessionService.getRoutingForUser(
      exam_session_id,
      user_id
    );

    if (!routing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Runtime routing not found or not accessible',
      });
    }

    return res.status(200).json({
      success: true,
      exam_session_id,
      routing,
    });
  } catch (error) {
    logger.error('Error getting runtime routing', {
      exam_session_id,
      user_id,
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get runtime routing',
      details: error.message,
    });
  }
}

/**
 * Validate access to exam session
 * CKX enforces expires_at strictly (does not calculate time, only enforces)
 */
async function validateAccess(req, res) {
  const { exam_session_id, user_id } = req.body;

  if (!exam_session_id || !user_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'exam_session_id and user_id are required',
    });
  }

  try {
    // Get runtime session
    const runtime = await runtimeSessionService.getByExamId(exam_session_id);
    if (!runtime) {
      return res.status(404).json({
        valid: false,
        reason: 'Runtime not found',
      });
    }

    // Validate ownership
    if (String(runtime.user_id) !== String(user_id)) {
      return res.status(403).json({
        valid: false,
        reason: 'Runtime belongs to different user',
      });
    }

    // STRICT ENFORCEMENT: Check expires_at (CKX does not calculate, only enforces)
    const expiresAt = new Date(runtime.expires_at);
    const now = new Date();
    if (now >= expiresAt) {
      return res.status(200).json({
        valid: false,
        reason: 'Session expired',
        expires_at: runtime.expires_at,
        now: now.toISOString(),
      });
    }

    // Check runtime status
    if (runtime.status !== 'active') {
      return res.status(200).json({
        valid: false,
        reason: `Runtime status is ${runtime.status}`,
      });
    }

    return res.status(200).json({
      valid: true,
      expires_at: runtime.expires_at,
      status: runtime.status,
    });
  } catch (error) {
    logger.error('Error validating access', {
      exam_session_id,
      user_id,
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate access',
      details: error.message,
    });
  }
}

/**
 * Evaluate exam solutions
 */
async function evaluateExam(req, res) {
  const { exam_session_id, user_id, answers } = req.body;
  const sessionContext = req.sessionContext;

  if (!answers) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'answers are required',
    });
  }

  logger.info('Evaluating exam (internal API)', {
    exam_session_id,
    user_id,
    service: req.serviceAuth?.service,
  });

  try {
    // Validate session context
    if (
      sessionContext.exam_session_id !== exam_session_id ||
      sessionContext.user_id !== user_id
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Session context validation failed',
      });
    }

    // Use existing exam service evaluation logic
    const result = await examService.evaluateExam(exam_session_id, { answers });

    return res.status(200).json({
      success: true,
      exam_session_id,
      ...result,
    });
  } catch (error) {
    logger.error('Error evaluating exam', {
      exam_session_id,
      user_id,
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to evaluate exam',
      details: error.message,
    });
  }
}

/**
 * Get runtime status
 */
async function getRuntimeStatus(req, res) {
  const { examSessionId } = req.params;
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'user_id is required',
    });
  }

  try {
    const runtime = await runtimeSessionService.getByExamId(examSessionId);
    if (!runtime) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Runtime not found',
      });
    }

    // Validate ownership
    if (String(runtime.user_id) !== String(user_id)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Runtime belongs to different user',
      });
    }

    const examStatus = await redisClient.getExamStatus(examSessionId);

    return res.status(200).json({
      success: true,
      exam_session_id: examSessionId,
      runtime_status: runtime.status,
      exam_status: examStatus || 'UNKNOWN',
      expires_at: runtime.expires_at,
      has_containers: !!(runtime.vnc_container_id && runtime.ssh_container_id),
    });
  } catch (error) {
    logger.error('Error getting runtime status', {
      examSessionId,
      user_id,
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get runtime status',
      details: error.message,
    });
  }
}

/**
 * Set up exam environment asynchronously (K8s namespace, etc.)
 */
async function setupExamEnvironmentAsync(
  examSessionId,
  nodeCount,
  sessionPorts
) {
  try {
    const result = await jumphostService.setupExamEnvironment(
      examSessionId,
      nodeCount,
      sessionPorts
    );

    if (!result.success) {
      logger.error(
        `Failed to set up exam environment for exam ${examSessionId}`,
        {
          error: result.error,
          details: result.details,
        }
      );
      await redisClient.persistExamStatus(examSessionId, 'PREPARATION_FAILED');
      return;
    }

    logger.info(
      `Exam environment set up successfully for exam ${examSessionId}`
    );
    await redisClient.persistExamStatus(examSessionId, 'READY');
  } catch (error) {
    logger.error(
      `Unexpected error setting up exam environment for exam ${examSessionId}`,
      {
        error: error.message,
      }
    );
    await redisClient.persistExamStatus(examSessionId, 'PREPARATION_FAILED');
  }
}

module.exports = {
  startExamRuntime,
  terminateExamRuntime,
  getRuntimeRouting,
  validateAccess,
  evaluateExam,
  getRuntimeStatus,
};

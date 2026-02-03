/**
 * Exam Service
 * Handles all business logic for exam operations
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');
const jumphostService = require('./jumphostService');
const MetricService = require('./metricService');
const portAllocator = require('./portAllocator');
const countdownService = require('./countdownService');
const terminalSessionService = require('./terminalSessionService');

// Configuration for multi-session limits
const MAX_CONCURRENT_SESSIONS = parseInt(
  process.env.MAX_CONCURRENT_SESSIONS || '10',
  10
);

/**
 * Create a new exam
 * Multi-session support: Multiple exams can run concurrently.
 * One active exam per user: authenticated users can have only one active exam at a time.
 *
 * @param {Object} examData - The exam data (may include userId for ownership)
 * @returns {Promise<Object>} Result object with success status and data
 */
async function createExam(examData) {
  try {
    const userId = examData.userId != null ? examData.userId : null;

    // One active exam per user: if user is authenticated, check they don't already have an active exam
    if (userId != null) {
      const activeSessions = await redisClient.getActiveSessions();
      for (const examId of activeSessions) {
        const info = await redisClient.getExamInfo(examId);
        if (
          info &&
          info.userId != null &&
          String(info.userId) === String(userId)
        ) {
          logger.info(`User ${userId} already has an active exam: ${examId}`);
          return {
            success: false,
            error: 'Exam already exists',
            message:
              'You already have an active exam. Only one active exam per user is allowed. End or complete it before starting a new one.',
            currentExamId: examId,
          };
        }
      }
    }

    // Multi-session: Check capacity before creating new exam
    const activeSessions = await redisClient.getActiveSessions();
    const sessionCount = activeSessions.length;

    // Enforce session limit to prevent resource exhaustion
    if (sessionCount >= MAX_CONCURRENT_SESSIONS) {
      logger.warn(
        `Session limit reached: ${sessionCount}/${MAX_CONCURRENT_SESSIONS}`
      );
      return {
        success: false,
        error: 'Capacity Reached',
        message: `Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached. Please try again later.`,
        activeSessions: sessionCount,
      };
    }

    if (sessionCount > 0) {
      logger.info(
        `Creating new exam. Currently ${sessionCount} active session(s): ${activeSessions.join(
          ', '
        )}`
      );
    }

    const examId = uuidv4();

    // Allocate ports for this session BEFORE any other setup
    let sessionPorts;
    try {
      sessionPorts = await portAllocator.allocateSessionPorts(examId);
      logger.info(`Allocated ports for session ${examId}:`, sessionPorts);
    } catch (portError) {
      logger.error(
        `Failed to allocate ports for session ${examId}: ${portError.message}`
      );
      return {
        success: false,
        error: 'Resource Allocation Failed',
        message:
          'Unable to allocate ports for new session. Try ending unused sessions.',
        details: portError.message,
      };
    }

    // fetch exam config from the asset path and append it to the examData
    const examConfig = fs.readFileSync(
      path.join(process.cwd(), examData.assetPath, 'config.json'),
      'utf8'
    );
    examData.config = JSON.parse(examConfig);
    delete examData.answers;

    // Persist created at time and session lifecycle (started_at, expires_at, total_allocated_seconds)
    examData.createdAt = new Date().toISOString();
    const startedAt = examData.startedAt || examData.createdAt;
    const expiresAt =
      examData.expiresAt ||
      new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const totalAllocatedSeconds = examData.totalAllocatedSeconds ?? 2 * 3600;
    const ttlSeconds = Math.min(
      Math.max(
        60,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
      ),
      48 * 3600
    );

    // Store exam information in Redis (with session expiry so keys don't outlive session)
    await redisClient.persistExamInfo(examId, examData, ttlSeconds);
    await redisClient.persistExamStatus(examId, 'CREATED', ttlSeconds);

    // Register as active session with ports, userId, and lifecycle fields
    await redisClient.registerSession(
      examId,
      {
        labId: examData.config?.lab,
        category: examData.category,
        createdAt: examData.createdAt,
        ports: sessionPorts,
        userId,
        started_at: startedAt,
        expires_at: expiresAt,
        total_allocated_seconds: totalAllocatedSeconds,
      },
      ttlSeconds
    );

    logger.info(`Exam created successfully with ID: ${examId}`);

    // One terminal session per exam, bound to user_id + exam_session_id (isolated per user)
    if (userId != null) {
      try {
        await terminalSessionService.createOrGet(examId, userId, expiresAt);
      } catch (termErr) {
        logger.error(`Failed to create terminal session for exam ${examId}`, {
          error: termErr.message,
        });
        // Do not fail exam creation; terminal may be unavailable
      }
    }

    // Determine number of nodes required for the exam (default to 1 if not specified)
    const nodeCount = examData.config.workerNodes || 1;

    // Set up the exam environment asynchronously with allocated ports
    // This will happen in the background while the response is sent back to the client
    setupExamEnvironmentAsync(examId, nodeCount, sessionPorts);

    // Send metrics to metric server
    MetricService.sendMetrics(examId, {
      category: examData.category,
      labId: examData.config.lab,
      examName: examData.name,
      event: {
        userAgent: examData.userAgent,
      },
    });

    return {
      success: true,
      data: {
        id: examId,
        status: 'CREATED',
        message:
          'Exam created successfully and environment preparation started',
        // Include port info for client-side routing
        ports: sessionPorts,
      },
    };
  } catch (error) {
    logger.error('Error creating exam', { error: error.message });
    return {
      success: false,
      error: 'Failed to create exam',
      message: error.message,
    };
  }
}

/**
 * Set up the exam environment asynchronously
 * This function runs in the background and doesn't block the response
 *
 * @param {string} examId - The exam ID (session ID)
 * @param {number} nodeCount - Number of nodes to prepare
 * @param {Object} sessionPorts - Allocated ports for this session
 */
async function setupExamEnvironmentAsync(examId, nodeCount, sessionPorts) {
  try {
    // Call the jumphost service to set up the exam environment with ports
    const result = await jumphostService.setupExamEnvironment(
      examId,
      nodeCount,
      sessionPorts
    );

    if (!result.success) {
      logger.error(`Failed to set up exam environment for exam ${examId}`, {
        error: result.error,
        details: result.details,
      });
      // The jumphostService already updates the exam status on failure
      return;
    }

    logger.info(`Exam environment set up successfully for exam ${examId}`);
    // The jumphostService already updates the exam status on success
  } catch (error) {
    logger.error(
      `Unexpected error setting up exam environment for exam ${examId}`,
      {
        error: error.message,
      }
    );

    // Update exam status to PREPARATION_FAILED if not already done
    try {
      const currentStatus = await redisClient.getExamStatus(examId);
      if (currentStatus !== 'PREPARATION_FAILED') {
        await redisClient.persistExamStatus(examId, 'PREPARATION_FAILED');
      }
    } catch (statusError) {
      logger.error(`Failed to update exam status for exam ${examId}`, {
        error: statusError.message,
      });
    }

    // Release allocated ports on failure to prevent port leaks
    try {
      await portAllocator.releaseSessionPorts(examId);
      logger.info(`Released ports for failed session ${examId}`);
    } catch (portError) {
      logger.error(`Failed to release ports for session ${examId}`, {
        error: portError.message,
      });
    }
  }
}

/**
 * Get all active exams
 * Multi-session support: Returns all currently active exam sessions.
 *
 * @returns {Promise<Object>} Result object with success status and data
 */
async function getActiveExams() {
  try {
    const sessionIds = await redisClient.getActiveSessions();

    if (sessionIds.length === 0) {
      return {
        success: true,
        data: {
          count: 0,
          exams: [],
        },
      };
    }

    // Fetch details for each active session
    const exams = await Promise.all(
      sessionIds.map(async (examId) => {
        const examInfo = await redisClient.getExamInfo(examId);
        const examStatus = await redisClient.getExamStatus(examId);
        const sessionData = await redisClient.getSessionData(examId);
        return {
          id: examId,
          status: examStatus,
          info: examInfo,
          session: sessionData,
        };
      })
    );

    return {
      success: true,
      data: {
        count: exams.length,
        exams,
      },
    };
  } catch (error) {
    logger.error('Error retrieving active exams', { error: error.message });
    return {
      success: false,
      error: 'Failed to retrieve active exams',
      message: error.message,
    };
  }
}

/**
 * Get the current active exam for a user
 * - If userId is set: returns the single active exam owned by that user (one per user).
 * - If userId is not set: returns the first active exam (backward compat for anonymous).
 *
 * @param {string|number|null} userId - Authenticated user id, or null for anonymous
 * @returns {Promise<Object>} Result object with success status and data
 */
async function getCurrentExam(userId) {
  try {
    const sessionIds = await redisClient.getActiveSessions();

    if (sessionIds.length === 0) {
      logger.info('No active exams');
      return {
        success: false,
        error: 'Not Found',
        message: 'No current exam is active',
      };
    }

    if (userId != null) {
      // Return the active exam owned by this user only
      for (const examId of sessionIds) {
        const examInfo = await redisClient.getExamInfo(examId);
        if (
          examInfo &&
          examInfo.userId != null &&
          String(examInfo.userId) === String(userId)
        ) {
          const examStatus = await redisClient.getExamStatus(examId);
          return {
            success: true,
            data: {
              id: examId,
              status: examStatus,
              info: examInfo,
            },
          };
        }
      }
      return {
        success: false,
        error: 'Not Found',
        message: 'No current exam is active for this user',
      };
    }

    // Anonymous: only return exams with no userId (mock). Never return another user's exam.
    for (const examId of sessionIds) {
      const examInfo = await redisClient.getExamInfo(examId);
      if (examInfo && (examInfo.userId == null || examInfo.userId === '')) {
        const examStatus = await redisClient.getExamStatus(examId);
        return {
          success: true,
          data: {
            id: examId,
            status: examStatus,
            info: examInfo,
          },
        };
      }
    }
    return {
      success: false,
      error: 'Not Found',
      message: 'No current exam is active for this user',
    };
  } catch (error) {
    logger.error('Error retrieving current exam', { error: error.message });
    return {
      success: false,
      error: 'Failed to retrieve current exam',
      message: error.message,
    };
  }
}

/**
 * Get exam assets
 * @param {string} examId - The exam ID
 * @returns {Promise<Object>} Result object with success status and data
 */
async function getExamAssets(examId) {
  try {
    // Check if exam exists in Redis
    const examInfo = await redisClient.getExamInfo(examId);

    if (!examInfo) {
      logger.error(`Exam not found with ID: ${examId}`);
      return {
        success: false,
        error: 'Not Found',
        message: 'Exam not found',
      };
    }

    // Placeholder implementation - will be implemented later
    return {
      success: true,
      data: {
        examId,
        assets: [],
      },
    };
  } catch (error) {
    logger.error('Error retrieving exam assets', { error: error.message });
    return {
      success: false,
      error: 'Failed to retrieve exam assets',
      message: error.message,
    };
  }
}

/**
 * Get exam questions
 * @param {string} examId - The exam ID
 * @returns {Promise<Object>} Result object with success status and data
 */
async function getExamQuestions(examId) {
  try {
    // Check if exam exists and get status
    const examStatus = await redisClient.getExamStatus(examId);
    const examInfo = await redisClient.getExamInfo(examId);

    if (!examStatus || !examInfo) {
      logger.error(`Exam not found with ID: ${examId}`);
      return {
        success: false,
        error: 'Not Found',
        message: 'Exam not found',
      };
    }

    // Get asset path from exam info
    const assetPath = examInfo.assetPath;
    if (!assetPath) {
      logger.error(`Asset path not found for exam: ${examId}`);
      return {
        success: false,
        error: 'Configuration Error',
        message: 'Exam asset path not defined',
      };
    }

    // Read the config.json file to find the questions.json path
    const configPath = path.join(process.cwd(), assetPath, 'config.json');

    if (!fs.existsSync(configPath)) {
      logger.error(`Config file not found at path: ${configPath}`);
      return {
        success: false,
        error: 'File Not Found',
        message: 'Exam configuration file not found',
      };
    }

    // Read and parse config.json
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Get the questions file path from config
    const questionsFilePath = config.questions || 'assessment.json';
    const fullQuestionsPath = path.join(
      process.cwd(),
      assetPath,
      questionsFilePath
    );

    if (!fs.existsSync(fullQuestionsPath)) {
      logger.error(`Questions file not found at path: ${fullQuestionsPath}`);
      return {
        success: false,
        error: 'File Not Found',
        message: 'Exam questions file not found',
      };
    }

    // Read and parse questions.json
    const questionsData = fs.readFileSync(fullQuestionsPath, 'utf8');
    const questions = JSON.parse(questionsData);

    logger.info(`Successfully retrieved questions for exam ${examId}`);

    return {
      success: true,
      data: {
        questions: questions.questions || [],
      },
    };
  } catch (error) {
    logger.error('Error retrieving exam questions', { error: error.message });
    return {
      success: false,
      error: 'Failed to retrieve exam questions',
      message: error.message,
    };
  }
}

/**
 * Evaluate an exam
 * @param {string} examId - The exam ID
 * @param {Object} evaluationData - The evaluation data
 * @returns {Promise<Object>} Result object with success status and data
 */
async function evaluateExam(examId, evaluationData) {
  try {
    // Update exam status to EVALUATING
    await redisClient.updateExamStatus(examId, 'EVALUATING');

    MetricService.sendMetrics(examId, {
      event: {
        examEvaluationState: 'EVALUATING',
      },
    });

    // Get exam data and question information
    const examInfo = await redisClient.getExamInfo(examId);
    if (!examInfo) {
      throw new Error(`Exam not found with ID: ${examId}`);
    }

    // Get exam questions data
    const questionsResponse = await getExamQuestions(examId);
    if (!questionsResponse.success) {
      throw new Error('Failed to get exam questions');
    }

    // Get assessment path information
    const assetPath = examInfo.assetPath;
    if (!assetPath) {
      throw new Error('Asset path not defined in exam info');
    }

    // Start evaluation asynchronously using Promise
    // This will happen in the background while the response is sent back to the client
    Promise.resolve().then(async () => {
      try {
        // Call the jumphost service to perform the evaluation
        await jumphostService.evaluateExamOnJumphost(
          examId,
          questionsResponse.data.questions
        );
      } catch (error) {
        logger.error(`Error in async exam evaluation for exam ${examId}`, {
          error: error.message,
        });
        // Update exam status to EVALUATION_FAILED
        await redisClient.updateExamStatus(examId, 'EVALUATION_FAILED');
      }
    });

    return {
      success: true,
      data: {
        examId,
        status: 'EVALUATING',
        message: 'Exam evaluation started',
      },
    };
  } catch (error) {
    logger.error('Error starting exam evaluation', { error: error.message });
    return {
      success: false,
      error: 'Failed to start exam evaluation',
      message: error.message,
    };
  }
}

/**
 * Get exam evaluation result
 * @param {string} examId - The exam ID
 * @returns {Promise<Object>} Result object with success status and data
 */
async function getExamResult(examId) {
  try {
    const result = await redisClient.getExamResult(examId);
    if (!result) {
      logger.warn(`No evaluation result found for exam ${examId}`);
      return {
        success: false,
        error: 'Not Found',
        message: 'Exam evaluation result not found',
      };
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error('Error retrieving exam result', { error: error.message });
    return {
      success: false,
      error: 'Failed to retrieve exam result',
      message: error.message,
    };
  }
}

/**
 * End an exam
 * Multi-session support: Each exam can be ended independently.
 * Defense-in-depth: requires userId and verifies ownership (session_id + user_id).
 *
 * @param {string} examId - The exam ID (sessionId)
 * @param {string|number|null} userId - Authenticated user id (null for mock/legacy)
 * @returns {Promise<Object>} Result object with success status and data
 */
async function endExam(examId, userId) {
  try {
    // Always verify ownership: fetch by (examId + userId), never by examId alone
    const examInfo = await redisClient.getExamInfoForUser(examId, userId);
    if (!examInfo) {
      logger.warn(
        `Attempted to end non-existent or unauthorized exam ${examId}`,
        { userId }
      );
      return {
        success: false,
        error: 'Not Found',
        message: `Exam ${examId} not found`,
      };
    }

    logger.info(`Ending exam ${examId}`);

    // Stop countdown timer
    countdownService.stopCountdown(examId);

    // Clean up the exam environment
    try {
      await jumphostService.cleanupExamEnvironment(examId);
    } catch (cleanupError) {
      logger.error(`Error cleaning up exam environment for exam ${examId}`, {
        error: cleanupError.message,
      });
      // Continue with ending the exam even if cleanup fails
    }

    // Release allocated ports for this session
    try {
      await portAllocator.releaseSessionPorts(examId);
      logger.info(`Released ports for session ${examId}`);
    } catch (portError) {
      logger.error(`Error releasing ports for ${examId}`, {
        error: portError.message,
      });
    }

    // Unregister session and clear exam data
    try {
      await redisClient.unregisterSession(examId);
      await redisClient.deleteAllExamData(examId);
    } catch (dataError) {
      logger.error(`Error clearing exam data for ${examId}`, {
        error: dataError.message,
      });
    }

    // Terminate terminal session so no one can connect to this exam's terminal
    try {
      await terminalSessionService.terminate(examId);
    } catch (termErr) {
      logger.error(`Error terminating terminal session for ${examId}`, {
        error: termErr.message,
      });
    }

    logger.info(`Exam ${examId} completed`);

    return {
      success: true,
      data: {
        examId,
        status: 'COMPLETED',
        message: 'Exam completed successfully',
      },
    };
  } catch (error) {
    logger.error('Error ending exam', { error: error.message });
    return {
      success: false,
      error: 'Failed to end exam',
      message: error.message,
    };
  }
}

/**
 * Extend the active exam session's expiry for a user (e.g. when they activate a new pass).
 * Payment/time extension: applies immediately to the active session.
 * @param {string|number} userId - The user ID
 * @param {string} newExpiresAt - ISO date string for new expiry
 * @returns {Promise<boolean>} - True if session was found and extended
 */
async function extendActiveSessionIfAny(userId, newExpiresAt) {
  try {
    const result = await getCurrentExam(userId);
    if (!result.success || !result.data?.id) return false;
    const examId = result.data.id;
    const examInfo = await redisClient.getExamInfo(examId);
    if (!examInfo || !examInfo.accessPassId) return false;
    await redisClient.extendSessionExpiry(examId, newExpiresAt);
    await terminalSessionService.updateExpiresAt(examId, newExpiresAt);
    return true;
  } catch (error) {
    logger.error('Error extending active session', {
      error: error.message,
      userId,
    });
    return false;
  }
}

module.exports = {
  createExam,
  getCurrentExam,
  getActiveExams,
  getExamAssets,
  getExamQuestions,
  evaluateExam,
  endExam,
  getExamResult,
  extendActiveSessionIfAny,
};

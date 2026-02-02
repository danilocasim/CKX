/**
 * Session Orchestrator Service
 *
 * Manages the lifecycle of exam sessions and their associated resources.
 * Supports two modes:
 *   - SHARED: All sessions use common containers (current default)
 *   - ISOLATED: Each session gets dedicated containers (future)
 *
 * This service coordinates between:
 *   - Port allocator (port assignments)
 *   - Redis (session state)
 *   - Container runtime (future: Docker API)
 */

const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');
const portAllocator = require('./portAllocator');

// Session orchestration mode
const ORCHESTRATION_MODE = process.env.SESSION_MODE || 'SHARED';

// Session states
const SESSION_STATES = {
  INITIALIZING: 'INITIALIZING',
  ALLOCATING_PORTS: 'ALLOCATING_PORTS',
  SPAWNING_CONTAINERS: 'SPAWNING_CONTAINERS',
  CONFIGURING: 'CONFIGURING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  TERMINATING: 'TERMINATING',
  TERMINATED: 'TERMINATED',
  FAILED: 'FAILED'
};

// Redis key for session orchestration data
const SESSION_KEY_PREFIX = 'orchestrator:session:';

/**
 * Session data structure
 * @typedef {Object} SessionInfo
 * @property {string} id - Session/exam ID
 * @property {string} state - Current session state
 * @property {Object} ports - Allocated ports
 * @property {Object} containers - Container info (for ISOLATED mode)
 * @property {string} mode - SHARED or ISOLATED
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * Initialize a new session
 * Allocates resources and prepares the session for use.
 *
 * @param {string} sessionId - Unique session identifier
 * @param {Object} options - Session options
 * @returns {Promise<SessionInfo>} Session information
 */
async function initializeSession(sessionId, options = {}) {
  const startTime = Date.now();
  logger.info(`Initializing session ${sessionId}`, { mode: ORCHESTRATION_MODE });

  const sessionInfo = {
    id: sessionId,
    state: SESSION_STATES.INITIALIZING,
    mode: ORCHESTRATION_MODE,
    ports: null,
    containers: {},
    options,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    // Update state: Allocating ports
    sessionInfo.state = SESSION_STATES.ALLOCATING_PORTS;
    await persistSessionInfo(sessionId, sessionInfo);

    // Allocate ports for this session
    sessionInfo.ports = await portAllocator.allocateSessionPorts(sessionId);
    logger.info(`Allocated ports for session ${sessionId}:`, sessionInfo.ports);

    if (ORCHESTRATION_MODE === 'ISOLATED') {
      // Future: Spawn dedicated containers
      sessionInfo.state = SESSION_STATES.SPAWNING_CONTAINERS;
      await persistSessionInfo(sessionId, sessionInfo);
      await spawnSessionContainers(sessionId, sessionInfo);
    }

    // Update state: Configuring
    sessionInfo.state = SESSION_STATES.CONFIGURING;
    await persistSessionInfo(sessionId, sessionInfo);

    // Configure session-specific settings
    await configureSession(sessionId, sessionInfo);

    // Session is ready
    sessionInfo.state = SESSION_STATES.READY;
    sessionInfo.updatedAt = new Date().toISOString();
    await persistSessionInfo(sessionId, sessionInfo);

    const duration = Date.now() - startTime;
    logger.info(`Session ${sessionId} initialized in ${duration}ms`, {
      mode: ORCHESTRATION_MODE,
      ports: sessionInfo.ports
    });

    return sessionInfo;

  } catch (error) {
    logger.error(`Failed to initialize session ${sessionId}:`, error);

    // Cleanup on failure
    sessionInfo.state = SESSION_STATES.FAILED;
    sessionInfo.error = error.message;
    sessionInfo.updatedAt = new Date().toISOString();
    await persistSessionInfo(sessionId, sessionInfo);

    // Release any allocated resources
    await cleanupSession(sessionId, sessionInfo);

    throw error;
  }
}

/**
 * Activate a session (mark as in-use)
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<SessionInfo>} Updated session info
 */
async function activateSession(sessionId) {
  const sessionInfo = await getSessionInfo(sessionId);

  if (!sessionInfo) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (sessionInfo.state !== SESSION_STATES.READY) {
    throw new Error(`Session ${sessionId} is not ready (state: ${sessionInfo.state})`);
  }

  sessionInfo.state = SESSION_STATES.ACTIVE;
  sessionInfo.activatedAt = new Date().toISOString();
  sessionInfo.updatedAt = new Date().toISOString();

  await persistSessionInfo(sessionId, sessionInfo);
  logger.info(`Session ${sessionId} activated`);

  return sessionInfo;
}

/**
 * Terminate a session
 * Releases all resources and cleans up containers.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<void>}
 */
async function terminateSession(sessionId) {
  logger.info(`Terminating session ${sessionId}`);

  let sessionInfo = await getSessionInfo(sessionId);

  if (!sessionInfo) {
    logger.warn(`Session ${sessionId} not found, performing cleanup anyway`);
    sessionInfo = { id: sessionId, ports: null, containers: {} };
  }

  try {
    sessionInfo.state = SESSION_STATES.TERMINATING;
    sessionInfo.updatedAt = new Date().toISOString();
    await persistSessionInfo(sessionId, sessionInfo);

    // Cleanup session resources
    await cleanupSession(sessionId, sessionInfo);

    // Delete session data immediately (no delay)
    await deleteSessionInfo(sessionId);

    // Also cleanup exam data from Redis
    try {
      const client = await redisClient.getClient();
      // Delete all exam-related keys for this session
      const examKeys = await client.keys(`exam:${sessionId}:*`);
      if (examKeys.length > 0) {
        await client.del(examKeys);
        logger.debug(`Deleted ${examKeys.length} exam keys for session ${sessionId}`);
      }
      // Also try the direct exam key
      await client.del(`exam:${sessionId}`);
    } catch (e) {
      logger.warn(`Failed to cleanup exam data for ${sessionId}:`, e);
    }

    logger.info(`Session ${sessionId} terminated and deleted`);

  } catch (error) {
    logger.error(`Error terminating session ${sessionId}:`, error);
    sessionInfo.state = SESSION_STATES.FAILED;
    sessionInfo.error = error.message;
    await persistSessionInfo(sessionId, sessionInfo);
    throw error;
  }
}

/**
 * Get session information
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<SessionInfo|null>} Session info or null
 */
async function getSessionInfo(sessionId) {
  try {
    const client = await redisClient.getClient();
    const data = await client.get(`${SESSION_KEY_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get session info for ${sessionId}:`, error);
    return null;
  }
}

/**
 * Get all active sessions
 * Includes both sessions created via session API and exams created via exam API.
 *
 * @returns {Promise<SessionInfo[]>} Array of session info
 */
async function getAllSessions() {
  try {
    const sessionIds = await redisClient.getActiveSessions();
    const sessions = await Promise.all(
      sessionIds.map(async (id) => {
        // First try orchestrator session data
        let sessionInfo = await getSessionInfo(id);
        
        // If not found, try to build from exam data (for exams created via exam API)
        if (!sessionInfo) {
          const examInfo = await redisClient.getExamInfo(id);
          const examStatus = await redisClient.getExamStatus(id);
          const sessionData = await redisClient.getSessionData(id);
          
          if (examInfo || examStatus) {
            sessionInfo = {
              id: id,
              state: examStatus || 'UNKNOWN',
              mode: 'SHARED',
              ports: sessionData?.ports || null,
              createdAt: examInfo?.createdAt || sessionData?.createdAt,
              updatedAt: new Date().toISOString(),
              examInfo: {
                name: examInfo?.name,
                category: examInfo?.category,
                labId: sessionData?.labId
              }
            };
          }
        }
        
        return sessionInfo;
      })
    );
    return sessions.filter(s => s !== null);
  } catch (error) {
    logger.error('Failed to get all sessions:', error);
    return [];
  }
}

/**
 * Get session routing information
 * Returns the connection details for a specific session.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Routing information
 */
async function getSessionRouting(sessionId) {
  const sessionInfo = await getSessionInfo(sessionId);

  if (!sessionInfo) {
    return null;
  }

  // In SHARED mode, all sessions use the same containers but different logical ports
  // In ISOLATED mode, each session has its own container endpoints
  if (ORCHESTRATION_MODE === 'SHARED') {
    return {
      sessionId,
      mode: 'SHARED',
      vnc: {
        host: process.env.VNC_HOST || 'remote-desktop',
        port: parseInt(process.env.VNC_PORT || '6901', 10),
        // Allocated port for future isolation
        allocatedPort: sessionInfo.ports?.vnc
      },
      ssh: {
        host: process.env.SSH_HOST || 'remote-terminal',
        port: parseInt(process.env.SSH_PORT || '22', 10),
        allocatedPort: sessionInfo.ports?.sshTerminal
      },
      jumphost: {
        host: process.env.JUMPHOST_HOST || 'jumphost',
        port: 22,
        allocatedPort: sessionInfo.ports?.sshJumphost
      },
      k8sApi: {
        host: process.env.K8S_HOST || 'k8s-api-server',
        port: parseInt(process.env.K8S_PORT || '6443', 10),
        allocatedPort: sessionInfo.ports?.k8sApi
      }
    };
  }

  // ISOLATED mode - use actual container endpoints
  return {
    sessionId,
    mode: 'ISOLATED',
    vnc: {
      host: sessionInfo.containers?.vnc?.host || 'localhost',
      port: sessionInfo.ports?.vnc
    },
    ssh: {
      host: sessionInfo.containers?.ssh?.host || 'localhost',
      port: sessionInfo.ports?.sshTerminal
    },
    jumphost: {
      host: sessionInfo.containers?.jumphost?.host || 'localhost',
      port: sessionInfo.ports?.sshJumphost
    },
    k8sApi: {
      host: sessionInfo.containers?.k8s?.host || 'localhost',
      port: sessionInfo.ports?.k8sApi
    }
  };
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Persist session info to Redis
 */
async function persistSessionInfo(sessionId, sessionInfo) {
  try {
    const client = await redisClient.getClient();
    await client.setEx(
      `${SESSION_KEY_PREFIX}${sessionId}`,
      7200, // 2 hour TTL
      JSON.stringify(sessionInfo)
    );
  } catch (error) {
    logger.error(`Failed to persist session info for ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Delete session info from Redis
 */
async function deleteSessionInfo(sessionId) {
  try {
    const client = await redisClient.getClient();
    await client.del(`${SESSION_KEY_PREFIX}${sessionId}`);
  } catch (error) {
    logger.error(`Failed to delete session info for ${sessionId}:`, error);
  }
}

/**
 * Configure session-specific settings
 */
async function configureSession(sessionId, sessionInfo) {
  // In SHARED mode, configuration is minimal
  // In ISOLATED mode, would configure container networking, etc.

  if (ORCHESTRATION_MODE === 'ISOLATED') {
    // Future: Configure container networking
    // - Set up Docker network for session
    // - Configure port mappings
    // - Set environment variables
  }

  logger.debug(`Configured session ${sessionId}`);
}

/**
 * Spawn containers for isolated session
 * Future implementation for per-session containers.
 */
async function spawnSessionContainers(sessionId, sessionInfo) {
  if (ORCHESTRATION_MODE !== 'ISOLATED') {
    return;
  }

  logger.info(`Spawning containers for session ${sessionId}`);

  // Future implementation using dockerode:
  // const Docker = require('dockerode');
  // const docker = new Docker();
  //
  // Container names would be:
  // - ckx-vnc-{sessionId}
  // - ckx-jumphost-{sessionId}
  // - ckx-terminal-{sessionId}
  // - ckx-k8s-{sessionId}
  //
  // Each container would use the allocated ports

  throw new Error('ISOLATED mode not yet implemented');
}

/**
 * Cleanup session resources
 */
async function cleanupSession(sessionId, sessionInfo) {
  logger.info(`Cleaning up session ${sessionId}`);

  // Release allocated ports
  if (sessionInfo?.ports) {
    try {
      await portAllocator.releaseSessionPorts(sessionId);
      logger.debug(`Released ports for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Failed to release ports for session ${sessionId}:`, error);
    }
  }

  // In ISOLATED mode, stop and remove containers
  if (ORCHESTRATION_MODE === 'ISOLATED' && sessionInfo?.containers) {
    // Future: Stop containers
    // for (const [name, container] of Object.entries(sessionInfo.containers)) {
    //   await docker.getContainer(container.id).stop();
    //   await docker.getContainer(container.id).remove();
    // }
  }
}

/**
 * Get orchestrator statistics
 *
 * @returns {Promise<Object>} Statistics
 */
async function getStats() {
  const sessions = await getAllSessions();
  const portStats = portAllocator.getStats();

  const stateCount = {};
  for (const session of sessions) {
    stateCount[session.state] = (stateCount[session.state] || 0) + 1;
  }

  return {
    mode: ORCHESTRATION_MODE,
    totalSessions: sessions.length,
    sessionsByState: stateCount,
    ports: portStats,
    maxSessions: portAllocator.getMaxSessions()
  };
}

module.exports = {
  // Session lifecycle
  initializeSession,
  activateSession,
  terminateSession,

  // Session queries
  getSessionInfo,
  getAllSessions,
  getSessionRouting,

  // Statistics
  getStats,

  // Constants
  SESSION_STATES,
  ORCHESTRATION_MODE
};

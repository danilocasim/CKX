/**
 * Redis Client Utility
 * Handles connections and operations for exam data in Redis
 */

const { createClient } = require('redis');
const logger = require('./logger');

// Redis key prefixes for different data types
const KEYS = {
  EXAM_INFO: 'exam:info:', // For storing JSON exam information
  EXAM_STATUS: 'exam:status:', // For storing exam status string
  EXAM_RESULT: 'exam:result:', // For storing exam evaluation results
  // Session management keys (multi-session support)
  ACTIVE_SESSIONS: 'sessions:active', // Set of active session IDs
  SESSION_PORTS: 'session:ports:', // Port allocations per session (includes started_at, expires_at, total_allocated_seconds)
  PORT_ALLOCATIONS: 'ports:allocated', // Hash of allocated ports
  // DEPRECATED: Single exam tracking removed for multi-session support
  // CURRENT_EXAM_ID: 'current-exam-id',
};

// Redis pub/sub channel for countdown broadcasts (horizontal scaling)
const CHANNELS = {
  COUNTDOWN_TICKS: 'countdown:ticks',
};

// Create Redis client using environment variables
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${
    process.env.REDIS_PORT || 6379
  }`,
});

// Handle Redis connection events
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('error', (err) => {
  logger.error(`Redis client error: ${err}`);
});

// Initialize connection
async function connect() {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${error.message}`);
      throw error;
    }
  }
  return redisClient;
}

/**
 * Ensure the Redis client is connected before performing operations
 */
async function getClient() {
  return redisClient.isOpen ? redisClient : await connect();
}

/**
 * Persist exam information (JSON)
 * @param {string} examId - Exam identifier
 * @param {Object} examInfo - JSON object containing exam information
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function persistExamInfo(examId, examInfo, ttl = 3600) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_INFO}${examId}`;
    const result = await client.setEx(key, ttl, JSON.stringify(examInfo));

    logger.debug(`Persisted exam info for exam ${examId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to persist exam info: ${error.message}`);
    throw error;
  }
}

/**
 * Persist exam status (string)
 * @param {string} examId - Exam identifier
 * @param {string} status - Exam status string
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function persistExamStatus(examId, status, ttl = 3600) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_STATUS}${examId}`;
    const result = await client.setEx(key, ttl, status);
    logger.debug(`Persisted exam status for exam ${examId}: ${status}`);
    return result;
  } catch (error) {
    logger.error(`Failed to persist exam status: ${error.message}`);
    throw error;
  }
}

/**
 * Persist exam evaluation result
 * @param {string} examId - Exam identifier
 * @param {Object} result - Exam evaluation result object
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function persistExamResult(examId, result, ttl = 3600) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_RESULT}${examId}`;
    const resultStr = JSON.stringify(result);
    const resultSet = await client.setEx(key, ttl, resultStr);

    logger.debug(`Persisted exam result for exam ${examId}`);
    return resultSet;
  } catch (error) {
    logger.error(`Failed to persist exam result: ${error.message}`);
    throw error;
  }
}

/**
 * Register an active session
 * @param {string} sessionId - Session identifier (examId)
 * @param {Object} sessionData - Session metadata (ports, timestamps, etc.)
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function registerSession(sessionId, sessionData = {}, ttl = 3600) {
  try {
    const client = await getClient();
    // Add to active sessions set
    await client.sAdd(KEYS.ACTIVE_SESSIONS, sessionId);
    // Store session metadata
    const sessionKey = `${KEYS.SESSION_PORTS}${sessionId}`;
    await client.setEx(
      sessionKey,
      ttl,
      JSON.stringify({
        ...sessionData,
        registeredAt: new Date().toISOString(),
      })
    );
    logger.debug(`Registered session ${sessionId}`);
    return 'OK';
  } catch (error) {
    logger.error(`Failed to register session: ${error.message}`);
    throw error;
  }
}

/**
 * Get all active sessions
 * @returns {Promise<string[]>} - Returns array of active session IDs
 */
async function getActiveSessions() {
  try {
    const client = await getClient();
    return await client.sMembers(KEYS.ACTIVE_SESSIONS);
  } catch (error) {
    logger.error(`Failed to get active sessions: ${error.message}`);
    throw error;
  }
}

/**
 * Remove a session from active sessions
 * @param {string} sessionId - Session identifier
 * @returns {Promise<number>} - Returns 1 if removed, 0 if didn't exist
 */
async function unregisterSession(sessionId) {
  try {
    const client = await getClient();
    // Remove from active sessions set
    const result = await client.sRem(KEYS.ACTIVE_SESSIONS, sessionId);
    // Delete session metadata
    const sessionKey = `${KEYS.SESSION_PORTS}${sessionId}`;
    await client.del(sessionKey);
    logger.debug(`Unregistered session ${sessionId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to unregister session: ${error.message}`);
    throw error;
  }
}

/**
 * Get session metadata
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} - Returns session data or null
 */
async function getSessionData(sessionId) {
  try {
    const client = await getClient();
    const sessionKey = `${KEYS.SESSION_PORTS}${sessionId}`;
    const data = await client.get(sessionKey);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get session data: ${error.message}`);
    throw error;
  }
}

/**
 * Extend session expiry (e.g. when user pays for more time). Updates examInfo, session data, and TTL.
 * @param {string} examId - Session identifier
 * @param {string} newExpiresAt - ISO date string for new expiry
 * @returns {Promise<void>}
 */
async function extendSessionExpiry(examId, newExpiresAt) {
  try {
    const client = await getClient();
    const examInfo = await getExamInfo(examId);
    const sessionData = await getSessionData(examId);
    if (!examInfo || !sessionData) {
      logger.warn('extendSessionExpiry: exam or session not found', { examId });
      return;
    }
    const ttlSeconds = Math.min(
      Math.max(
        60,
        Math.ceil((new Date(newExpiresAt).getTime() - Date.now()) / 1000)
      ),
      48 * 3600
    );
    examInfo.expiresAt = newExpiresAt;
    if (examInfo.startedAt) {
      const start = new Date(examInfo.startedAt).getTime();
      examInfo.totalAllocatedSeconds = Math.max(
        0,
        Math.floor((new Date(newExpiresAt).getTime() - start) / 1000)
      );
    }
    await client.setEx(
      `${KEYS.EXAM_INFO}${examId}`,
      ttlSeconds,
      JSON.stringify(examInfo)
    );
    sessionData.expires_at = newExpiresAt;
    if (sessionData.started_at) {
      const start = new Date(sessionData.started_at).getTime();
      sessionData.total_allocated_seconds = Math.max(
        0,
        Math.floor((new Date(newExpiresAt).getTime() - start) / 1000)
      );
    }
    await client.setEx(
      `${KEYS.SESSION_PORTS}${examId}`,
      ttlSeconds,
      JSON.stringify(sessionData)
    );
    const status = await client.get(`${KEYS.EXAM_STATUS}${examId}`);
    if (status)
      await client.setEx(`${KEYS.EXAM_STATUS}${examId}`, ttlSeconds, status);
    logger.info('Session expiry extended', { examId, newExpiresAt });
  } catch (error) {
    logger.error(`Failed to extend session expiry: ${error.message}`, {
      examId,
    });
    throw error;
  }
}

/**
 * @deprecated Use registerSession() instead. Kept for backward compatibility.
 * Set the current exam ID
 * @param {string} examId - Exam identifier
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function setCurrentExamId(examId, ttl = 3600000) {
  logger.warn(
    'setCurrentExamId is deprecated. Use registerSession() for multi-session support.'
  );
  // For backward compatibility, also register as session
  return registerSession(examId, {}, ttl);
}

/**
 * Get exam information
 * @param {string} examId - Exam identifier
 * @returns {Promise<Object|null>} - Returns parsed JSON object or null if not found
 */
async function getExamInfo(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_INFO}${examId}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get exam info: ${error.message}`);
    throw error;
  }
}

/**
 * Get exam information only if the exam belongs to the given user (session isolation).
 * Returns exam info when examInfo.userId === userId, or exam is mock (userId null/empty).
 * Returns null if exam does not exist or belongs to another user (no data leakage).
 * @param {string} examId - Exam identifier
 * @param {string|number|null} userId - Authenticated user id, or null for anonymous
 * @returns {Promise<Object|null>} - Exam info or null if not found / not owned
 */
async function getExamInfoForUser(examId, userId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_INFO}${examId}`;
    const data = await client.get(key);
    if (!data) return null;
    const examInfo = JSON.parse(data);
    const examUserId = examInfo.userId;
    // Strict ownership: only return exam if it belongs to this user (or both are anonymous)
    if (examUserId != null && examUserId !== '') {
      if (userId == null || String(userId) !== String(examUserId)) return null;
    } else {
      // Exam has no owner (anonymous): do not return to authenticated users (no cross-user access)
      if (userId != null && userId !== '') return null;
    }
    // Session is invalid if past expires_at
    const expiresAt = examInfo.expiresAt || examInfo.expires_at;
    if (expiresAt && new Date(expiresAt) <= new Date()) return null;
    return examInfo;
  } catch (error) {
    logger.error(`Failed to get exam info for user: ${error.message}`);
    throw error;
  }
}

/**
 * Get exam status
 * @param {string} examId - Exam identifier
 * @returns {Promise<string|null>} - Returns status string or null if not found
 */
async function getExamStatus(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_STATUS}${examId}`;
    return await client.get(key);
  } catch (error) {
    logger.error(`Failed to get exam status: ${error.message}`);
    throw error;
  }
}

/**
 * Get exam evaluation result
 * @param {string} examId - Exam identifier
 * @returns {Promise<Object|null>} - Returns parsed result object or null if not found
 */
async function getExamResult(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_RESULT}${examId}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get exam result: ${error.message}`);
    throw error;
  }
}

/**
 * @deprecated Multi-session mode no longer uses a single "current" exam.
 * Use getActiveSessions() to list all active sessions.
 * Get the current exam ID
 * @returns {Promise<string|null>} - Returns first active session or null
 */
async function getCurrentExamId() {
  logger.warn(
    'getCurrentExamId is deprecated. Use getActiveSessions() for multi-session support.'
  );
  try {
    const sessions = await getActiveSessions();
    // Return first active session for backward compatibility
    return sessions.length > 0 ? sessions[0] : null;
  } catch (error) {
    logger.error(`Failed to get current exam ID: ${error.message}`);
    throw error;
  }
}

/**
 * Update exam information
 * @param {string} examId - Exam identifier
 * @param {Object} examInfo - Updated exam information
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function updateExamInfo(examId, examInfo) {
  return persistExamInfo(examId, examInfo);
}

/**
 * Update exam status
 * @param {string} examId - Exam identifier
 * @param {string} status - Updated exam status
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function updateExamStatus(examId, status) {
  return persistExamStatus(examId, status);
}

/**
 * @deprecated Use registerSession() instead.
 * Update the current exam ID
 * @param {string} examId - Updated exam identifier
 * @param {number} [ttl=3600] - Time to live in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns 'OK' if successful
 */
async function updateCurrentExamId(examId) {
  logger.warn(
    'updateCurrentExamId is deprecated. Use registerSession() for multi-session support.'
  );
  return setCurrentExamId(examId);
}

/**
 * Delete exam information
 * @param {string} examId - Exam identifier
 * @returns {Promise<number>} - Returns 1 if successful, 0 if key didn't exist
 */
async function deleteExamInfo(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_INFO}${examId}`;
    const result = await client.del(key);
    logger.debug(`Deleted exam info for exam ${examId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete exam info: ${error.message}`);
    throw error;
  }
}

/**
 * Delete exam status
 * @param {string} examId - Exam identifier
 * @returns {Promise<number>} - Returns 1 if successful, 0 if key didn't exist
 */
async function deleteExamStatus(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_STATUS}${examId}`;
    const result = await client.del(key);
    logger.debug(`Deleted exam status for exam ${examId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete exam status: ${error.message}`);
    throw error;
  }
}

/**
 * Delete exam evaluation result
 * @param {string} examId - Exam identifier
 * @returns {Promise<number>} - Returns 1 if successful, 0 if key didn't exist
 */
async function deleteExamResult(examId) {
  try {
    const client = await getClient();
    const key = `${KEYS.EXAM_RESULT}${examId}`;
    const result = await client.del(key);
    logger.debug(`Deleted exam result for exam ${examId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete exam result: ${error.message}`);
    throw error;
  }
}

/**
 * @deprecated Use unregisterSession(sessionId) instead.
 * Delete the current exam ID
 * @param {string} [sessionId] - Optional session ID to unregister
 * @returns {Promise<number>} - Returns 1 if successful, 0 if key didn't exist
 */
async function deleteCurrentExamId(sessionId = null) {
  logger.warn(
    'deleteCurrentExamId is deprecated. Use unregisterSession() for multi-session support.'
  );
  try {
    if (sessionId) {
      return unregisterSession(sessionId);
    }
    // For backward compatibility without sessionId, clear all active sessions
    const client = await getClient();
    const sessions = await getActiveSessions();
    for (const session of sessions) {
      await unregisterSession(session);
    }
    logger.debug(
      `Deleted current exam ID (cleared ${sessions.length} sessions)`
    );
    return sessions.length;
  } catch (error) {
    logger.error(`Failed to delete current exam ID: ${error.message}`);
    throw error;
  }
}

/**
 * Delete all exam data
 * @param {string} examId - Exam identifier
 * @returns {Promise<number>} - Returns the number of keys deleted
 */
async function deleteAllExamData(examId) {
  try {
    const client = await getClient();

    // Delete all related keys
    const keys = [
      `${KEYS.EXAM_INFO}${examId}`,
      `${KEYS.EXAM_STATUS}${examId}`,
      `${KEYS.EXAM_RESULT}${examId}`,
    ];
    const result = await client.del(keys);
    logger.debug(`Deleted all data for exam ${examId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete all exam data: ${error.message}`);
    throw error;
  }
}

/**
 * Create a dedicated subscriber client for pub/sub
 * Redis requires separate connections for subscribe mode
 * @returns {Promise<Object>} - Returns a new Redis client for subscribing
 */
async function createSubscriber() {
  const subscriber = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${
      process.env.REDIS_PORT || 6379
    }`,
  });

  subscriber.on('error', (err) => {
    logger.error(`Redis subscriber error: ${err}`);
  });

  await subscriber.connect();
  logger.debug('Redis subscriber client connected');
  return subscriber;
}

/**
 * Publish a countdown tick event for horizontal scaling
 * @param {string} examId - The exam identifier
 * @param {Object} data - Countdown data to broadcast
 * @returns {Promise<number>} - Number of subscribers that received the message
 */
async function publishCountdownTick(examId, data) {
  try {
    const client = await getClient();
    const message = JSON.stringify({ examId, ...data });
    return await client.publish(CHANNELS.COUNTDOWN_TICKS, message);
  } catch (error) {
    logger.error(`Failed to publish countdown tick: ${error.message}`);
    throw error;
  }
}

/**
 * Subscribe to countdown tick events from other facilitator instances
 * @param {Function} callback - Function to call with (examId, data) on each tick
 * @returns {Promise<Object>} - Returns the subscriber client (to unsubscribe later)
 */
async function subscribeCountdownTicks(callback) {
  const subscriber = await createSubscriber();

  await subscriber.subscribe(CHANNELS.COUNTDOWN_TICKS, (message) => {
    try {
      const data = JSON.parse(message);
      const { examId, ...tickData } = data;
      callback(examId, tickData);
    } catch (error) {
      logger.error(`Failed to parse countdown tick message: ${error.message}`);
    }
  });

  logger.info('Subscribed to countdown ticks channel');
  return subscriber;
}

module.exports = {
  // Connection
  connect,
  getClient,

  // Create operations
  persistExamInfo,
  persistExamStatus,
  persistExamResult,
  setCurrentExamId, // @deprecated

  // Read operations
  getExamInfo,
  getExamInfoForUser,
  getExamStatus,
  getExamResult,
  getCurrentExamId, // @deprecated

  // Update operations
  updateExamInfo,
  updateExamStatus,
  updateCurrentExamId, // @deprecated

  // Delete operations
  deleteExamInfo,
  deleteExamStatus,
  deleteExamResult,
  deleteCurrentExamId, // @deprecated
  deleteAllExamData,

  // Multi-session operations (NEW)
  registerSession,
  unregisterSession,
  getActiveSessions,
  getSessionData,
  extendSessionExpiry,

  // Pub/Sub operations (for countdown horizontal scaling)
  createSubscriber,
  publishCountdownTick,
  subscribeCountdownTicks,

  // Constants
  KEYS,
  CHANNELS,
};

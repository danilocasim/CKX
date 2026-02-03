/**
 * Countdown Service
 * Manages real-time countdown timers for exams
 * Server is the single source of truth - client countdown is cosmetic only
 */

const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');

// In-memory tracking of active countdown timers
// Map<examId, { interval: NodeJS.Timeout, expiresAt: Date }>
const activeTimers = new Map();

// Socket.io instance (set by initializeSocketIO)
let io = null;

// Broadcast interval in milliseconds
const TICK_INTERVAL_MS = 1000;

/**
 * Initialize the countdown service with Socket.io instance
 * @param {Object} socketIO - The Socket.io server instance
 */
function initialize(socketIO) {
  io = socketIO;
  logger.info('Countdown service initialized with Socket.io');

  // Subscribe to countdown ticks from other facilitator instances (horizontal scaling)
  setupRedisSubscriber();
}

/**
 * Set up Redis pub/sub subscriber for horizontal scaling
 * When running multiple facilitator instances, this ensures all clients
 * receive countdown updates regardless of which instance they're connected to
 */
async function setupRedisSubscriber() {
  try {
    await redisClient.subscribeCountdownTicks((examId, tickData) => {
      // Only broadcast to local sockets if we're not the originator
      // Check if this tick originated from this instance
      if (!activeTimers.has(examId)) {
        // This tick came from another instance, broadcast to our local clients
        broadcastToRoom(examId, 'countdown', tickData);
      }
    });
  } catch (error) {
    logger.error(`Failed to setup Redis subscriber: ${error.message}`);
  }
}

/**
 * Calculate time remaining for an exam
 * @param {Object} examInfo - The exam information from Redis
 * @returns {number} - Remaining seconds (0 if expired)
 */
function calculateRemainingSeconds(examInfo) {
  if (!examInfo || !examInfo.createdAt || !examInfo.config?.duration) {
    return 0;
  }

  const createdAt = new Date(examInfo.createdAt);
  const durationMinutes = examInfo.config.duration;
  const expiresAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const remainingMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(remainingMs / 1000));
}

/**
 * Get expiration timestamp for an exam
 * @param {Object} examInfo - The exam information from Redis
 * @returns {Date|null} - Expiration date or null if invalid
 */
function getExpiresAt(examInfo) {
  if (!examInfo || !examInfo.createdAt || !examInfo.config?.duration) {
    return null;
  }

  const createdAt = new Date(examInfo.createdAt);
  const durationMinutes = examInfo.config.duration;
  return new Date(createdAt.getTime() + durationMinutes * 60 * 1000);
}

/**
 * Start countdown timer for an exam
 * Called when exam status changes to READY
 * @param {string} examId - The exam identifier
 */
async function startCountdown(examId) {
  // Don't start if already running
  if (activeTimers.has(examId)) {
    logger.warn(`Countdown already running for exam ${examId}`);
    return;
  }

  try {
    const examInfo = await redisClient.getExamInfo(examId);
    if (!examInfo) {
      logger.error(`Cannot start countdown - exam ${examId} not found`);
      return;
    }

    const expiresAt = getExpiresAt(examInfo);
    if (!expiresAt) {
      logger.error(`Cannot start countdown - invalid duration for exam ${examId}`);
      return;
    }

    logger.info(`Starting countdown for exam ${examId}, expires at ${expiresAt.toISOString()}`);

    // Create interval that ticks every second
    const interval = setInterval(async () => {
      await tick(examId);
    }, TICK_INTERVAL_MS);

    // Store timer reference
    activeTimers.set(examId, {
      interval,
      expiresAt,
    });

    // Send initial tick immediately
    await tick(examId);
  } catch (error) {
    logger.error(`Failed to start countdown for exam ${examId}: ${error.message}`);
  }
}

/**
 * Stop countdown timer for an exam
 * Called when exam ends
 * @param {string} examId - The exam identifier
 */
function stopCountdown(examId) {
  const timer = activeTimers.get(examId);
  if (timer) {
    clearInterval(timer.interval);
    activeTimers.delete(examId);
    logger.info(`Stopped countdown for exam ${examId}`);
  }
}

/**
 * Get time remaining for an exam (public API)
 * @param {string} examId - The exam identifier
 * @returns {Promise<number>} - Remaining seconds
 */
async function getTimeRemaining(examId) {
  const examInfo = await redisClient.getExamInfo(examId);
  return calculateRemainingSeconds(examInfo);
}

/**
 * Perform a countdown tick
 * Broadcasts to all connected clients and handles expiration
 * @param {string} examId - The exam identifier
 */
async function tick(examId) {
  try {
    const examInfo = await redisClient.getExamInfo(examId);
    if (!examInfo) {
      // Exam was deleted, stop the timer
      stopCountdown(examId);
      return;
    }

    const remainingSeconds = calculateRemainingSeconds(examInfo);
    const expiresAt = getExpiresAt(examInfo);
    const serverTime = new Date().toISOString();

    const tickData = {
      remainingSeconds,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      serverTime,
    };

    // Broadcast to all clients in this exam's room
    broadcastToRoom(examId, 'countdown', { examId, ...tickData });

    // Also publish to Redis for other facilitator instances
    await redisClient.publishCountdownTick(examId, tickData);

    // Check if exam has expired
    if (remainingSeconds <= 0) {
      await handleExpiration(examId);
    }
  } catch (error) {
    logger.error(`Error during countdown tick for exam ${examId}: ${error.message}`);
  }
}

/**
 * Handle exam expiration
 * Broadcasts expired event and triggers auto-termination
 * @param {string} examId - The exam identifier
 */
async function handleExpiration(examId) {
  logger.info(`Exam ${examId} has expired, auto-terminating`);

  // Stop the countdown timer
  stopCountdown(examId);

  // Broadcast expired event to all clients in the room
  broadcastToRoom(examId, 'expired', {
    examId,
    message: 'Exam time expired',
    serverTime: new Date().toISOString(),
  });

  // Auto-terminate the exam by calling examService
  // Use dynamic import to avoid circular dependency
  try {
    const examService = require('./examService');
    await examService.endExam(examId);
    logger.info(`Auto-terminated expired exam ${examId}`);
  } catch (error) {
    logger.error(`Failed to auto-terminate exam ${examId}: ${error.message}`);
  }
}

/**
 * Broadcast a message to all clients in an exam's room
 * @param {string} examId - The exam identifier (room name)
 * @param {string} event - The event name
 * @param {Object} data - The data to send
 */
function broadcastToRoom(examId, event, data) {
  if (!io) {
    logger.warn('Socket.io not initialized, cannot broadcast');
    return;
  }

  io.to(examId).emit(event, data);
}

/**
 * Handle a new client joining an exam room
 * @param {Object} socket - The Socket.io socket
 * @param {string} examId - The exam identifier
 */
async function handleClientJoin(socket, examId) {
  // Join the exam room
  socket.join(examId);
  logger.debug(`Client ${socket.id} joined exam room ${examId}`);

  // Send current countdown state immediately
  try {
    const examInfo = await redisClient.getExamInfo(examId);
    if (!examInfo) {
      socket.emit('error', { code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
      return;
    }

    const examStatus = await redisClient.getExamStatus(examId);
    const remainingSeconds = calculateRemainingSeconds(examInfo);
    const expiresAt = getExpiresAt(examInfo);

    socket.emit('countdown', {
      examId,
      remainingSeconds,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      serverTime: new Date().toISOString(),
      status: examStatus,
    });

    // If exam is already expired, notify the client
    if (remainingSeconds <= 0) {
      socket.emit('expired', {
        examId,
        message: 'Exam time expired',
        serverTime: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error(`Error handling client join for exam ${examId}: ${error.message}`);
    socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to get exam state' });
  }
}

/**
 * Check if a countdown is active for an exam
 * @param {string} examId - The exam identifier
 * @returns {boolean} - True if countdown is active
 */
function isCountdownActive(examId) {
  return activeTimers.has(examId);
}

/**
 * Get all active countdown exam IDs
 * @returns {string[]} - Array of exam IDs with active countdowns
 */
function getActiveCountdowns() {
  return Array.from(activeTimers.keys());
}

module.exports = {
  initialize,
  startCountdown,
  stopCountdown,
  getTimeRemaining,
  handleClientJoin,
  isCountdownActive,
  getActiveCountdowns,
};

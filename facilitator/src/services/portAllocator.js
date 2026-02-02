/**
 * Port Allocator Service
 *
 * Manages dynamic port allocation for multi-session support.
 * Tracks allocated ports in Redis and provides allocate/release functions.
 *
 * Port Ranges:
 * - VNC:         6901-6999 (99 sessions max)
 * - SSH Terminal: 2201-2299 (99 sessions max)
 * - SSH Jumphost: 2301-2399 (99 sessions max)
 * - K8s API:      6443-6542 (100 sessions max)
 */

const logger = require('../utils/logger');

// Port range configuration
const PORT_RANGES = {
  VNC: {
    start: parseInt(process.env.VNC_PORT_RANGE_START || '6901', 10),
    end: parseInt(process.env.VNC_PORT_RANGE_END || '6999', 10),
    name: 'VNC'
  },
  SSH_TERMINAL: {
    start: parseInt(process.env.SSH_TERMINAL_PORT_RANGE_START || '2201', 10),
    end: parseInt(process.env.SSH_TERMINAL_PORT_RANGE_END || '2299', 10),
    name: 'SSH_TERMINAL'
  },
  SSH_JUMPHOST: {
    start: parseInt(process.env.SSH_JUMPHOST_PORT_RANGE_START || '2301', 10),
    end: parseInt(process.env.SSH_JUMPHOST_PORT_RANGE_END || '2399', 10),
    name: 'SSH_JUMPHOST'
  },
  K8S_API: {
    start: parseInt(process.env.K8S_PORT_RANGE_START || '6443', 10),
    end: parseInt(process.env.K8S_PORT_RANGE_END || '6542', 10),
    name: 'K8S_API'
  }
};

// Redis key for port allocations
const REDIS_KEY = 'ports:allocated';
const SESSION_PORTS_PREFIX = 'session:ports:';

// In-memory cache for faster lookups (synced with Redis)
let allocatedPorts = {
  VNC: new Map(),           // port -> sessionId
  SSH_TERMINAL: new Map(),
  SSH_JUMPHOST: new Map(),
  K8S_API: new Map()
};

let redisClient = null;

/**
 * Initialize the port allocator with Redis client
 * @param {Object} client - Redis client instance
 */
async function initialize(client) {
  redisClient = client;
  await syncFromRedis();
  logger.info('Port allocator initialized');
}

/**
 * Sync allocated ports from Redis to in-memory cache
 */
async function syncFromRedis() {
  if (!redisClient) {
    logger.warn('Port allocator not initialized with Redis client');
    return;
  }

  try {
    const client = await redisClient.getClient();
    const data = await client.hGetAll(REDIS_KEY);

    // Clear and rebuild cache
    for (const type of Object.keys(allocatedPorts)) {
      allocatedPorts[type].clear();
    }

    for (const [key, sessionId] of Object.entries(data)) {
      const [type, port] = key.split(':');
      if (allocatedPorts[type]) {
        allocatedPorts[type].set(parseInt(port, 10), sessionId);
      }
    }

    logger.debug(`Synced ${Object.keys(data).length} port allocations from Redis`);
  } catch (error) {
    logger.error(`Failed to sync ports from Redis: ${error.message}`);
  }
}

/**
 * Find the next available port in a range
 * @param {string} portType - Type of port (VNC, SSH_TERMINAL, SSH_JUMPHOST, K8S_API)
 * @returns {number|null} - Available port or null if exhausted
 */
function findAvailablePort(portType) {
  const range = PORT_RANGES[portType];
  if (!range) {
    throw new Error(`Unknown port type: ${portType}`);
  }

  const allocated = allocatedPorts[portType];

  for (let port = range.start; port <= range.end; port++) {
    if (!allocated.has(port)) {
      return port;
    }
  }

  return null; // All ports exhausted
}

/**
 * Allocate a port for a session
 * @param {string} sessionId - Session identifier
 * @param {string} portType - Type of port (VNC, SSH_TERMINAL, SSH_JUMPHOST, K8S_API)
 * @returns {Promise<number>} - Allocated port number
 * @throws {Error} - If no ports available
 */
async function allocatePort(sessionId, portType) {
  const port = findAvailablePort(portType);

  if (port === null) {
    const range = PORT_RANGES[portType];
    throw new Error(
      `No available ${portType} ports. Range ${range.start}-${range.end} exhausted. ` +
      `Consider ending unused sessions.`
    );
  }

  // Update in-memory cache
  allocatedPorts[portType].set(port, sessionId);

  // Persist to Redis
  if (redisClient) {
    try {
      const client = await redisClient.getClient();
      await client.hSet(REDIS_KEY, `${portType}:${port}`, sessionId);
      logger.debug(`Allocated ${portType} port ${port} for session ${sessionId}`);
    } catch (error) {
      // Rollback in-memory change
      allocatedPorts[portType].delete(port);
      throw new Error(`Failed to persist port allocation: ${error.message}`);
    }
  }

  return port;
}

/**
 * Release a port allocation
 * @param {string} sessionId - Session identifier
 * @param {string} portType - Type of port
 * @param {number} port - Port number to release
 * @returns {Promise<boolean>} - True if released, false if not found
 */
async function releasePort(sessionId, portType, port) {
  const allocated = allocatedPorts[portType];
  const currentOwner = allocated.get(port);

  if (currentOwner !== sessionId) {
    logger.warn(
      `Attempted to release ${portType} port ${port} by session ${sessionId}, ` +
      `but owned by ${currentOwner || 'none'}`
    );
    return false;
  }

  // Remove from in-memory cache
  allocated.delete(port);

  // Remove from Redis
  if (redisClient) {
    try {
      const client = await redisClient.getClient();
      await client.hDel(REDIS_KEY, `${portType}:${port}`);
      logger.debug(`Released ${portType} port ${port} from session ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to remove port from Redis: ${error.message}`);
      // Re-add to cache to maintain consistency
      allocated.set(port, sessionId);
      return false;
    }
  }

  return true;
}

/**
 * Allocate all required ports for a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} - Object with all allocated ports
 */
async function allocateSessionPorts(sessionId) {
  const ports = {};

  try {
    ports.vnc = await allocatePort(sessionId, 'VNC');
    ports.sshTerminal = await allocatePort(sessionId, 'SSH_TERMINAL');
    ports.sshJumphost = await allocatePort(sessionId, 'SSH_JUMPHOST');
    ports.k8sApi = await allocatePort(sessionId, 'K8S_API');

    logger.info(`Allocated ports for session ${sessionId}:`, ports);

    // Store session port mapping
    if (redisClient) {
      const client = await redisClient.getClient();
      await client.setEx(
        `${SESSION_PORTS_PREFIX}${sessionId}`,
        3600000, // 1 hour TTL
        JSON.stringify(ports)
      );
    }

    return ports;
  } catch (error) {
    // Rollback any allocated ports on failure
    logger.error(`Failed to allocate ports for session ${sessionId}: ${error.message}`);
    await releaseSessionPorts(sessionId, ports);
    throw error;
  }
}

/**
 * Release all ports for a session
 * @param {string} sessionId - Session identifier
 * @param {Object} [ports] - Optional ports object, fetched from Redis if not provided
 * @returns {Promise<void>}
 */
async function releaseSessionPorts(sessionId, ports = null) {
  // Fetch ports from Redis if not provided
  if (!ports && redisClient) {
    try {
      const client = await redisClient.getClient();
      const data = await client.get(`${SESSION_PORTS_PREFIX}${sessionId}`);
      if (data) {
        ports = JSON.parse(data);
      }
    } catch (error) {
      logger.error(`Failed to fetch session ports: ${error.message}`);
    }
  }

  if (!ports) {
    logger.warn(`No port data found for session ${sessionId}`);
    return;
  }

  // Release each port type
  const releases = [];
  if (ports.vnc) releases.push(releasePort(sessionId, 'VNC', ports.vnc));
  if (ports.sshTerminal) releases.push(releasePort(sessionId, 'SSH_TERMINAL', ports.sshTerminal));
  if (ports.sshJumphost) releases.push(releasePort(sessionId, 'SSH_JUMPHOST', ports.sshJumphost));
  if (ports.k8sApi) releases.push(releasePort(sessionId, 'K8S_API', ports.k8sApi));

  await Promise.all(releases);

  // Remove session port mapping
  if (redisClient) {
    try {
      const client = await redisClient.getClient();
      await client.del(`${SESSION_PORTS_PREFIX}${sessionId}`);
    } catch (error) {
      logger.error(`Failed to delete session ports key: ${error.message}`);
    }
  }

  logger.info(`Released all ports for session ${sessionId}`);
}

/**
 * Get ports allocated to a session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} - Ports object or null
 */
async function getSessionPorts(sessionId) {
  if (!redisClient) return null;

  try {
    const client = await redisClient.getClient();
    const data = await client.get(`${SESSION_PORTS_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get session ports: ${error.message}`);
    return null;
  }
}

/**
 * Get allocation statistics
 * @returns {Object} - Statistics for each port type
 */
function getStats() {
  const stats = {};

  for (const [type, range] of Object.entries(PORT_RANGES)) {
    const allocated = allocatedPorts[type].size;
    const total = range.end - range.start + 1;
    stats[type] = {
      allocated,
      available: total - allocated,
      total,
      range: `${range.start}-${range.end}`
    };
  }

  return stats;
}

/**
 * Get maximum concurrent sessions supported
 * @returns {number} - Minimum of all port range capacities
 */
function getMaxSessions() {
  const capacities = Object.values(PORT_RANGES).map(
    range => range.end - range.start + 1
  );
  return Math.min(...capacities);
}

module.exports = {
  initialize,
  syncFromRedis,
  allocatePort,
  releasePort,
  allocateSessionPorts,
  releaseSessionPorts,
  getSessionPorts,
  getStats,
  getMaxSessions,
  PORT_RANGES
};

/**
 * Runtime Session Service
 * One isolated runtime (VNC + SSH containers) per user per exam.
 * When SESSION_MODE=ISOLATED, spawns dedicated containers; otherwise only DB/Redis state.
 */

const db = require('../utils/db');
const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');

const SESSION_MODE = process.env.SESSION_MODE || 'SHARED';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'ckx-network';
const REMOTE_DESKTOP_IMAGE =
  process.env.REMOTE_DESKTOP_IMAGE ||
  'nishanb/ck-x-simulator-remote-desktop:latest';
const REMOTE_TERMINAL_IMAGE =
  process.env.REMOTE_TERMINAL_IMAGE ||
  'nishanb/ck-x-simulator-remote-terminal:latest';
const VNC_CONTAINER_PORT = 6901;
const SSH_CONTAINER_PORT = 22;

// Docker client required for strict isolation (always spawn per-user containers)
let docker = null;
try {
  // eslint-disable-next-line global-require
  const Docker = require('dockerode');
  docker = new Docker({
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  });
  logger.info(
    'Runtime session service: Docker client initialized (strict isolation enabled)'
  );
} catch (e) {
  logger.error(
    'CRITICAL: Docker not available - strict isolation requires Docker',
    {
      error: e.message,
    }
  );
  // Will fail at runtime when create() is called
}

function containerNameVnc(examId) {
  return `ckx-vnc-${examId}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 63);
}

function containerNameSsh(examId) {
  return `ckx-ssh-${examId}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 63);
}

/**
 * Create a runtime session for an exam (one per user per exam).
 * In ISOLATED mode, spawns VNC and SSH containers and stores their IDs.
 *
 * @param {string} examSessionId - Exam ID (Redis session ID)
 * @param {string} userId - User ID (owner)
 * @param {string} expiresAt - ISO timestamp
 * @returns {Promise<Object>} Runtime session row
 */
async function create(examSessionId, userId, expiresAt) {
  const existing = await getByExamId(examSessionId);
  if (existing) {
    if (String(existing.user_id) !== String(userId)) {
      logger.warn('Runtime session exists for exam but different user', {
        examSessionId,
        existingUserId: existing.user_id,
        requestedUserId: userId,
      });
      throw new Error(
        'Runtime session already exists for this exam under another user'
      );
    }
    return existing;
  }

  const result = await db.query(
    `
    INSERT INTO runtime_sessions (user_id, exam_session_id, status, started_at, expires_at)
    VALUES ($1, $2, 'active', NOW(), $3)
    RETURNING *
    `,
    [userId, examSessionId, expiresAt]
  );
  const row = result.rows[0];

  // STRICT ISOLATION: Always spawn per-user containers for authenticated users (no shared fallback)
  if (!docker) {
    logger.error('Docker not available - cannot create isolated runtime', {
      examSessionId,
      userId,
    });
    await terminate(examSessionId);
    throw new Error(
      'Docker is required for user-scoped runtime isolation. Please ensure Docker is available and SESSION_MODE=ISOLATED or dockerode is installed.'
    );
  }

  try {
    const vncName = containerNameVnc(examSessionId);
    const sshName = containerNameSsh(examSessionId);

    // CRITICAL: Ensure container names are unique per exam (prevent collisions)
    logger.info('Creating isolated runtime containers', {
      examSessionId,
      userId,
      vncName,
      sshName,
    });

    // Check if containers with these names already exist (should not happen, but fail if they do)
    try {
      const existingVnc = docker.getContainer(vncName);
      const existingVncInfo = await existingVnc.inspect().catch(() => null);
      if (existingVncInfo) {
        logger.error('ISOLATION BREACH: VNC container already exists', {
          examSessionId,
          userId,
          vncName,
          existingContainerId: existingVncInfo.Id,
        });
        throw new Error(
          `VNC container ${vncName} already exists - possible isolation breach`
        );
      }
    } catch (err) {
      if (err.message.includes('already exists')) throw err;
      // Container doesn't exist, which is expected
    }

    try {
      const existingSsh = docker.getContainer(sshName);
      const existingSshInfo = await existingSsh.inspect().catch(() => null);
      if (existingSshInfo) {
        logger.error('ISOLATION BREACH: SSH container already exists', {
          examSessionId,
          userId,
          sshName,
          existingContainerId: existingSshInfo.Id,
        });
        throw new Error(
          `SSH container ${sshName} already exists - possible isolation breach`
        );
      }
    } catch (err) {
      if (err.message.includes('already exists')) throw err;
      // Container doesn't exist, which is expected
    }

    const [vncContainer, sshContainer] = await Promise.all([
      docker.createContainer({
        Image: REMOTE_DESKTOP_IMAGE,
        name: vncName,
        Env: [
          'VNC_PW=bakku-the-wizard',
          'VNC_PASSWORD=bakku-the-wizard',
          'VNC_VIEW_ONLY=false',
          'VNC_RESOLUTION=1280x800',
        ],
        Hostconfig: {
          NetworkMode: DOCKER_NETWORK,
        },
      }),
      docker.createContainer({
        Image: REMOTE_TERMINAL_IMAGE,
        name: sshName,
        Hostconfig: {
          NetworkMode: DOCKER_NETWORK,
        },
      }),
    ]);

    await vncContainer.start();
    await sshContainer.start();

    const vncInfo = await vncContainer.inspect();
    const sshInfo = await sshContainer.inspect();

    // Verify containers are actually running
    if (vncInfo.State.Status !== 'running') {
      throw new Error(
        `VNC container ${vncName} failed to start (status: ${vncInfo.State.Status})`
      );
    }
    if (sshInfo.State.Status !== 'running') {
      throw new Error(
        `SSH container ${sshName} failed to start (status: ${sshInfo.State.Status})`
      );
    }

    await db.query(
      `
      UPDATE runtime_sessions
      SET vnc_container_id = $1, ssh_container_id = $2, updated_at = NOW()
      WHERE id = $3
      `,
      [vncInfo.Id, sshInfo.Id, row.id]
    );
    row.vnc_container_id = vncInfo.Id;
    row.ssh_container_id = sshInfo.Id;

    logger.info('Runtime session containers spawned (strict isolation)', {
      user_id: userId,
      exam_session_id: examSessionId,
      vnc_container_id: vncInfo.Id,
      ssh_container_id: sshInfo.Id,
      vnc_container_name: vncName,
      ssh_container_name: sshName,
      vnc_status: vncInfo.State.Status,
      ssh_status: sshInfo.State.Status,
      vnc_ip: vncInfo.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress,
      ssh_ip: sshInfo.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress,
    });
  } catch (err) {
    logger.error(
      'ISOLATION BREACH PREVENTED: Failed to spawn isolated runtime containers',
      {
        examSessionId,
        userId,
        error: err.message,
      }
    );
    await terminate(examSessionId);
    throw err;
  }

  logger.info('Runtime session created', {
    id: row.id,
    exam_session_id: examSessionId,
    user_id: userId,
    mode: SESSION_MODE,
  });
  return row;
}

/**
 * Get active runtime session by exam ID.
 * Internal only: never use for routing without validating session.user_id === userId (use getRoutingForUser).
 * @param {string} examSessionId
 * @returns {Promise<Object|null>}
 */
async function getByExamId(examSessionId) {
  const result = await db.query(
    `
    SELECT * FROM runtime_sessions
    WHERE exam_session_id = $1 AND status = 'active' AND expires_at > NOW()
    LIMIT 1
    `,
    [examSessionId]
  );
  return result.rows[0] || null;
}

/**
 * Get runtime session by exam ID (public method for internal APIs)
 * Still requires ownership validation by caller
 * @param {string} examSessionId
 * @returns {Promise<Object|null>}
 */
async function getRuntimeByExamId(examSessionId) {
  return getByExamId(examSessionId);
}

/**
 * Get routing (VNC and SSH host/port) for a user's exam. Validates ownership.
 * In ISOLATED mode with spawned containers, returns container hostnames on DOCKER_NETWORK.
 * In SHARED mode or when no runtime session exists, returns null (caller uses shared defaults).
 *
 * @param {string} examSessionId - Exam ID
 * @param {string} userId - Authenticated user ID
 * @returns {Promise<Object|null>} { vnc: { host, port }, ssh: { host, port } } or null
 */
async function getRoutingForUser(examSessionId, userId) {
  const session = await getByExamId(examSessionId);
  if (!session) return null;
  if (String(session.user_id) !== String(userId)) {
    logger.warn('Runtime routing denied: user does not own session', {
      examSessionId,
      sessionUserId: session.user_id,
      requestedUserId: userId,
    });
    return null;
  }

  // STRICT ISOLATION: Only return dedicated routing when we have containers (always required for authenticated users)
  if (session.vnc_container_id && session.ssh_container_id) {
    const vncHost = containerNameVnc(examSessionId);
    const sshHost = containerNameSsh(examSessionId);

    // Verify containers are actually running (prevent routing to stopped containers)
    if (docker) {
      try {
        const vncContainer = docker.getContainer(vncHost);
        const sshContainer = docker.getContainer(sshHost);
        const [vncInfo, sshInfo] = await Promise.all([
          vncContainer.inspect().catch(() => null),
          sshContainer.inspect().catch(() => null),
        ]);

        if (!vncInfo || vncInfo.State.Status !== 'running') {
          logger.error(
            'ISOLATION BREACH PREVENTED: VNC container not running',
            {
              examSessionId,
              userId,
              vncHost,
              vncContainerId: session.vnc_container_id,
              status: vncInfo?.State?.Status || 'not found',
            }
          );
          return null;
        }

        if (!sshInfo || sshInfo.State.Status !== 'running') {
          logger.error(
            'ISOLATION BREACH PREVENTED: SSH container not running',
            {
              examSessionId,
              userId,
              sshHost,
              sshContainerId: session.ssh_container_id,
              status: sshInfo?.State?.Status || 'not found',
            }
          );
          return null;
        }

        logger.info(
          'Routing resolved (dedicated containers verified running)',
          {
            user_id: userId,
            exam_session_id: examSessionId,
            vnc_container: vncHost,
            ssh_container: sshHost,
            vnc_status: vncInfo.State.Status,
            ssh_status: sshInfo.State.Status,
          }
        );
      } catch (err) {
        logger.error('Failed to verify container status', {
          examSessionId,
          userId,
          error: err.message,
        });
        return null;
      }
    }

    return {
      vnc: {
        host: vncHost,
        port: VNC_CONTAINER_PORT,
      },
      ssh: {
        host: sshHost,
        port: SSH_CONTAINER_PORT,
      },
    };
  }

  logger.debug('Routing resolved (shared or no containers)', {
    user_id: userId,
    exam_session_id: examSessionId,
    has_session: true,
    has_containers: !!(session.vnc_container_id && session.ssh_container_id),
  });
  return null;
}

/**
 * Terminate runtime session and destroy containers (ISOLATED mode).
 * @param {string} examSessionId - Exam ID
 * @returns {Promise<boolean>} True if session was terminated
 */
async function terminate(examSessionId) {
  const session = await db
    .query(
      `SELECT * FROM runtime_sessions WHERE exam_session_id = $1 AND status = 'active' LIMIT 1`,
      [examSessionId]
    )
    .then((r) => r.rows[0] || null);

  if (!session) return false;

  // STRICT ISOLATION: Always clean up containers if they exist
  if (docker && (session.vnc_container_id || session.ssh_container_id)) {
    const vncName = containerNameVnc(examSessionId);
    const sshName = containerNameSsh(examSessionId);
    for (const name of [vncName, sshName]) {
      try {
        const container = docker.getContainer(name);
        const info = await container.inspect().catch(() => null);
        if (info && info.State.Running) {
          await container.stop({ t: 10 });
        }
        await container.remove({ force: true });
        logger.info('Removed isolated runtime container', { name });
      } catch (err) {
        logger.warn('Error removing container', { name, error: err.message });
      }
    }
  }

  const update = await db.query(
    `
    UPDATE runtime_sessions
    SET status = 'terminated', updated_at = NOW()
    WHERE exam_session_id = $1 AND status = 'active'
    RETURNING id
    `,
    [examSessionId]
  );
  if (update.rowCount > 0) {
    logger.info('Runtime session terminated', {
      exam_session_id: examSessionId,
    });
    return true;
  }
  return false;
}

/**
 * Extend runtime session expiry (e.g. on pass activation).
 * @param {string} examSessionId
 * @param {string} newExpiresAt - ISO timestamp
 * @returns {Promise<boolean>}
 */
async function updateExpiresAt(examSessionId, newExpiresAt) {
  const result = await db.query(
    `
    UPDATE runtime_sessions
    SET expires_at = $1, updated_at = NOW()
    WHERE exam_session_id = $2 AND status = 'active'
    RETURNING id
    `,
    [newExpiresAt, examSessionId]
  );
  return result.rowCount > 0;
}

module.exports = {
  create,
  getByExamId,
  getRoutingForUser,
  terminate,
  updateExpiresAt,
  containerNameVnc,
  containerNameSsh,
};

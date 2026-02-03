/**
 * Terminal Session Service
 * One terminal session per exam, bound to user_id + exam_session_id.
 * Ensures no user can access another user's terminal; session expires with exam.
 */

const db = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Create a terminal session for an exam (called when exam is created).
 * If user already has a terminal session for this exam, return it; otherwise create.
 *
 * @param {string} examSessionId - Exam ID (from Redis)
 * @param {string} userId - User ID (owner)
 * @param {string} expiresAt - ISO timestamp when session expires (match exam expiry)
 * @returns {Promise<Object>} Terminal session row
 */
async function createOrGet(examSessionId, userId, expiresAt) {
  const existing = await getByExamId(examSessionId);
  if (existing) {
    if (String(existing.user_id) !== String(userId)) {
      logger.warn('Terminal session exists for exam but different user', {
        examSessionId,
        existingUserId: existing.user_id,
        requestedUserId: userId,
      });
      throw new Error(
        'Terminal session already exists for this exam under another user'
      );
    }
    return existing;
  }

  const result = await db.query(
    `
    INSERT INTO terminal_sessions (exam_session_id, user_id, status, started_at, expires_at)
    VALUES ($1, $2, 'active', NOW(), $3)
    RETURNING *
    `,
    [examSessionId, userId, expiresAt]
  );
  const row = result.rows[0];
  logger.info('Terminal session created', {
    id: row.id,
    exam_session_id: examSessionId,
    user_id: userId,
    expires_at: row.expires_at,
  });
  return row;
}

/**
 * Get active terminal session by exam ID
 * @param {string} examSessionId
 * @returns {Promise<Object|null>}
 */
async function getByExamId(examSessionId) {
  const result = await db.query(
    `
    SELECT * FROM terminal_sessions
    WHERE exam_session_id = $1 AND status = 'active' AND expires_at > NOW()
    LIMIT 1
    `,
    [examSessionId]
  );
  return result.rows[0] || null;
}

/**
 * Validate that the given user can access the terminal for this exam.
 * Returns session if terminal_session.user_id === userId and session is active and not expired.
 *
 * @param {string} examSessionId - Exam ID
 * @param {string} userId - Authenticated user ID
 * @returns {Promise<Object|null>} Terminal session or null if not found / not owned / expired
 */
async function validateAccess(examSessionId, userId) {
  const result = await db.query(
    `
    SELECT * FROM terminal_sessions
    WHERE exam_session_id = $1 AND status = 'active' AND expires_at > NOW()
    LIMIT 1
    `,
    [examSessionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (String(row.user_id) !== String(userId)) {
    logger.warn('Terminal access denied: user does not own session', {
      examSessionId,
      sessionUserId: row.user_id,
      requestedUserId: userId,
    });
    return null;
  }
  return row;
}

/**
 * Validate attach: runtime must be keyed by terminal_session.id.
 * Ensures terminal_session.id belongs to this user and this exam; session must be active.
 * Used by /ssh websocket: attach only to the SSH connection for this terminalSessionId.
 *
 * @param {string} terminalSessionId - Terminal session UUID
 * @param {string} examSessionId - Exam ID (must match session.exam_session_id)
 * @param {string} userId - Authenticated user ID (must match session.user_id)
 * @returns {Promise<Object|null>} Terminal session row or null if invalid
 */
async function validateAttach(terminalSessionId, examSessionId, userId) {
  if (!terminalSessionId || !examSessionId || !userId) return null;
  const result = await db.query(
    `
    SELECT * FROM terminal_sessions
    WHERE id = $1 AND status = 'active' AND expires_at > NOW()
    LIMIT 1
    `,
    [terminalSessionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (String(row.user_id) !== String(userId)) {
    logger.warn(
      'SECURITY: Terminal attach denied - user does not own terminal session',
      {
        terminalSessionId,
        sessionUserId: row.user_id,
        requestedUserId: userId,
        examSessionId,
      }
    );
    return null;
  }
  if (String(row.exam_session_id) !== String(examSessionId)) {
    logger.warn('SECURITY: Terminal attach denied - exam_session_id mismatch', {
      terminalSessionId,
      sessionExamId: row.exam_session_id,
      requestedExamId: examSessionId,
      userId,
    });
    return null;
  }
  return row;
}

/**
 * Terminate terminal session (called when exam ends or session expires).
 * @param {string} examSessionId - Exam ID
 * @returns {Promise<boolean>} True if a session was terminated
 */
async function terminate(examSessionId) {
  const result = await db.query(
    `
    UPDATE terminal_sessions
    SET status = 'terminated', updated_at = NOW()
    WHERE exam_session_id = $1 AND status = 'active'
    RETURNING id
    `,
    [examSessionId]
  );
  if (result.rowCount > 0) {
    logger.info('Terminal session terminated', {
      exam_session_id: examSessionId,
    });
    return true;
  }
  return false;
}

/**
 * Get active terminal session for a user by exam ID (for reuse check).
 * @param {string} userId
 * @param {string} examSessionId
 * @returns {Promise<Object|null>}
 */
async function getActiveForUser(userId, examSessionId) {
  const result = await db.query(
    `
    SELECT * FROM terminal_sessions
    WHERE user_id = $1 AND exam_session_id = $2 AND status = 'active' AND expires_at > NOW()
    LIMIT 1
    `,
    [userId, examSessionId]
  );
  return result.rows[0] || null;
}

/**
 * Extend terminal session expiry (when exam session is extended via payment).
 * @param {string} examSessionId
 * @param {string} newExpiresAt - ISO timestamp
 * @returns {Promise<boolean>}
 */
async function updateExpiresAt(examSessionId, newExpiresAt) {
  const result = await db.query(
    `
    UPDATE terminal_sessions
    SET expires_at = $1, updated_at = NOW()
    WHERE exam_session_id = $2 AND status = 'active'
    RETURNING id
    `,
    [newExpiresAt, examSessionId]
  );
  return result.rowCount > 0;
}

module.exports = {
  createOrGet,
  getByExamId,
  validateAccess,
  validateAttach,
  terminate,
  getActiveForUser,
  updateExpiresAt,
};

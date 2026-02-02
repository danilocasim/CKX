const db = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const result = await db.query(
    'SELECT id, email, display_name, email_verified, created_at, updated_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Update user profile
 */
async function updateProfile(userId, { displayName }) {
  const result = await db.query(
    `UPDATE users SET display_name = COALESCE($1, display_name), updated_at = NOW() 
     WHERE id = $2 
     RETURNING id, email, display_name, email_verified, created_at, updated_at`,
    [displayName, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const user = result.rows[0];
  logger.info('User profile updated', { userId });

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Get user's exam history
 */
async function getExamHistory(userId, { limit = 20, offset = 0 } = {}) {
  const countResult = await db.query(
    'SELECT COUNT(*) FROM exam_attempts WHERE user_id = $1',
    [userId]
  );

  const result = await db.query(
    `SELECT id, ckx_session_id, lab_id, category, status, score, max_score, 
            started_at, completed_at, duration_minutes
     FROM exam_attempts 
     WHERE user_id = $1 
     ORDER BY started_at DESC 
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    count: parseInt(countResult.rows[0].count, 10),
    exams: result.rows.map(row => ({
      id: row.id,
      sessionId: row.ckx_session_id,
      labId: row.lab_id,
      category: row.category,
      status: row.status,
      score: row.score,
      maxScore: row.max_score,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMinutes: row.duration_minutes,
    })),
  };
}

/**
 * Get specific exam attempt
 */
async function getExamAttempt(userId, attemptId) {
  const result = await db.query(
    `SELECT id, ckx_session_id, lab_id, category, status, score, max_score,
            started_at, completed_at, duration_minutes
     FROM exam_attempts 
     WHERE id = $1 AND user_id = $2`,
    [attemptId, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('Exam attempt not found');
    error.statusCode = 404;
    throw error;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    sessionId: row.ckx_session_id,
    labId: row.lab_id,
    category: row.category,
    status: row.status,
    score: row.score,
    maxScore: row.max_score,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMinutes: row.duration_minutes,
  };
}

/**
 * Create exam attempt (called when user starts an exam)
 */
async function createExamAttempt(userId, { sessionId, labId, category }) {
  const result = await db.query(
    `INSERT INTO exam_attempts (user_id, ckx_session_id, lab_id, category, status)
     VALUES ($1, $2, $3, $4, 'started')
     RETURNING id`,
    [userId, sessionId, labId, category]
  );

  logger.info('Exam attempt created', { userId, sessionId, labId });
  return result.rows[0].id;
}

/**
 * Update exam attempt (called when exam ends or is evaluated)
 */
async function updateExamAttempt(sessionId, { status, score, maxScore }) {
  const updates = ['updated_at = NOW()'];
  const values = [];
  let paramIndex = 1;

  if (status) {
    updates.push(`status = $${paramIndex++}`);
    values.push(status);
    if (status === 'completed') {
      updates.push(`completed_at = NOW()`);
      updates.push(`duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60`);
    }
  }

  if (score !== undefined) {
    updates.push(`score = $${paramIndex++}`);
    values.push(score);
  }

  if (maxScore !== undefined) {
    updates.push(`max_score = $${paramIndex++}`);
    values.push(maxScore);
  }

  values.push(sessionId);

  await db.query(
    `UPDATE exam_attempts SET ${updates.join(', ')} WHERE ckx_session_id = $${paramIndex}`,
    values
  );

  logger.info('Exam attempt updated', { sessionId, status, score });
}

/**
 * Get user exam statistics
 */
async function getStats(userId) {
  const result = await db.query(
    `SELECT 
       COUNT(*) as total_attempts,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
       ROUND(AVG(CASE WHEN score IS NOT NULL AND max_score IS NOT NULL AND max_score > 0 
                      THEN (score::float / max_score) * 100 END)::numeric, 1) as average_score,
       MAX(CASE WHEN score IS NOT NULL AND max_score IS NOT NULL AND max_score > 0 
                THEN ROUND((score::float / max_score) * 100) END) as best_score
     FROM exam_attempts 
     WHERE user_id = $1`,
    [userId]
  );

  const stats = result.rows[0];
  return {
    totalAttempts: parseInt(stats.total_attempts, 10) || 0,
    completed: parseInt(stats.completed, 10) || 0,
    averageScore: stats.average_score ? parseFloat(stats.average_score) : null,
    bestScore: stats.best_score ? parseInt(stats.best_score, 10) : null,
  };
}

module.exports = {
  getUserById,
  updateProfile,
  getExamHistory,
  getExamAttempt,
  createExamAttempt,
  updateExamAttempt,
  getStats,
};

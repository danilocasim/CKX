/**
 * Exam Session Service
 * Business logic for exam sessions - calls CKX internal APIs
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const logger = require('../utils/logger');
const ckxClient = require('./ckxClient');
const accessService = require('./accessService');
const fs = require('fs');
const path = require('path');

/**
 * Create exam session (Sailor-Client owns this)
 * Calls CKX to start runtime
 */
async function createExamSession(userId, labId, examType = 'full') {
  // STRICT ISOLATION: One user = one isolated session
  // Check if user already has an active session
  const activeSessions = await getActiveExamSessions(userId);
  if (activeSessions.length > 0) {
    const error = new Error(
      'User already has an active exam session. Only one active session per user is allowed.'
    );
    error.statusCode = 409;
    error.currentExamId = activeSessions[0].id;
    throw error;
  }

  // Load lab config
  // In Docker, facilitator assets are mounted at /app/facilitator/assets
  // For local dev, they're in ../../facilitator/assets
  const labsPath = fs.existsSync('/app/facilitator/assets/exams/labs.json')
    ? '/app/facilitator/assets/exams/labs.json'
    : path.join(__dirname, '../../facilitator/assets/exams/labs.json');
  const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
  const lab = labsData.labs.find((l) => l.id === labId);

  if (!lab) {
    throw new Error(`Lab ${labId} not found`);
  }

  // Check access for full exams (Sailor-Client owns this business logic)
  if (examType === 'full' && !lab.isFree) {
    const access = await accessService.ensureActivePass(userId);
    if (!access.hasValidPass) {
      const error = new Error('Access pass required for full exams');
      error.statusCode = 403;
      throw error;
    }
  }

  // Create exam_session record (Sailor-Client owns this)
  const examSessionId = uuidv4();
  const startedAt = new Date();
  const expiresAt =
    examType === 'mock'
      ? new Date(startedAt.getTime() + 2 * 60 * 60 * 1000) // 2 hours for mock
      : new Date(startedAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours for full (or use access pass expiry)

  // If full exam, use access pass expiry
  if (examType === 'full' && !lab.isFree) {
    const access = await accessService.checkUserAccess(userId);
    if (access.hasValidPass && new Date(access.expiresAt) < expiresAt) {
      expiresAt = new Date(access.expiresAt);
    }
  }

  // Store exam session in database (Sailor-Client owns this)
  // Note: exam_sessions table must exist (migration 005_exam_sessions.sql)
  try {
    await db.query(
      `INSERT INTO exam_sessions (
        id, user_id, lab_id, exam_type, status, started_at, expires_at
      ) VALUES ($1, $2, $3, $4, 'created', $5, $6)`,
      [examSessionId, userId, labId, examType, startedAt, expiresAt]
    );
  } catch (dbError) {
    // If table doesn't exist, log error but continue (migration may not have run)
    logger.error('Failed to create exam_session record', {
      error: dbError.message,
      examSessionId,
      userId,
    });
    // Continue anyway - CKX will still create runtime
  }

  // Call CKX to start runtime
  // Asset path is relative to facilitator service
  const assetPath = `facilitator/assets/exams/${lab.category}/${lab.id}`;
  const examConfig = {
    workerNodes: lab.config?.workerNodes || 1,
    lab: lab.id,
  };

  const ckxResult = await ckxClient.startExamRuntime(
    examSessionId,
    userId,
    expiresAt.toISOString(),
    labId,
    assetPath,
    examConfig
  );

  if (!ckxResult.success) {
    // Rollback exam session creation
    await db
      .query('DELETE FROM exam_sessions WHERE id = $1', [examSessionId])
      .catch(() => {
        // Ignore rollback errors
      });
    const errorMessage = ckxResult.error || 'Unknown error';
    const errorDetails =
      ckxResult.data?.details || ckxResult.data?.message || '';
    logger.error('CKX runtime creation failed', {
      examSessionId,
      userId,
      error: errorMessage,
      details: errorDetails,
      status: ckxResult.status,
    });
    throw new Error(
      `Failed to start exam runtime: ${errorMessage}${
        errorDetails ? ` - ${errorDetails}` : ''
      }`
    );
  }

  // Update exam session status
  await db.query('UPDATE exam_sessions SET status = $1 WHERE id = $2', [
    'active',
    examSessionId,
  ]);

  logger.info('Exam session created', {
    examSessionId,
    userId,
    labId,
    examType,
  });

  return {
    exam_session_id: examSessionId,
    user_id: userId,
    lab_id: labId,
    exam_type: examType,
    status: 'active',
    started_at: startedAt,
    expires_at: expiresAt,
    routing: ckxResult.data.routing,
    ports: ckxResult.data.ports,
  };
}

/**
 * Get exam session by ID
 */
async function getExamSession(examSessionId, userId) {
  const result = await db.query(
    `SELECT * FROM exam_sessions WHERE id = $1 AND user_id = $2`,
    [examSessionId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Terminate exam session
 * Calls CKX to destroy runtime
 */
async function terminateExamSession(examSessionId, userId) {
  const session = await getExamSession(examSessionId, userId);
  if (!session) {
    throw new Error('Exam session not found');
  }

  // Call CKX to terminate runtime
  const ckxResult = await ckxClient.terminateExamRuntime(
    examSessionId,
    userId,
    session.expires_at.toISOString()
  );

  if (!ckxResult.success) {
    logger.error('Failed to terminate runtime in CKX', {
      examSessionId,
      error: ckxResult.error,
    });
    // Continue with session termination even if CKX fails
  }

  // Update exam session status
  await db.query(
    'UPDATE exam_sessions SET status = $1, ended_at = NOW() WHERE id = $2',
    ['terminated', examSessionId]
  );

  logger.info('Exam session terminated', { examSessionId, userId });

  return { success: true };
}

/**
 * Get user's active exam sessions
 */
async function getActiveExamSessions(userId) {
  const result = await db.query(
    `SELECT * FROM exam_sessions
     WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
     ORDER BY started_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * Validate access to exam session
 * Checks ownership and expiry
 */
async function validateExamAccess(examSessionId, userId) {
  const session = await getExamSession(examSessionId, userId);
  if (!session) {
    return { valid: false, reason: 'Session not found' };
  }

  if (session.status !== 'active') {
    return { valid: false, reason: `Session status is ${session.status}` };
  }

  if (new Date() >= new Date(session.expires_at)) {
    return { valid: false, reason: 'Session expired' };
  }

  // Also validate with CKX
  const ckxValidation = await ckxClient.validateAccess(examSessionId, userId);
  if (!ckxValidation.success || !ckxValidation.data.valid) {
    return {
      valid: false,
      reason: ckxValidation.data?.reason || 'CKX validation failed',
    };
  }

  return { valid: true, expires_at: session.expires_at };
}

module.exports = {
  createExamSession,
  getExamSession,
  terminateExamSession,
  getActiveExamSessions,
  validateExamAccess,
};

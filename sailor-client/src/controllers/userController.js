/**
 * User Controller
 * Moved from CKX to Sailor-Client
 */

const db = require('../utils/db');
const logger = require('../utils/logger');

async function getProfile(req, res) {
  try {
    const userId = req.userId;
    const result = await db.query(
      'SELECT id, email, display_name, email_verified, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Failed to get user profile', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      message: error.message,
    });
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.userId;
    const { displayName } = req.body;

    const result = await db.query(
      'UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, display_name',
      [displayName, userId]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Failed to update profile', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error.message,
    });
  }
}

async function getStats(req, res) {
  try {
    const userId = req.userId;

    // Get exam attempts count
    const examsResult = await db.query(
      'SELECT COUNT(*) as total FROM exam_attempts WHERE user_id = $1',
      [userId]
    );

    // Get completed exams
    const completedResult = await db.query(
      'SELECT COUNT(*) as completed FROM exam_attempts WHERE user_id = $1 AND status = $2',
      [userId, 'completed']
    );

    res.json({
      success: true,
      data: {
        totalExams: parseInt(examsResult.rows[0].total) || 0,
        completedExams: parseInt(completedResult.rows[0].completed) || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get user stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error.message,
    });
  }
}

async function getExamHistory(req, res) {
  try {
    const userId = req.userId;
    const result = await db.query(
      `SELECT id, lab_id, category, status, score, max_score, started_at, completed_at
       FROM exam_attempts
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Failed to get exam history', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get exam history',
      message: error.message,
    });
  }
}

async function getExamAttempt(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await db.query(
      'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Exam attempt not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Failed to get exam attempt', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get exam attempt',
      message: error.message,
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getStats,
  getExamHistory,
  getExamAttempt,
};

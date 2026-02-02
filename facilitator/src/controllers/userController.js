const userService = require('../services/userService');
const logger = require('../utils/logger');

/**
 * Get current user profile
 * GET /api/v1/users/me
 */
async function getProfile(req, res) {
  try {
    const user = await userService.getUserById(req.userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get profile failed', { error: error.message, userId: req.userId });
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode === 404 ? 'Not Found' : 'Error',
      message: error.message,
    });
  }
}

/**
 * Update current user profile
 * PATCH /api/v1/users/me
 */
async function updateProfile(req, res) {
  try {
    const { displayName } = req.body;
    const user = await userService.updateProfile(req.userId, { displayName });

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Update profile failed', { error: error.message, userId: req.userId });
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode === 404 ? 'Not Found' : 'Error',
      message: error.message,
    });
  }
}

/**
 * Get user's exam history
 * GET /api/v1/users/me/exams
 */
async function getExamHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const history = await userService.getExamHistory(req.userId, { limit, offset });

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('Get exam history failed', { error: error.message, userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

/**
 * Get specific exam attempt
 * GET /api/v1/users/me/exams/:id
 */
async function getExamAttempt(req, res) {
  try {
    const attempt = await userService.getExamAttempt(req.userId, req.params.id);

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    logger.error('Get exam attempt failed', { error: error.message, userId: req.userId });
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode === 404 ? 'Not Found' : 'Error',
      message: error.message,
    });
  }
}

/**
 * Get user exam statistics
 * GET /api/v1/users/me/stats
 */
async function getStats(req, res) {
  try {
    const stats = await userService.getStats(req.userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get stats failed', { error: error.message, userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getExamHistory,
  getExamAttempt,
  getStats,
};

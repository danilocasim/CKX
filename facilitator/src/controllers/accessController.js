/**
 * Access Controller
 * Handles access pass related requests
 */

const accessService = require('../services/accessService');
const logger = require('../utils/logger');

/**
 * Get current user's access status
 * GET /api/v1/access/status
 */
async function getStatus(req, res) {
  try {
    const access = await accessService.checkUserAccess(req.userId);

    res.json({
      success: true,
      data: access,
    });
  } catch (error) {
    logger.error('Get access status failed', { error: error.message, userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

/**
 * Get current user's passes
 * GET /api/v1/access/passes
 */
async function getPasses(req, res) {
  try {
    const passes = await accessService.getUserPasses(req.userId);

    res.json({
      success: true,
      data: passes,
    });
  } catch (error) {
    logger.error('Get passes failed', { error: error.message, userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

/**
 * Manually activate a purchased pass
 * POST /api/v1/access/activate/:id
 */
async function activatePass(req, res) {
  try {
    const { id } = req.params;
    const result = await accessService.activatePass(id, req.userId);

    res.json({
      success: true,
      data: result,
      message: 'Pass activated successfully. Your timer has started.',
    });
  } catch (error) {
    logger.error('Activate pass failed', { error: error.message, userId: req.userId, passId: req.params.id });

    if (error.message === 'Pass not found or already activated') {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

module.exports = {
  getStatus,
  getPasses,
  activatePass,
};

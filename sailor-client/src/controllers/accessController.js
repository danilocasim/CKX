/**
 * Access Controller
 * Moved from CKX to Sailor-Client
 */

const accessService = require('../services/accessService');
const logger = require('../utils/logger');

async function getAccessStatus(req, res) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.json({
        success: true,
        data: {
          hasValidPass: false,
          hasAccess: false,
          anonymous: true,
        },
      });
    }

    const access = await accessService.checkUserAccess(userId);

    res.json({
      success: true,
      data: access,
    });
  } catch (error) {
    logger.error('Failed to get access status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get access status',
      message: error.message,
    });
  }
}

async function getUserPasses(req, res) {
  try {
    const userId = req.userId;
    const passes = await accessService.getUserPasses(userId);

    res.json({
      success: true,
      data: passes,
    });
  } catch (error) {
    logger.error('Failed to get user passes', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get passes',
      message: error.message,
    });
  }
}

async function activatePass(req, res) {
  try {
    const { passId } = req.params;
    const userId = req.userId;

    const result = await accessService.activatePass(passId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to activate pass', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to activate pass',
      message: error.message,
    });
  }
}

module.exports = {
  getAccessStatus,
  getUserPasses,
  activatePass,
};

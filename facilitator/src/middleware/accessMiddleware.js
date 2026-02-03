/**
 * Access Middleware
 * Enforces access pass requirements for full exams
 */

const accessService = require('../services/accessService');
const logger = require('../utils/logger');
const redisClient = require('../utils/redisClient');
const fs = require('fs');
const path = require('path');

/**
 * Get lab info from labs.json
 * @param {string} labId - The lab ID
 * @returns {Object|null} Lab info or null
 */
function getLabInfo(labId) {
  try {
    const labsPath = path.join(__dirname, '../../assets/exams/labs.json');
    const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
    return labsData.labs.find(l => l.id === labId) || null;
  } catch (error) {
    logger.error('Failed to load lab info', { error: error.message, labId });
    return null;
  }
}

/**
 * Middleware to require a valid access pass for full exams
 * - Mock exams (isFree: true) are always allowed
 * - Full exams require an active access pass
 * - Auto-activates pending passes when starting a full exam
 */
async function requireFullAccess(req, res, next) {
  const { labId } = req.body;
  const userId = req.userId;

  if (!labId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'labId is required',
    });
  }

  // Get lab info
  const lab = getLabInfo(labId);
  if (!lab) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Lab "${labId}" not found`,
    });
  }

  // Mock/free exams are always allowed
  if (lab.isFree || lab.type === 'mock') {
    logger.debug('Mock exam access granted', { labId, userId });
    req.examType = 'mock';
    return next();
  }

  // Full exams require authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required for full exams. Please login or try a mock exam.',
    });
  }

  // Check for valid access pass
  try {
    // Auto-activate pending pass if user has one
    const access = await accessService.ensureActivePass(userId);

    if (!access.hasValidPass) {
      logger.info('Access denied - no valid pass', { userId, labId });
      return res.status(403).json({
        success: false,
        error: 'Access Required',
        message: 'An active access pass is required for full exams.',
        data: {
          hasPendingPass: access.hasPendingPass,
          pricing: '/pricing',
        },
      });
    }

    // Attach access info to request for logging/analytics
    req.accessPass = access;
    req.examType = 'full';

    logger.debug('Full exam access granted', {
      userId,
      labId,
      passType: access.passType,
      hoursRemaining: access.hoursRemaining,
    });

    next();
  } catch (error) {
    logger.error('Access check failed', { error: error.message, userId, labId });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to verify access',
    });
  }
}

/**
 * Middleware to check access status (doesn't block, just attaches info)
 * Useful for endpoints that work for both authenticated and anonymous users
 */
async function checkAccess(req, res, next) {
  const userId = req.userId;

  if (!userId) {
    req.access = { hasValidPass: false, anonymous: true };
    return next();
  }

  try {
    const access = await accessService.checkUserAccess(userId);
    req.access = access;
    next();
  } catch (error) {
    logger.error('Access check failed', { error: error.message, userId });
    req.access = { hasValidPass: false, error: true };
    next();
  }
}

/**
 * Middleware to validate ongoing session access for full exams
 * - Checks if the exam's associated access pass is still valid
 * - Mock exams bypass this check
 * - Returns 403 if access has expired
 */
async function requireSessionAccess(req, res, next) {
  const examId = req.params.examId;

  if (!examId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'examId is required',
    });
  }

  try {
    // Get exam info from Redis
    const examInfo = await redisClient.getExamInfo(examId);

    if (!examInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    // Mock exams bypass access validation
    if (examInfo.examType === 'mock' || examInfo.isFree) {
      logger.debug('Mock exam session - access check bypassed', { examId });
      return next();
    }

    // Full exams require valid access pass
    const accessPassId = examInfo.accessPassId;

    if (!accessPassId) {
      // Legacy exam without access pass tracking - allow for now
      logger.warn('Full exam without accessPassId - allowing (legacy)', { examId });
      return next();
    }

    // Validate the access pass is still valid
    const passValid = await accessService.validatePassById(accessPassId);

    if (!passValid.isValid) {
      logger.info('Session access denied - pass expired or invalid', {
        examId,
        accessPassId,
        reason: passValid.reason,
      });

      return res.status(403).json({
        success: false,
        error: 'Access Expired',
        message: passValid.reason || 'Your access pass has expired. Please purchase a new pass to continue.',
        data: {
          expired: true,
          pricing: '/pricing',
        },
      });
    }

    // Attach access info for logging
    req.accessPass = passValid;
    next();
  } catch (error) {
    logger.error('Session access check failed', { error: error.message, examId });
    return res.status(500).json({
      success: false,
      error: 'Error',
      message: 'Failed to verify session access',
    });
  }
}

module.exports = {
  requireFullAccess,
  checkAccess,
  requireSessionAccess,
};

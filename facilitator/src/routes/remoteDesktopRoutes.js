const express = require('express');
const router = express.Router();
const remoteDesktopController = require('../controllers/remoteDesktopController');
const { optionalAuth } = require('../middleware/authMiddleware');
const { requireExamOwnership } = require('../middleware/accessMiddleware');

/**
 * @route   GET /api/v1/remote-desktop/routing/:examId
 * @desc    Get VNC/SSH routing for user's exam (validates ownership; isolated or shared)
 * @access  Owner only
 */
router.get(
  '/routing/:examId',
  optionalAuth,
  requireExamOwnership,
  remoteDesktopController.getRouting
);

/**
 * @route   POST /api/remote-desktop/clipboard
 * @desc    Copy content to remote desktop clipboard
 * @access  Private
 */
router.post('/clipboard', remoteDesktopController.copyToClipboard);

module.exports = router;

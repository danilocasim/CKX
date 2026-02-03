const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');

router.get('/status', optionalAuth, accessController.getAccessStatus);
router.get('/passes', requireAuth, accessController.getUserPasses);
router.post(
  '/passes/:passId/activate',
  requireAuth,
  accessController.activatePass
);

module.exports = router;

/**
 * Access Routes
 * Endpoints for access pass management
 */

const express = require('express');
const accessController = require('../controllers/accessController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All access routes require authentication
router.use(authenticate);

// GET /api/v1/access/status - Get current access status
router.get('/status', accessController.getStatus);

// GET /api/v1/access/passes - Get all user passes
router.get('/passes', accessController.getPasses);

// POST /api/v1/access/activate/:id - Activate a purchased pass
router.post('/activate/:id', accessController.activatePass);

module.exports = router;

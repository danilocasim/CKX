/**
 * Billing Routes
 * Endpoints for payment and billing management
 */

const express = require('express');
const billingController = require('../controllers/billingController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/v1/billing/plans - Get available plans (public)
router.get('/plans', billingController.getPlans);

// Note: POST /api/v1/billing/webhook is registered separately in app.js
// before the JSON body parser (Stripe requires raw body for signature verification)

// Protected routes below
router.use(authenticate);

// POST /api/v1/billing/checkout - Create checkout session
router.post('/checkout', billingController.createCheckout);

// GET /api/v1/billing/verify/:sessionId - Verify checkout completion
router.get('/verify/:sessionId', billingController.verifyCheckout);

module.exports = router;

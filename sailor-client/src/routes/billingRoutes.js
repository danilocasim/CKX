const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { requireAuth } = require('../middleware/authMiddleware');

// Note: Webhook is registered in app.js BEFORE json parser (needs raw body)
// Checkout session creation
router.post('/checkout', requireAuth, billingController.createCheckout);

// Verify payment
router.get('/verify/:sessionId', requireAuth, billingController.verifyPayment);

module.exports = router;

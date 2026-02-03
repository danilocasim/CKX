/**
 * Billing Controller (Stripe Integration)
 * Moved from CKX to Sailor-Client
 */

const paymentService = require('../services/paymentService');
const accessService = require('../services/accessService');
const logger = require('../utils/logger');

/**
 * Create checkout session
 */
async function createCheckout(req, res) {
  try {
    const { passTypeId } = req.body;
    const userId = req.userId;

    if (!passTypeId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'passTypeId is required',
      });
    }

    // Get user email for Stripe
    const db = require('../utils/db');
    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found',
      });
    }

    const userEmail = userResult.rows[0].email;

    const result = await paymentService.createCheckoutSession(
      userId,
      passTypeId,
      userEmail
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to create checkout session', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout',
      message: error.message,
    });
  }
}

/**
 * Handle Stripe webhook
 */
async function handleWebhook(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const event = paymentService.constructWebhookEvent(req.body, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await paymentService.handlePaymentSuccess(session);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
}

/**
 * Verify payment status
 * Returns detailed payment information for a checkout session
 */
async function verifyPayment(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'sessionId is required',
      });
    }

    logger.debug('Verifying payment', { sessionId, userId });

    let session;
    try {
      session = await paymentService.getCheckoutSession(sessionId);
    } catch (stripeError) {
      logger.error('Stripe API error retrieving checkout session', {
        error: stripeError.message,
        sessionId,
        userId,
      });

      if (stripeError.type === 'StripeInvalidRequestError') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Payment session not found',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Payment Verification Failed',
        message: 'Failed to retrieve payment information',
      });
    }

    // Verify session belongs to user
    const sessionUserId = session.metadata?.userId;
    if (sessionUserId && String(sessionUserId) !== String(userId)) {
      logger.warn(
        'Payment verification denied: session belongs to different user',
        {
          sessionId,
          sessionUserId,
          requestedUserId: userId,
        }
      );
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Payment session does not belong to this user',
      });
    }

    const isPaid = session.payment_status === 'paid';
    const isComplete = session.status === 'complete';

    logger.info('Payment verification completed', {
      sessionId,
      userId,
      paymentStatus: session.payment_status,
      sessionStatus: session.status,
      isPaid,
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        paid: isPaid,
        complete: isComplete,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_email,
      },
    });
  } catch (error) {
    logger.error('Unexpected error verifying payment', {
      error: error.message,
      stack: error.stack,
      sessionId: req.params.sessionId,
      userId: req.userId,
    });
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while verifying payment',
    });
  }
}

module.exports = {
  createCheckout,
  handleWebhook,
  verifyPayment,
};

/**
 * Billing Controller
 * Handles payment and billing related requests
 */

const stripeService = require('../services/stripeService');
const accessService = require('../services/accessService');
const userService = require('../services/userService');
const logger = require('../utils/logger');

/**
 * Get available pass types (plans)
 * GET /api/v1/billing/plans
 */
async function getPlans(req, res) {
  try {
    const passTypes = await accessService.getPassTypes();

    // Format for frontend consumption
    const plans = passTypes.map(pt => ({
      id: pt.id,
      name: pt.name,
      durationHours: pt.duration_hours,
      priceUsd: pt.price_cents / 100,
      priceCents: pt.price_cents,
      features: pt.features,
    }));

    res.json({
      success: true,
      data: {
        plans,
        stripeConfigured: stripeService.isConfigured(),
        publishableKey: stripeService.getPublishableKey(),
      },
    });
  } catch (error) {
    logger.error('Get plans failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

/**
 * Create Stripe checkout session
 * POST /api/v1/billing/checkout
 */
async function createCheckout(req, res) {
  try {
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Payment processing is not configured',
      });
    }

    const { passTypeId } = req.body;

    if (!passTypeId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'passTypeId is required',
      });
    }

    // Get user email for Stripe
    const user = await userService.getUserById(req.userId);

    const session = await stripeService.createCheckoutSession(
      req.userId,
      passTypeId,
      user.email
    );

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        url: session.url,
      },
    });
  } catch (error) {
    logger.error('Create checkout failed', { error: error.message, userId: req.userId });

    if (error.message === 'Invalid pass type') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
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

/**
 * Handle Stripe webhook events
 * POST /api/v1/billing/webhook
 * Note: This endpoint uses raw body, not JSON parsed
 */
async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Missing stripe-signature header',
    });
  }

  try {
    const event = stripeService.constructWebhookEvent(req.body, signature);

    logger.info('Stripe webhook received', { type: event.type });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_status === 'paid') {
          await stripeService.handlePaymentSuccess(session);
          logger.info('Payment processed successfully', {
            sessionId: session.id,
            userId: session.metadata.userId,
          });
        }
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        await stripeService.handlePaymentSuccess(session);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        logger.warn('Async payment failed', {
          sessionId: session.id,
          userId: session.metadata?.userId,
        });
        // Could delete the pending pass here if needed
        break;
      }

      default:
        logger.debug('Unhandled webhook event', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: 'Webhook Error',
      message: error.message,
    });
  }
}

/**
 * Verify checkout session success (called from success page)
 * GET /api/v1/billing/verify/:sessionId
 */
async function verifyCheckout(req, res) {
  try {
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Payment processing is not configured',
      });
    }

    const { sessionId } = req.params;
    const session = await stripeService.getCheckoutSession(sessionId);

    // Verify the session belongs to this user
    if (session.metadata.userId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Session does not belong to this user',
      });
    }

    const pass = await accessService.findPassByCheckoutSession(sessionId);

    res.json({
      success: true,
      data: {
        paymentStatus: session.payment_status,
        pass: pass ? {
          id: pass.id,
          passType: pass.pass_type,
          status: pass.status,
          durationHours: pass.duration_hours,
        } : null,
      },
    });
  } catch (error) {
    logger.error('Verify checkout failed', { error: error.message, sessionId: req.params.sessionId });
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message,
    });
  }
}

module.exports = {
  getPlans,
  createCheckout,
  handleWebhook,
  verifyCheckout,
};

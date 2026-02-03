/**
 * Payment Service (Stripe Integration)
 * Moved from CKX to Sailor-Client (Control Plane)
 */

const stripe = require('stripe');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../utils/db');
const accessService = require('./accessService');

const stripeClient = config.stripe.secretKey
  ? stripe(config.stripe.secretKey)
  : null;

/**
 * Check if Stripe is configured
 */
function isConfigured() {
  return !!stripeClient;
}

/**
 * Create checkout session for access pass purchase
 */
async function createCheckoutSession(userId, passTypeId, userEmail) {
  if (!stripeClient) {
    throw new Error('Stripe is not configured');
  }

  const passType = await accessService.getPassType(passTypeId);
  if (!passType) {
    throw new Error('Invalid pass type');
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: passType.name,
            description: `${passType.duration_hours} hours of full exam access`,
            metadata: {
              passTypeId: passType.id,
            },
          },
          unit_amount: passType.price_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      passTypeId,
      durationHours: passType.duration_hours.toString(),
      priceCents: passType.price_cents.toString(),
    },
    success_url: `${config.app.url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.app.url}/pricing`,
  });

  // Create pending access pass
  await accessService.createAccessPass({
    userId,
    passTypeId,
    durationHours: passType.duration_hours,
    priceCents: passType.price_cents,
    stripeCheckoutSessionId: session.id,
    stripePaymentId: null,
  });

  logger.info('Stripe checkout session created', {
    sessionId: session.id,
    userId,
    passTypeId,
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Handle successful payment from webhook
 */
async function handlePaymentSuccess(session) {
  const { userId, passTypeId } = session.metadata;
  const pass = await accessService.findPassByCheckoutSession(session.id);

  if (!pass) {
    logger.error('Access pass not found for checkout session', {
      sessionId: session.id,
      userId,
    });
    throw new Error('Access pass not found');
  }

  if (session.payment_intent) {
    await accessService.updatePassPayment(pass.id, session.payment_intent);
  }

  logger.info('Payment successful', {
    passId: pass.id,
    userId,
    passTypeId,
  });

  return pass;
}

/**
 * Verify webhook event
 */
function constructWebhookEvent(payload, signature) {
  if (!stripeClient) {
    throw new Error('Stripe is not configured');
  }
  if (!config.stripe.webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
  }
  return stripeClient.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

/**
 * Get checkout session by ID
 * Used to verify payment status
 */
async function getCheckoutSession(sessionId) {
  if (!stripeClient) {
    throw new Error('Stripe is not configured');
  }

  try {
    const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    logger.info('Retrieved checkout session', {
      sessionId,
      paymentStatus: session.payment_status,
      status: session.status,
    });

    return session;
  } catch (error) {
    logger.error('Failed to retrieve checkout session', {
      sessionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get publishable key
 */
function getPublishableKey() {
  return config.stripe.publishableKey;
}

module.exports = {
  isConfigured,
  createCheckoutSession,
  handlePaymentSuccess,
  constructWebhookEvent,
  getCheckoutSession,
  getPublishableKey,
};

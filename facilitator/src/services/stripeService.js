/**
 * Stripe Service
 * Handles Stripe one-time payments for access passes
 */

const config = require('../config');
const logger = require('../utils/logger');
const accessService = require('./accessService');

// Initialize Stripe with secret key
const stripe = config.stripe.secretKey
  ? require('stripe')(config.stripe.secretKey)
  : null;

/**
 * Check if Stripe is configured
 * @returns {boolean} True if Stripe is configured
 */
function isConfigured() {
  return !!stripe;
}

/**
 * Create a Stripe checkout session for access pass purchase
 * @param {string} userId - The user ID
 * @param {string} passTypeId - The pass type to purchase
 * @param {string} userEmail - User's email for Stripe
 * @returns {Promise<Object>} Checkout session
 */
async function createCheckoutSession(userId, passTypeId, userEmail) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const passType = await accessService.getPassType(passTypeId);
  if (!passType) {
    throw new Error('Invalid pass type');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',  // One-time payment, not subscription
    payment_method_types: ['card'],
    customer_email: userEmail,
    line_items: [{
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
    }],
    metadata: {
      userId,
      passTypeId,
      durationHours: passType.duration_hours.toString(),
      priceCents: passType.price_cents.toString(),
    },
    success_url: `${config.app.url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.app.url}/pricing`,
  });

  // Create a pending access pass record linked to this checkout session
  await accessService.createAccessPass({
    userId,
    passTypeId,
    durationHours: passType.duration_hours,
    priceCents: passType.price_cents,
    stripeCheckoutSessionId: session.id,
    stripePaymentId: null, // Will be updated after payment
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
 * Retrieve a checkout session
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<Object>} Session details
 */
async function getCheckoutSession(sessionId) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return await stripe.checkout.sessions.retrieve(sessionId);
}

/**
 * Handle successful payment from webhook
 * @param {Object} session - Stripe checkout session
 * @returns {Promise<Object>} Updated pass
 */
async function handlePaymentSuccess(session) {
  const { userId, passTypeId } = session.metadata;

  // Find the access pass by checkout session ID
  const pass = await accessService.findPassByCheckoutSession(session.id);

  if (!pass) {
    logger.error('Access pass not found for checkout session', {
      sessionId: session.id,
      userId,
    });
    throw new Error('Access pass not found');
  }

  // Update the pass with the payment intent ID
  if (session.payment_intent) {
    await accessService.updatePassPayment(pass.id, session.payment_intent);
  }

  logger.info('Payment successful, access pass ready for activation', {
    passId: pass.id,
    userId,
    passTypeId,
    paymentIntent: session.payment_intent,
  });

  return pass;
}

/**
 * Verify and construct webhook event
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Object} Verified event
 */
function constructWebhookEvent(payload, signature) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  if (!config.stripe.webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

/**
 * Get Stripe publishable key for frontend
 * @returns {string} Publishable key
 */
function getPublishableKey() {
  return config.stripe.publishableKey;
}

module.exports = {
  isConfigured,
  createCheckoutSession,
  getCheckoutSession,
  handlePaymentSuccess,
  constructWebhookEvent,
  getPublishableKey,
};

/**
 * Access Service
 * Handles access pass logic for time-based exam access
 */

const db = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Format hours remaining as human-readable string (e.g. "38h", "2d 5h")
 * @param {number} hours
 * @returns {string}
 */
function formatRemainingHours(hours) {
  if (hours <= 0) return '0h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder > 0 ? `${days}d ${remainder}h` : `${days}d`;
}

/**
 * Get all available pass types
 * @returns {Promise<Array>} List of active pass types
 */
async function getPassTypes() {
  const result = await db.query(
    'SELECT * FROM pass_types WHERE is_active = TRUE ORDER BY price_cents ASC'
  );
  return result.rows;
}

/**
 * Get a specific pass type by ID
 * @param {string} passTypeId - The pass type ID
 * @returns {Promise<Object|null>} Pass type or null
 */
async function getPassType(passTypeId) {
  const result = await db.query(
    'SELECT * FROM pass_types WHERE id = $1 AND is_active = TRUE',
    [passTypeId]
  );
  return result.rows[0] || null;
}

/**
 * Check if user has valid access for full exams
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Access status object
 */
async function checkUserAccess(userId) {
  // Find active pass that hasn't expired
  const activePass = await db.query(
    `
    SELECT * FROM access_passes
    WHERE user_id = $1
      AND status = 'activated'
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1
  `,
    [userId]
  );

  if (activePass.rows.length > 0) {
    const pass = activePass.rows[0];
    const now = new Date();
    const expiresAt = new Date(pass.expires_at);
    const hoursRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
    const remainingHuman = formatRemainingHours(hoursRemaining);

    return {
      hasValidPass: true,
      hasAccess: true,
      passId: pass.id,
      passType: pass.pass_type,
      activatedAt: pass.activated_at,
      expiresAt: pass.expires_at,
      hoursRemaining,
      remainingHuman,
    };
  }

  // Check for purchased but not activated passes
  const pendingPass = await db.query(
    `
    SELECT * FROM access_passes
    WHERE user_id = $1 AND status = 'purchased'
    ORDER BY created_at ASC
    LIMIT 1
  `,
    [userId]
  );

  return {
    hasValidPass: false,
    hasPendingPass: pendingPass.rows.length > 0,
    pendingPassId: pendingPass.rows[0]?.id,
    pendingPassType: pendingPass.rows[0]?.pass_type,
  };
}

/**
 * Get all passes for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} List of user's passes
 */
async function getUserPasses(userId) {
  const result = await db.query(
    `
    SELECT
      ap.*,
      pt.name as pass_name,
      pt.features
    FROM access_passes ap
    JOIN pass_types pt ON ap.pass_type = pt.id
    WHERE ap.user_id = $1
    ORDER BY ap.created_at DESC
  `,
    [userId]
  );

  return result.rows.map((pass) => ({
    id: pass.id,
    passType: pass.pass_type,
    passName: pass.pass_name,
    durationHours: pass.duration_hours,
    priceCents: pass.price_cents,
    status: pass.status,
    purchasedAt: pass.purchased_at,
    activatedAt: pass.activated_at,
    expiresAt: pass.expires_at,
    features: pass.features,
    hoursRemaining:
      pass.status === 'activated' && pass.expires_at
        ? Math.max(
            0,
            Math.ceil(
              (new Date(pass.expires_at) - new Date()) / (1000 * 60 * 60)
            )
          )
        : null,
  }));
}

/**
 * Activate a purchased pass (starts the timer)
 * @param {string} passId - The pass ID
 * @param {string} userId - The user ID (for verification)
 * @returns {Promise<Object>} Activation result
 */
async function activatePass(passId, userId) {
  // Get the pass and verify ownership
  const passResult = await db.query(
    `
    SELECT * FROM access_passes
    WHERE id = $1 AND user_id = $2 AND status = 'purchased'
  `,
    [passId, userId]
  );

  if (passResult.rows.length === 0) {
    throw new Error('Pass not found or already activated');
  }

  const pass = passResult.rows[0];
  const activatedAt = new Date();
  const expiresAt = new Date(
    activatedAt.getTime() + pass.duration_hours * 60 * 60 * 1000
  );

  await db.query(
    `
    UPDATE access_passes
    SET status = 'activated', activated_at = $1, expires_at = $2
    WHERE id = $3
  `,
    [activatedAt, expiresAt, passId]
  );

  logger.info('Access pass activated', { passId, userId, expiresAt });

  return {
    passId,
    activatedAt,
    expiresAt,
    durationHours: pass.duration_hours,
  };
}

/**
 * Auto-activate a pending pass (called when starting a full exam)
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Updated access status
 */
async function ensureActivePass(userId) {
  const access = await checkUserAccess(userId);

  if (access.hasValidPass) {
    return access;
  }

  if (access.hasPendingPass) {
    await activatePass(access.pendingPassId, userId);
    return await checkUserAccess(userId);
  }

  return { hasValidPass: false };
}

/**
 * Create an access pass record (called after successful payment)
 * @param {Object} passData - Pass data
 * @returns {Promise<Object>} Created pass
 */
async function createAccessPass(passData) {
  const {
    userId,
    passTypeId,
    priceCents,
    durationHours,
    stripePaymentId,
    stripeCheckoutSessionId,
  } = passData;

  const result = await db.query(
    `
    INSERT INTO access_passes (
      user_id, pass_type, duration_hours, price_cents,
      stripe_payment_id, stripe_checkout_session_id, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'purchased')
    RETURNING *
  `,
    [
      userId,
      passTypeId,
      durationHours,
      priceCents,
      stripePaymentId,
      stripeCheckoutSessionId,
    ]
  );

  logger.info('Access pass created', {
    passId: result.rows[0].id,
    userId,
    passTypeId,
  });

  return result.rows[0];
}

/**
 * Find access pass by Stripe checkout session ID
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<Object|null>} Pass or null
 */
async function findPassByCheckoutSession(sessionId) {
  const result = await db.query(
    'SELECT * FROM access_passes WHERE stripe_checkout_session_id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Update pass with payment details after successful payment
 * @param {string} passId - The pass ID
 * @param {string} paymentIntentId - Stripe payment intent ID
 */
async function updatePassPayment(passId, paymentIntentId) {
  await db.query(
    'UPDATE access_passes SET stripe_payment_id = $1 WHERE id = $2',
    [paymentIntentId, passId]
  );
}

/**
 * Expire old passes (to be called by a cron job)
 * @returns {Promise<number>} Number of expired passes
 */
async function expireOldPasses() {
  const result = await db.query(`
    UPDATE access_passes
    SET status = 'expired'
    WHERE status = 'activated' AND expires_at < NOW()
    RETURNING id, user_id
  `);

  if (result.rowCount > 0) {
    logger.info(`Expired ${result.rowCount} access passes`);
  }

  return result.rows;
}

/**
 * Validate an access pass by ID (for ongoing session validation)
 * @param {string} passId - The access pass ID
 * @returns {Promise<Object>} Validation result
 */
async function validatePassById(passId) {
  const result = await db.query(
    `
    SELECT * FROM access_passes
    WHERE id = $1
  `,
    [passId]
  );

  if (result.rows.length === 0) {
    return {
      isValid: false,
      reason: 'Access pass not found',
    };
  }

  const pass = result.rows[0];

  // Check status
  if (pass.status === 'expired') {
    return {
      isValid: false,
      reason: 'Access pass has expired',
    };
  }

  if (pass.status !== 'activated') {
    return {
      isValid: false,
      reason: 'Access pass is not active',
    };
  }

  // Check expiry time
  if (new Date(pass.expires_at) <= new Date()) {
    return {
      isValid: false,
      reason: 'Access pass has expired',
    };
  }

  const hoursRemaining = Math.ceil(
    (new Date(pass.expires_at) - new Date()) / (1000 * 60 * 60)
  );

  return {
    isValid: true,
    passId: pass.id,
    passType: pass.pass_type,
    expiresAt: pass.expires_at,
    hoursRemaining,
  };
}

module.exports = {
  getPassTypes,
  getPassType,
  checkUserAccess,
  getUserPasses,
  activatePass,
  ensureActivePass,
  createAccessPass,
  findPassByCheckoutSession,
  updatePassPayment,
  expireOldPasses,
  validatePassById,
};

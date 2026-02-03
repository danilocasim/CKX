/**
 * Access Service
 * Handles access pass logic for time-based exam access
 */

const db = require('../utils/db');
const logger = require('../utils/logger');

function formatRemainingHours(hours) {
  if (hours <= 0) return '0h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder > 0 ? `${days}d ${remainder}h` : `${days}d`;
}

async function getPassTypes() {
  const result = await db.query(
    'SELECT * FROM pass_types WHERE is_active = TRUE ORDER BY price_cents ASC'
  );
  return result.rows;
}

async function getPassType(passTypeId) {
  const result = await db.query(
    'SELECT * FROM pass_types WHERE id = $1 AND is_active = TRUE',
    [passTypeId]
  );
  return result.rows[0] || null;
}

async function checkUserAccess(userId) {
  const activePass = await db.query(
    `SELECT * FROM access_passes
     WHERE user_id = $1 AND status = 'activated' AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );

  if (activePass.rows.length > 0) {
    const pass = activePass.rows[0];
    const now = new Date();
    const expiresAt = new Date(pass.expires_at);
    const hoursRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
    return {
      hasValidPass: true,
      hasAccess: true,
      passId: pass.id,
      passType: pass.pass_type,
      activatedAt: pass.activated_at,
      expiresAt: pass.expires_at,
      hoursRemaining,
      remainingHuman: formatRemainingHours(hoursRemaining),
    };
  }

  const pendingPass = await db.query(
    `SELECT * FROM access_passes
     WHERE user_id = $1 AND status = 'purchased'
     ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );

  return {
    hasValidPass: false,
    hasPendingPass: pendingPass.rows.length > 0,
    pendingPassId: pendingPass.rows[0]?.id,
    pendingPassType: pendingPass.rows[0]?.pass_type,
  };
}

async function activatePass(passId, userId) {
  const passResult = await db.query(
    `SELECT * FROM access_passes
     WHERE id = $1 AND user_id = $2 AND status = 'purchased'`,
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
    `UPDATE access_passes
     SET status = 'activated', activated_at = $1, expires_at = $2
     WHERE id = $3`,
    [activatedAt, expiresAt, passId]
  );

  logger.info('Access pass activated', { passId, userId, expiresAt });

  return { passId, activatedAt, expiresAt, durationHours: pass.duration_hours };
}

async function ensureActivePass(userId) {
  const access = await checkUserAccess(userId);
  if (access.hasValidPass) return access;
  if (access.hasPendingPass) {
    await activatePass(access.pendingPassId, userId);
    return await checkUserAccess(userId);
  }
  return { hasValidPass: false };
}

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
    `INSERT INTO access_passes (
      user_id, pass_type, duration_hours, price_cents,
      stripe_payment_id, stripe_checkout_session_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'purchased')
    RETURNING *`,
    [
      userId,
      passTypeId,
      durationHours,
      priceCents,
      stripePaymentId,
      stripeCheckoutSessionId,
    ]
  );
  return result.rows[0];
}

async function findPassByCheckoutSession(sessionId) {
  const result = await db.query(
    'SELECT * FROM access_passes WHERE stripe_checkout_session_id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
}

async function updatePassPayment(passId, paymentIntentId) {
  await db.query(
    'UPDATE access_passes SET stripe_payment_id = $1 WHERE id = $2',
    [paymentIntentId, passId]
  );
}

module.exports = {
  getPassTypes,
  getPassType,
  checkUserAccess,
  activatePass,
  ensureActivePass,
  createAccessPass,
  findPassByCheckoutSession,
  updatePassPayment,
};

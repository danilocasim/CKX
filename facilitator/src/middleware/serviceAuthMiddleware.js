/**
 * Service-to-Service Authentication Middleware
 * CKX only trusts Sailor-Client (never browsers)
 *
 * Validates HMAC-signed requests or JWT service tokens from Sailor-Client
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');

const SERVICE_SECRET =
  process.env.SAILOR_CLIENT_SECRET ||
  process.env.SERVICE_SECRET ||
  'change-me-in-production';
const SERVICE_TOKEN_HEADER = 'X-Service-Token';
const SERVICE_SIGNATURE_HEADER = 'X-Service-Signature';
const SERVICE_TIMESTAMP_HEADER = 'X-Service-Timestamp';

/**
 * Validate HMAC signature from Sailor-Client
 * @param {string} body - Request body (stringified)
 * @param {string} signature - HMAC signature
 * @param {string} timestamp - Request timestamp
 * @returns {boolean} True if signature is valid
 */
function validateHMAC(body, signature, timestamp) {
  // Prevent replay attacks (5 minute window)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 300) {
    logger.warn('Service request timestamp out of range', { now, requestTime });
    return false;
  }

  // Compute expected signature
  const payload = `${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', SERVICE_SECRET)
    .update(payload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate JWT service token (alternative to HMAC)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded token or null
 */
function validateServiceToken(token) {
  try {
    // Simple JWT validation (can be enhanced with proper JWT library)
    // For now, expect a simple bearer token format
    if (token === SERVICE_SECRET) {
      return { service: 'sailor-client', valid: true };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Middleware: Require service-to-service authentication
 * Only allows requests from Sailor-Client (never browsers)
 */
function requireServiceAuth(req, res, next) {
  // Method 1: HMAC signature (preferred)
  const signature = req.headers[SERVICE_SIGNATURE_HEADER.toLowerCase()];
  const timestamp = req.headers[SERVICE_TIMESTAMP_HEADER.toLowerCase()];

  if (signature && timestamp) {
    const body = JSON.stringify(req.body || {});
    if (validateHMAC(body, signature, timestamp)) {
      req.serviceAuth = { method: 'hmac', service: 'sailor-client' };
      return next();
    }
    logger.warn('Invalid HMAC signature from service request', {
      path: req.path,
      ip: req.ip,
    });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid service signature',
    });
  }

  // Method 2: Service token (fallback)
  const serviceToken =
    req.headers[SERVICE_TOKEN_HEADER.toLowerCase()] ||
    req.headers.authorization?.replace('Service ', '');

  if (serviceToken) {
    const decoded = validateServiceToken(serviceToken);
    if (decoded) {
      req.serviceAuth = { method: 'token', service: decoded.service };
      return next();
    }
    logger.warn('Invalid service token', { path: req.path, ip: req.ip });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid service token',
    });
  }

  // No service auth provided
  logger.warn('Service authentication required but not provided', {
    path: req.path,
    ip: req.ip,
    headers: Object.keys(req.headers),
  });
  return res.status(403).json({
    error: 'Forbidden',
    message:
      'Service authentication required. This endpoint is only accessible by Sailor-Client.',
  });
}

/**
 * Middleware: Extract and validate session context from service request
 * Ensures exam_session_id, user_id, and expires_at are provided and valid
 */
function requireSessionContext(req, res, next) {
  const { exam_session_id, user_id, expires_at } = req.body;

  if (!exam_session_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'exam_session_id is required',
    });
  }

  if (!user_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'user_id is required',
    });
  }

  if (!expires_at) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'expires_at is required',
    });
  }

  // Validate expires_at is in the future
  const expiresAt = new Date(expires_at);
  if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'expires_at must be a valid future timestamp',
    });
  }

  req.sessionContext = {
    exam_session_id,
    user_id,
    expires_at: expiresAt.toISOString(),
  };

  next();
}

module.exports = {
  requireServiceAuth,
  requireSessionContext,
  validateHMAC,
  validateServiceToken,
};

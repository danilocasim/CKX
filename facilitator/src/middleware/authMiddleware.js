const authService = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Authenticate JWT token from Authorization header
 * Sets req.userId if valid
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = authService.verifyToken(token);

    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token type',
      });
    }

    req.userId = decoded.userId;
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message });

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token expired',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid token',
    });
  }
}

/**
 * Optional authentication - sets req.userId if token present and valid
 * Does not reject if no token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = authService.verifyToken(token);
    if (decoded.type === 'access') {
      req.userId = decoded.userId;
    }
  } catch (err) {
    // Ignore errors for optional auth
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuth,
};

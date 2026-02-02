const authService = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
async function register(req, res) {
  try {
    const { email, password, displayName } = req.body;
    const result = await authService.register({ email, password, displayName });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Registration failed', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode === 409 ? 'Conflict' : 'Registration Failed',
      message: error.message,
    });
  }
}

/**
 * Login user
 * POST /api/v1/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Unauthorized',
      message: error.message,
    });
  }
}

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Unauthorized',
      message: error.message,
    });
  }
}

/**
 * Logout user (revoke refresh token)
 * POST /api/v1/auth/logout
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Logout Failed',
      message: error.message,
    });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
};

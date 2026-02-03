/**
 * Authentication Service
 * Moved from CKX to Sailor-Client (Control Plane)
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../utils/db');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
  return bcrypt.hash(password, config.bcrypt.rounds);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate access and refresh tokens
 */
function generateTokens(userId) {
  const accessToken = jwt.sign({ userId, type: 'access' }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  });

  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: crypto.randomUUID() },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify a JWT token
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

/**
 * Register a new user
 */
async function register({ email, password, displayName }) {
  // Check if user exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [
    email.toLowerCase(),
  ]);
  if (existing.rows.length > 0) {
    const error = new Error('Email already registered');
    error.statusCode = 409;
    throw error;
  }

  // Hash password and create user
  const passwordHash = await hashPassword(password);
  const result = await db.query(
    `INSERT INTO users (email, password_hash, display_name) 
     VALUES ($1, $2, $3) 
     RETURNING id, email, display_name, created_at`,
    [email.toLowerCase(), passwordHash, displayName || null]
  );

  const user = result.rows[0];
  const tokens = generateTokens(user.id);

  // Store refresh token hash
  const tokenHash = crypto
    .createHash('sha256')
    .update(tokens.refreshToken)
    .digest('hex');
  const decoded = jwt.decode(tokens.refreshToken);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, new Date(decoded.exp * 1000)]
  );

  logger.info('User registered', { userId: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    },
  };
}

/**
 * Login a user
 */
async function login({ email, password }) {
  const result = await db.query(
    'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const user = result.rows[0];
  const validPassword = await comparePassword(password, user.password_hash);

  if (!validPassword) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const tokens = generateTokens(user.id);

  // Store refresh token hash
  const tokenHash = crypto
    .createHash('sha256')
    .update(tokens.refreshToken)
    .digest('hex');
  const decoded = jwt.decode(tokens.refreshToken);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, new Date(decoded.exp * 1000)]
  );

  logger.info('User logged in', { userId: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    },
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
    },
  };
}

/**
 * Refresh access token
 */
async function refreshAccessToken(refreshToken) {
  let decoded;
  try {
    decoded = verifyToken(refreshToken);
  } catch (err) {
    const error = new Error('Invalid or expired refresh token');
    error.statusCode = 401;
    throw error;
  }

  if (decoded.type !== 'refresh') {
    const error = new Error('Invalid token type');
    error.statusCode = 401;
    throw error;
  }

  // Verify token exists and not revoked
  const tokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');
  const result = await db.query(
    'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()',
    [tokenHash]
  );

  if (result.rows.length === 0) {
    const error = new Error('Refresh token revoked or expired');
    error.statusCode = 401;
    throw error;
  }

  // Generate new access token only
  const accessToken = jwt.sign(
    { userId: decoded.userId, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );

  return {
    accessToken,
    expiresIn: 900,
  };
}

/**
 * Logout - revoke refresh token
 */
async function logout(refreshToken) {
  const tokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');
  await db.query(
    'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1',
    [tokenHash]
  );
  logger.info('User logged out, refresh token revoked');
}

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  verifyToken,
  hashPassword,
  comparePassword,
};

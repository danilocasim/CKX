/**
 * Sailor-Client Configuration
 */

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  env: process.env.NODE_ENV || 'development',

  // Database (PostgreSQL)
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'ckx',
    user: process.env.POSTGRES_USER || 'ckx',
    password: process.env.POSTGRES_PASSWORD || 'ckx-dev-password',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'ckx-jwt-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Bcrypt
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_1234567890',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_1234567890',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_1234567890',
  },

  // CKX Execution Engine (internal APIs)
  ckx: {
    url: process.env.CKX_URL || 'http://facilitator:3000',
    serviceSecret:
      process.env.CKX_SERVICE_SECRET ||
      process.env.SAILOR_CLIENT_SECRET ||
      'change-me-in-production',
  },

  // App URL
  app: {
    url: process.env.APP_URL || 'http://localhost:30080',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

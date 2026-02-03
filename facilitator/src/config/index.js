require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  ssh: {
    host: process.env.SSH_HOST || 'jumphost',
    port: parseInt(process.env.SSH_PORT || '22', 10),
    username: process.env.SSH_USERNAME || 'candidate',
    password: process.env.SSH_PASSWORD,
    privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  remoteDesktop: {
    host: process.env.REMOTE_DESKTOP_HOST || 'remote-desktop',
    port: process.env.REMOTE_DESKTOP_PORT || 5000
  },

  db: {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'ckx',
    user: process.env.POSTGRES_USER || 'ckx',
    password: process.env.POSTGRES_PASSWORD || 'ckx-dev-password',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'ckx-dev-jwt-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },

  app: {
    url: process.env.APP_URL || 'http://localhost:30080',
  },
};

module.exports = config; 
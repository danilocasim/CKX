/**
 * Sailor-Client (Control Plane)
 * Business logic, auth, payments for CKX
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./utils/db');

// Routes
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const billingRoutes = require('./routes/billingRoutes');
const userRoutes = require('./routes/userRoutes');
const accessRoutes = require('./routes/accessRoutes');
const billingController = require('./controllers/billingController');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());

// Stripe webhook needs raw body - must be registered BEFORE json parser
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingController.handleWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/access', accessRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sailor-client' });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Sailor-Client Control Plane API',
    version: '1.0.0',
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal Server Error',
    message:
      config.env === 'development'
        ? err.message
        : 'An unexpected error occurred',
  });
});

// Initialize
(async () => {
  try {
    const dbConnected = await db.testConnection();
    if (dbConnected) {
      logger.info('PostgreSQL connected successfully');
    } else {
      logger.warn('PostgreSQL connection failed');
    }
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
})();

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Sailor-Client running on port ${PORT}`);
});

module.exports = app;

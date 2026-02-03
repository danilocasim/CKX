const express = require('express');
const http = require('http');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const logger = require('./utils/logger');
const redisClient = require('./utils/redisClient');
const db = require('./utils/db');
const authService = require('./services/authService');

// Import routes
const sshRoutes = require('./routes/sshRoutes');
const examRoutes = require('./routes/examRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const remoteDesktopRoutes = require('./routes/remoteDesktopRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const accessRoutes = require('./routes/accessRoutes');
const billingRoutes = require('./routes/billingRoutes');

// Import services for initialization
const portAllocator = require('./services/portAllocator');
const countdownService = require('./services/countdownService');

// Initialize Express app
const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes

// Stripe webhook needs raw body - must be registered BEFORE json parser
// Only the webhook endpoint needs raw body, other billing routes use JSON
const billingController = require('./controllers/billingController');
app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), billingController.handleWebhook);

app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// HTTP request logging
app.use(morgan('combined', { 
  stream: { 
    write: message => logger.http(message.trim()) 
  } 
}));

// API routes
app.use('/api/v1', sshRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/assements', assessmentRoutes);
app.use('/api/v1/remote-desktop', remoteDesktopRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/access', accessRoutes);
app.use('/api/v1/billing', billingRoutes); // Note: webhook is registered separately above

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Facilitator Service API',
    version: '1.0.0'
  });
});

// 404 Handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource ${req.originalUrl} was not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.env === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Initialize Socket.io with /countdown namespace
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  path: '/countdown/',
});

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.query.token || socket.handshake.auth.token;
  const examId = socket.handshake.query.examId || socket.handshake.auth.examId;

  // Validate examId is provided
  if (!examId) {
    logger.warn('WebSocket connection rejected: missing examId');
    return next(new Error('Missing examId'));
  }

  // Store examId on socket for later use
  socket.examId = examId;

  // If token is provided, validate it (optional auth for countdown)
  if (token) {
    try {
      const decoded = authService.verifyToken(token);
      if (decoded.type === 'access') {
        socket.userId = decoded.userId;
      }
    } catch (err) {
      // Token invalid but we allow anonymous connections for countdown
      logger.debug('WebSocket token invalid, allowing anonymous connection');
    }
  }

  next();
});

// Socket.io connection handler
io.on('connection', (socket) => {
  logger.info(`WebSocket client connected: ${socket.id} for exam ${socket.examId}`);

  // Handle client joining an exam room
  socket.on('join', async (data) => {
    const examId = data?.examId || socket.examId;
    if (examId) {
      await countdownService.handleClientJoin(socket, examId);
    } else {
      socket.emit('error', { code: 'MISSING_EXAM_ID', message: 'Exam ID required' });
    }
  });

  // Auto-join the exam room from handshake
  if (socket.examId) {
    countdownService.handleClientJoin(socket, socket.examId);
  }

  // Handle ping for connection health
  socket.on('ping', () => {
    socket.emit('pong', { serverTime: new Date().toISOString() });
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.debug(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

// Initialize countdown service with Socket.io
countdownService.initialize(io);

// Initialize Redis connection and port allocator
(async () => {
  try {
    await redisClient.connect();
    logger.info('Redis connected successfully');

    // Initialize port allocator with Redis client
    await portAllocator.initialize(redisClient);
    logger.info('Port allocator initialized');

    // Test database connection
    const dbConnected = await db.testConnection();
    if (dbConnected) {
      logger.info('PostgreSQL connected successfully');
    } else {
      logger.warn('PostgreSQL connection failed - auth features may not work');
    }
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
})();

// Start the server (use http server for Socket.io)
const PORT = config.port;
server.listen(PORT, () => {
  logger.info(`Server running in ${config.env} mode on port ${PORT}`);
  logger.info(`WebSocket countdown available at /countdown/`);
});

module.exports = { app, server, io }; // Export for testing 
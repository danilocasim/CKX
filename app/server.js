const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketio = require('socket.io');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const PublicService = require('./services/public-service');
const terminalSessionManager = require('./services/terminal-session-manager');
const RouteService = require('./services/route-service');
const VNCService = require('./services/vnc-service');
const AuthService = require('./services/auth-service');

// Server configuration
const PORT = process.env.PORT || 3000;

// VNC service configuration from environment variables
const VNC_SERVICE_HOST =
  process.env.VNC_SERVICE_HOST || 'remote-desktop-service';
const VNC_SERVICE_PORT = process.env.VNC_SERVICE_PORT || 6901;
const VNC_PASSWORD = process.env.VNC_PASSWORD || 'bakku-the-wizard'; // Default password

// SSH service configuration
const SSH_HOST = process.env.SSH_HOST || 'remote-terminal'; // Use remote-terminal service
const SSH_PORT = process.env.SSH_PORT || 22;
const SSH_USER = process.env.SSH_USER || 'candidate';
const SSH_PASSWORD = process.env.SSH_PASSWORD || 'password';

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Initialize Auth Service
const authService = new AuthService();

const sshConfig = {
  host: SSH_HOST,
  port: parseInt(SSH_PORT, 10) || 22,
  username: SSH_USER,
  password: SSH_PASSWORD,
};

// Initialize Public Service
const publicService = new PublicService(path.join(__dirname, 'public'));
publicService.initialize();

// Initialize VNC Service
const vncService = new VNCService({
  host: VNC_SERVICE_HOST,
  port: VNC_SERVICE_PORT,
  password: VNC_PASSWORD,
});

// SSH terminal namespace: runtime keyed by terminalSessionId only; require terminalSessionId + examId + token
const sshIO = io.of('/ssh');
sshIO.on('connection', async (socket) => {
  const terminalSessionId =
    socket.handshake.query.terminalSessionId ||
    socket.handshake.auth?.terminalSessionId;
  const examId = socket.handshake.query.examId || socket.handshake.auth?.examId;
  const token = socket.handshake.query.token || socket.handshake.auth?.token;
  if (!terminalSessionId || !examId || !token) {
    socket.emit('error', {
      message: 'terminalSessionId, examId, and token are required to connect',
    });
    socket.disconnect(true);
    return;
  }
  const valid = await terminalSessionManager.validateWithFacilitator(
    terminalSessionId,
    examId,
    token
  );
  if (!valid) {
    socket.emit('error', {
      message:
        'Terminal access denied. You do not have access to this terminal session.',
    });
    socket.disconnect(true);
    return;
  }
  terminalSessionManager.addSocket(terminalSessionId, socket, sshConfig);
});

// Initialize Route Service (pass authService for set-cookie route)
const routeService = new RouteService(publicService, vncService, authService);

// Enable CORS
app.use(cors());

// Cookie parser for auth
app.use(cookieParser());

// Proxy /facilitator to facilitator service (so login and API calls return JSON, not SPA HTML).
// pathRewrite: /facilitator/api/v1/... -> /api/v1/... so facilitator receives correct path.
// In Docker use facilitator:3000. When running webapp locally (npm run dev), use localhost:3001 (facilitator port in docker-compose).
const facilitatorUrl =
  process.env.FACILITATOR_URL ||
  (fs.existsSync('/.dockerenv')
    ? 'http://facilitator:3000'
    : 'http://localhost:3001');
app.use(
  '/facilitator',
  createProxyMiddleware({
    target: facilitatorUrl,
    changeOrigin: true,
    pathRewrite: { '^/facilitator': '' },
    onError(err, req, res) {
      console.error('Facilitator proxy error', err.message);
      res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message:
          'Authentication service unavailable. Is the facilitator running?',
      });
    },
  })
);

// Auth middleware - protect all routes
app.use(authService.authMiddleware());

// Serve React SPA build first (so / and /assets/* come from dist when present)
const distDir = path.join(publicService.getPublicDir(), 'dist');
app.use(express.static(distDir));
// Then legacy static files (exam, results assets: /js/exam.js, /css/exam.css, etc.)
app.use(express.static(publicService.getPublicDir()));

// Setup VNC proxy
vncService.setupVNCProxy(app);

// Setup routes
routeService.setupRoutes(app);

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `VNC proxy configured to ${VNC_SERVICE_HOST}:${VNC_SERVICE_PORT}`
  );
  console.log(`SSH service configured to ${SSH_HOST}:${SSH_PORT}`);
});

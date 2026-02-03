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

// Facilitator base URL for VNC routing (same as proxy target, without /facilitator path)
const facilitatorBaseUrl =
  process.env.FACILITATOR_URL ||
  (fs.existsSync('/.dockerenv')
    ? 'http://facilitator:3000'
    : 'http://localhost:3001');

// Initialize VNC Service (dynamic routing when examId + auth; uses facilitator routing API)
const vncService = new VNCService({
  host: VNC_SERVICE_HOST,
  port: VNC_SERVICE_PORT,
  password: VNC_PASSWORD,
  facilitatorUrl: facilitatorBaseUrl,
  getTokenFromRequest: (req) =>
    req && req.cookies && req.cookies.ckx_token ? req.cookies.ckx_token : null,
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
  const validation = await terminalSessionManager.validateWithFacilitator(
    terminalSessionId,
    examId,
    token
  );
  if (!validation.valid) {
    socket.emit('error', {
      message:
        'Terminal access denied. You do not have access to this terminal session.',
    });
    socket.disconnect(true);
    return;
  }
  const resolvedSshConfig = {
    ...sshConfig,
    host: validation.sshHost || sshConfig.host,
    port: validation.sshPort != null ? validation.sshPort : sshConfig.port,
  };
  console.log('Terminal attach (isolated runtime per connection)', {
    terminalSessionId,
    examId,
    socketId: socket.id,
    sshHost: resolvedSshConfig.host,
    sshPort: resolvedSshConfig.port,
  });
  terminalSessionManager.addSocket(
    terminalSessionId,
    socket,
    resolvedSshConfig
  );
});

// Initialize Route Service (pass authService for set-cookie route)
const routeService = new RouteService(publicService, vncService, authService);

// Enable CORS
app.use(cors());

// Cookie parser for auth
app.use(cookieParser());

// Proxy /sailor-client to Sailor-Client service (Control Plane - auth, payments, business logic)
// In Docker use sailor-client:4000. When running webapp locally (npm run dev), use localhost:4001.
const sailorClientUrl =
  process.env.SAILOR_CLIENT_URL ||
  (fs.existsSync('/.dockerenv')
    ? 'http://sailor-client:4000'
    : 'http://localhost:4001');
app.use(
  '/sailor-client',
  createProxyMiddleware({
    target: sailorClientUrl,
    changeOrigin: true,
    pathRewrite: { '^/sailor-client': '' },
    onError(err, req, res) {
      console.error('Sailor-Client proxy error', err.message);
      res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'Control plane service unavailable. Is Sailor-Client running?',
      });
    },
  })
);

// Proxy /facilitator to facilitator service (CKX Execution Engine - internal APIs only)
// Browsers should NOT call these directly - use Sailor-Client instead
// Kept for backward compatibility and internal service-to-service calls
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
        message: 'Execution engine unavailable. Is the facilitator running?',
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

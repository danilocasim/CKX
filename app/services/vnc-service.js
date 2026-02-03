const { createProxyMiddleware } = require('http-proxy-middleware');

const defaultTarget = (config) => `http://${config.host}:${config.port}`;

class VNCService {
  constructor(config) {
    this.config = {
      host: config.host || 'remote-desktop-service',
      port: config.port || 6901,
      password: config.password || 'bakku-the-wizard',
      facilitatorUrl: config.facilitatorUrl || null,
      getTokenFromRequest: config.getTokenFromRequest || (() => null),
    };

    const baseTarget = defaultTarget(this.config);
    this.vncProxyConfig = {
      target: baseTarget,
      changeOrigin: true,
      ws: true,
      secure: false,
      pathRewrite: { '^/vnc-proxy': '' },
      router: (req) => {
        // STRICT ISOLATION: Never route to shared when dedicated required
        if (req.vncTarget === null) {
          // Return a non-existent target so proxy fails (isolation breach prevented)
          return 'http://127.0.0.1:1';
        }
        return req.vncTarget ? req.vncTarget : baseTarget;
      },
      onProxyReq: (proxyReq, req) => {
        console.log(`Proxying HTTP request to VNC: ${req.url}`);
      },
      onProxyReqWs: (proxyReq, req) => {
        console.log(`WebSocket to VNC: ${req.url}`);
      },
      onError: (err, req, res) => {
        console.error(`VNC proxy error: ${err.message}`);
        if (res && res.writeHead) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Proxy error: ${err.message}`);
        }
      },
    };
  }

  async resolveVncTarget(req) {
    const examId =
      (req.query && req.query.examId) ||
      (req.cookies && req.cookies.ckx_vnc_exam);
    if (
      !examId ||
      !this.config.facilitatorUrl ||
      !this.config.getTokenFromRequest
    ) {
      req.vncTarget = defaultTarget(this.config);
      return;
    }
    const token = this.config.getTokenFromRequest(req);
    try {
      const base = this.config.facilitatorUrl.replace(/\/$/, '');
      const res = await fetch(
        `${base}/api/v1/remote-desktop/routing/${examId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        // STRICT ISOLATION: 403 means dedicated runtime required but unavailable - fail, don't fall back to shared
        if (res.status === 403) {
          console.error(
            'ISOLATION BREACH PREVENTED: Dedicated VNC runtime required but unavailable',
            {
              examId,
              status: res.status,
            }
          );
          req.vncTarget = null; // Signal error - proxy will fail
          return;
        }
        // Other errors: fall back only for anonymous (no token)
        if (!token) {
          req.vncTarget = defaultTarget(this.config);
          return;
        }
        // Authenticated user with non-403 error: fail
        req.vncTarget = null;
        return;
      }
      const data = await res.json();
      if (data.useShared || !data.vnc) {
        // STRICT ISOLATION: Authenticated users cannot use shared
        if (token) {
          console.error(
            'ISOLATION BREACH PREVENTED: Authenticated user cannot use shared VNC',
            {
              examId,
            }
          );
          req.vncTarget = null;
          return;
        }
        // Anonymous can use shared
        req.vncTarget = defaultTarget(this.config);
        return;
      }
      req.vncTarget = `http://${data.vnc.host}:${data.vnc.port}`;
    } catch (e) {
      console.error('VNC routing resolve failed:', e.message);
      req.vncTarget = defaultTarget(this.config);
    }
  }

  setupVNCProxy(app) {
    const self = this;
    app.use(
      '/vnc-proxy',
      (req, res, next) => {
        self.resolveVncTarget(req).then(() => {
          // STRICT ISOLATION: If dedicated runtime required but unavailable, return 403
          if (req.vncTarget === null) {
            return res.status(403).json({
              error: 'Forbidden',
              message:
                'Dedicated VNC runtime is required but unavailable. Please end this exam and try again.',
            });
          }
          if (req.query.examId && res.cookie) {
            res.cookie('ckx_vnc_exam', req.query.examId, {
              maxAge: 120000,
              httpOnly: true,
              path: '/',
              sameSite: 'lax',
            });
          }
          if (!req.query.password) {
            const separator = req.url.includes('?') ? '&' : '?';
            req.url = `${req.url}${separator}password=${this.config.password}`;
          }
          next();
        });
      },
      createProxyMiddleware(this.vncProxyConfig)
    );

    const wsConfig = {
      ...this.vncProxyConfig,
      pathRewrite: { '^/websockify': '/websockify' },
      ws: true,
      router: (req) => {
        if (req.vncTarget === null) {
          return 'http://127.0.0.1:1'; // Fail connection (isolation breach prevented)
        }
        return req.vncTarget ? req.vncTarget : defaultTarget(this.config);
      },
      onProxyReqWs: (proxyReq, req) => {
        proxyReq.setHeader(
          'Origin',
          `http://${
            req.vncTarget ? new URL(req.vncTarget).host : this.config.host
          }:${this.config.port}`
        );
      },
    };
    app.use(
      '/websockify',
      (req, res, next) => {
        self.resolveVncTarget(req).then(() => next());
      },
      createProxyMiddleware(wsConfig)
    );
  }

  getVNCInfo() {
    return {
      host: this.config.host,
      port: this.config.port,
      wsUrl: '/websockify',
      defaultPassword: this.config.password,
      status: 'connected',
    };
  }
}

module.exports = VNCService;

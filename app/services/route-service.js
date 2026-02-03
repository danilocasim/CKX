const path = require('path');
const fs = require('fs');

const facilitatorBaseUrl =
  process.env.FACILITATOR_URL ||
  (fs.existsSync && fs.existsSync('/.dockerenv')
    ? 'http://facilitator:3000'
    : 'http://localhost:3001');

class RouteService {
  constructor(publicService, vncService, authService) {
    this.publicService = publicService;
    this.vncService = vncService;
    this.authService = authService;
  }

  setupRoutes(app) {
    // API endpoint to get VNC server info (optionally per-exam routing when examId provided)
    app.get('/api/vnc-info', async (req, res) => {
      const examId = req.query.examId;
      const token = req.cookies && req.cookies.ckx_token;
      const base = this.vncService.getVNCInfo();
      if (!examId || !token) {
        return res.json({ ...base, useShared: true });
      }
      try {
        const r = await fetch(
          `${facilitatorBaseUrl.replace(
            /\/$/,
            ''
          )}/api/v1/remote-desktop/routing/${examId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return res.json({ ...base, useShared: true });
        const data = await r.json();
        if (data.useShared || !data.vnc)
          return res.json({ ...base, useShared: true });
        res.json({
          ...base,
          useShared: false,
          vncHost: data.vnc.host,
          vncPort: data.vnc.port,
          proxyUrl: `/vnc-proxy/?examId=${encodeURIComponent(examId)}`,
        });
      } catch (e) {
        res.json({ ...base, useShared: true });
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', message: 'Service is healthy' });
    });

    // Set cookie after CKX login: GET /auth/set-cookie?token=...&redirect=/dashboard
    if (this.authService) {
      app.get('/auth/set-cookie', (req, res) => {
        const token = req.query.token;
        const redirectPath =
          req.query.redirect && req.query.redirect.startsWith('/')
            ? req.query.redirect
            : '/dashboard';
        if (!token) {
          return res.redirect('/login');
        }
        const result = this.authService.verifyToken(token);
        if (!result.valid) {
          return res.redirect('/login');
        }
        res.cookie('ckx_token', token, {
          httpOnly: true,
          maxAge: 15 * 60 * 1000,
          sameSite: 'lax',
        });
        res.redirect(redirectPath);
      });
    }

    // Catch-all: serve exam/results/answers as legacy HTML; everything else as SPA (dist/index.html) when built
    const publicDir = this.publicService.getPublicDir();
    const distIndex = path.join(publicDir, 'dist', 'index.html');
    const hasSpa = fs.existsSync(distIndex);

    app.get('*', (req, res) => {
      if (req.path === '/exam') {
        return res.sendFile(path.join(publicDir, 'exam.html'));
      }
      if (req.path === '/results') {
        return res.sendFile(path.join(publicDir, 'results.html'));
      }
      if (req.path === '/answers') {
        return res.sendFile(path.join(publicDir, 'answers.html'));
      }
      if (hasSpa) {
        return res.sendFile(distIndex);
      }
      // Fallback when React app not built: legacy HTML
      if (req.path === '/payment/success') {
        return res.sendFile(path.join(publicDir, 'payment-success.html'));
      }
      if (req.path === '/pricing') {
        return res.sendFile(path.join(publicDir, 'pricing.html'));
      }
      if (req.path === '/login') {
        return res.sendFile(path.join(publicDir, 'login.html'));
      }
      if (req.path === '/register') {
        return res.sendFile(path.join(publicDir, 'register.html'));
      }
      if (req.path === '/dashboard') {
        return res.sendFile(path.join(publicDir, 'dashboard.html'));
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });

    // Handle errors
    app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res
        .status(500)
        .sendFile(path.join(this.publicService.getPublicDir(), '50x.html'));
    });
  }
}

module.exports = RouteService;

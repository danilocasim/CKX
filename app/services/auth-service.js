const jwt = require('jsonwebtoken');

// JWT secret must match facilitator's secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Public paths that do not require authentication (CKX login/register/payment)
const PUBLIC_PATHS = ['/login', '/register', '/payment/success', '/auth/set-cookie'];

class AuthService {
    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return { valid: true, decoded };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Get login redirect URL (CKX login page with return URL)
     */
    getLoginUrl(returnUrl = '/') {
        const base = typeof window !== 'undefined' ? '' : '';
        return `/login?redirect=${encodeURIComponent(returnUrl)}`;
    }

    /**
     * Auth middleware - checks for valid token in cookie or query param
     */
    authMiddleware() {
        return (req, res, next) => {
            // Skip auth for health check and static assets
            if (req.path === '/health' ||
                req.path.startsWith('/css/') ||
                req.path.startsWith('/js/') ||
                req.path.startsWith('/assets/') ||
                req.path === '/favicon.ico') {
                return next();
            }

            // Public paths (CKX login, register, payment success, set-cookie)
            if (PUBLIC_PATHS.includes(req.path)) {
                return next();
            }

            // Logout endpoint - clear cookie and redirect to CKX login
            if (req.path === '/logout') {
                res.clearCookie('ckx_token');
                return res.redirect('/login');
            }

            // Check for token in query param (e.g. from external link with ?token=)
            const queryToken = req.query.token;
            if (queryToken) {
                const result = this.verifyToken(queryToken);
                if (result.valid) {
                    res.cookie('ckx_token', queryToken, {
                        httpOnly: true,
                        maxAge: 15 * 60 * 1000,
                        sameSite: 'lax'
                    });
                    req.user = result.decoded;
                    const cleanUrl = req.path + (req.query.id ? `?id=${req.query.id}` : '');
                    return res.redirect(cleanUrl);
                }
            }

            // Check for token in cookie
            const cookieToken = req.cookies?.ckx_token;
            if (cookieToken) {
                const result = this.verifyToken(cookieToken);
                if (result.valid) {
                    req.user = result.decoded;
                    return next();
                }
                res.clearCookie('ckx_token');
            }

            // No valid token - redirect to CKX login
            return res.redirect(this.getLoginUrl(req.originalUrl));
        };
    }
}

module.exports = AuthService;

const jwt = require('jsonwebtoken');

// JWT secret must match facilitator's secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Sailor-client URL for redirects
const SAILOR_CLIENT_URL = process.env.SAILOR_CLIENT_URL || 'http://localhost:3001';

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
     * Get login redirect URL
     */
    getLoginUrl(returnUrl = '/') {
        return `${SAILOR_CLIENT_URL}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
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

            // Logout endpoint - clear cookie and redirect to sailor-client
            if (req.path === '/logout') {
                res.clearCookie('ckx_token');
                return res.redirect(`${SAILOR_CLIENT_URL}/login`);
            }

            // Check for token in query param (from sailor-client redirect)
            const queryToken = req.query.token;
            if (queryToken) {
                const result = this.verifyToken(queryToken);
                if (result.valid) {
                    // Set cookie for future requests
                    res.cookie('ckx_token', queryToken, {
                        httpOnly: true,
                        maxAge: 15 * 60 * 1000, // 15 minutes (matches JWT expiry)
                        sameSite: 'lax'
                    });
                    req.user = result.decoded;
                    
                    // Redirect to remove token from URL (security)
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
                // Clear invalid cookie
                res.clearCookie('ckx_token');
            }

            // No valid token - redirect to login
            const returnUrl = `http://localhost:30080${req.originalUrl}`;
            return res.redirect(this.getLoginUrl(returnUrl));
        };
    }
}

module.exports = AuthService;

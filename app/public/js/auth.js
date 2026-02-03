/**
 * CKX Authentication Utilities
 * Handles token storage, refresh, and API calls with Bearer token
 */
const Auth = {
  getToken: () => localStorage.getItem('accessToken'),
  getRefreshToken: () => localStorage.getItem('refreshToken'),

  setTokens: (access, refresh) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  },

  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  isAuthenticated: () => !!localStorage.getItem('accessToken'),

  async login(email, password) {
    const response = await fetch('/facilitator/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }

    const data = await response.json();
    const d = data.data || data;
    const access =
      d.tokens && d.tokens.accessToken ? d.tokens.accessToken : d.accessToken;
    const refresh =
      d.tokens && d.tokens.refreshToken
        ? d.tokens.refreshToken
        : d.refreshToken;
    this.setTokens(access, refresh);
    return d.user;
  },

  async register(email, password, displayName) {
    const response = await fetch('/facilitator/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        displayName: displayName || undefined,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }

    const data = await response.json();
    const d = data.data || data;
    const access =
      d.tokens && d.tokens.accessToken ? d.tokens.accessToken : d.accessToken;
    const refresh =
      d.tokens && d.tokens.refreshToken
        ? d.tokens.refreshToken
        : d.refreshToken;
    this.setTokens(access, refresh);
    return d.user;
  },

  async logout() {
    const refreshToken = this.getRefreshToken();
    try {
      await fetch('/facilitator/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (e) {
      // Ignore
    }
    this.clearTokens();
    window.location.href = '/logout';
  },

  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await fetch('/facilitator/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (response.ok) {
        const data = await response.json();
        const d = data.data || data;
        const access =
          d.tokens && d.tokens.accessToken
            ? d.tokens.accessToken
            : d.accessToken;
        if (access) localStorage.setItem('accessToken', access);
        return !!access;
      }
    } catch (e) {}
    return false;
  },

  async getUser() {
    if (!this.getToken()) return null;
    const response = await this.fetch('/facilitator/api/v1/users/me');
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  },

  async fetch(url, options = {}) {
    const token = this.getToken();
    options.headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    let response = await fetch(url, options);

    if (response.status === 401 && this.getToken()) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        options.headers['Authorization'] = `Bearer ${this.getToken()}`;
        response = await fetch(url, options);
      } else {
        this.clearTokens();
        window.location.href =
          '/login?redirect=' +
          encodeURIComponent(window.location.pathname + window.location.search);
      }
    }

    return response;
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href =
        '/login?redirect=' +
        encodeURIComponent(window.location.pathname + window.location.search);
      return false;
    }
    return true;
  },
};

window.Auth = Auth;

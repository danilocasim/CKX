import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const getToken = () => localStorage.getItem('accessToken');
const getRefreshToken = () => localStorage.getItem('refreshToken');

const setTokens = (access, refresh) => {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

export function AuthProvider({ children }) {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const login = useCallback(
    async (email, password) => {
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
      const access = d.tokens?.accessToken ?? d.accessToken;
      const refreshToken = d.tokens?.refreshToken ?? d.refreshToken;
      setTokens(access, refreshToken);
      refresh();
      return d.user;
    },
    [refresh]
  );

  const register = useCallback(
    async (email, password, displayName) => {
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
      const access = d.tokens?.accessToken ?? d.accessToken;
      const refreshToken = d.tokens?.refreshToken ?? d.refreshToken;
      setTokens(access, refreshToken);
      refresh();
      return d.user;
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await fetch('/facilitator/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (_) {}
    clearTokens();
    refresh();
    window.location.href = '/logout';
  }, [refresh]);

  const refreshToken = useCallback(async () => {
    const refreshToken = getRefreshToken();
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
        const access = d.tokens?.accessToken ?? d.accessToken;
        if (access) localStorage.setItem('accessToken', access);
        refresh();
        return !!access;
      }
    } catch (_) {}
    return false;
  }, [refresh]);

  const fetchWithAuth = useCallback(
    async (url, options = {}) => {
      const token = getToken();
      options.headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      let response = await fetch(url, options);
      if (response.status === 401 && getToken()) {
        const refreshed = await refreshToken();
        if (refreshed) {
          options.headers['Authorization'] = `Bearer ${getToken()}`;
          response = await fetch(url, options);
        } else {
          clearTokens();
          refresh();
          window.location.href =
            '/login?redirect=' +
            encodeURIComponent(
              window.location.pathname + window.location.search
            );
        }
      }
      return response;
    },
    [refreshToken, refresh]
  );

  const getUser = useCallback(async () => {
    if (!getToken()) return null;
    const response = await fetchWithAuth('/facilitator/api/v1/users/me');
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  }, [fetchWithAuth]);

  const isAuthenticated = () => !!getToken();

  const value = {
    getToken,
    isAuthenticated,
    login,
    register,
    logout,
    getUser,
    fetchWithAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

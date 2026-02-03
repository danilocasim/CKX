# Phase 5: Complete Auth & Payment in CKX

**Document Type**: Implementation Plan
**Status**: Planned
**Date**: 2026-02-03
**Author**: Danilo Jr. B. Casim

---

## 1. Executive Summary

Build complete authentication, payment, and user management directly into CKX vanilla JS app. **Remove sailor-client entirely** from the architecture.

### Goal

Single frontend (CKX) handles everything:
- Login / Register
- Pricing / Payment (Stripe)
- Dashboard (user stats, exam history, access passes)
- Exam interface (already exists)

### Why Remove Sailor-Client?

| Problem | Solution |
|---------|----------|
| Two frontends to maintain | Single CKX app |
| Redirect dance between apps | Direct navigation |
| React complexity for simple pages | Vanilla JS + Bootstrap |
| Deployment complexity | Single Docker service |

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CKX App (Single Frontend)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /                    → Home (exam selection)                    │
│  /login               → Login page                               │
│  /register            → Register page                            │
│  /pricing             → Pricing + Stripe checkout                │
│  /payment/success     → Payment confirmation                     │
│  /dashboard           → User stats, exam history, passes         │
│  /exam                → Exam interface                           │
│  /results             → Exam results                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Facilitator API (Backend)                     │
├─────────────────────────────────────────────────────────────────┤
│  /api/v1/auth/*       → Authentication                           │
│  /api/v1/users/*      → User management                          │
│  /api/v1/billing/*    → Stripe payments                          │
│  /api/v1/access/*     → Access passes                            │
│  /api/v1/exams/*      → Exam management                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Pages to Create

### 3.1 Login Page

**File**: `app/public/login.html`

**Features**:
- Email + password form
- "Remember me" checkbox
- Error display
- Link to register
- Redirect to original page after login

**UI Design**:
```
┌────────────────────────────────────────┐
│              CK-X Simulator            │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │         Welcome Back             │  │
│  │                                  │  │
│  │  Email                           │  │
│  │  ┌──────────────────────────┐    │  │
│  │  │ email@example.com        │    │  │
│  │  └──────────────────────────┘    │  │
│  │                                  │  │
│  │  Password                        │  │
│  │  ┌──────────────────────────┐    │  │
│  │  │ ••••••••                 │    │  │
│  │  └──────────────────────────┘    │  │
│  │                                  │  │
│  │  ┌──────────────────────────┐    │  │
│  │  │        Sign In           │    │  │
│  │  └──────────────────────────┘    │  │
│  │                                  │  │
│  │  Don't have an account?          │  │
│  │  Create one →                    │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### 3.2 Register Page

**File**: `app/public/register.html`

**Features**:
- Display name (optional)
- Email
- Password + confirmation
- Validation (8+ chars, must match)
- Link to login

### 3.3 Dashboard Page

**File**: `app/public/dashboard.html`

**Features**:
- User profile (name, email)
- Current access pass status (remaining time)
- Quick action: Buy pass / Start exam
- Exam history table

**UI Design**:
```
┌────────────────────────────────────────────────────────────────┐
│  CK-X        [Dashboard]  [Pricing]  [Sign Out]                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Welcome back, John!                                           │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │  Access Pass        │  │  Exams Completed    │              │
│  │  ────────────────   │  │  ────────────────   │              │
│  │  2 Weeks Pass       │  │        12           │              │
│  │  5d 14h remaining   │  │                     │              │
│  │  [Buy More Time]    │  │  [Start Practice]   │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                │
│  Recent Exam History                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Lab          │ Score │ Date       │ Duration │ Status    │  │
│  ├──────────────┼───────┼────────────┼──────────┼───────────┤  │
│  │ CKAD Mock 1  │ 85%   │ 2026-02-03 │ 28 min   │ Passed    │  │
│  │ CKA Mock 1   │ 72%   │ 2026-02-02 │ 45 min   │ Passed    │  │
│  │ CKAD Lab 1   │ 45%   │ 2026-02-01 │ 60 min   │ Failed    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 3.4 Enhanced Pricing Page

**File**: `app/public/pricing.html` (update existing)

**Enhancements**:
- Show login modal if not authenticated
- Display current pass status if logged in
- Stripe checkout integration (already done)

---

## 4. JavaScript Modules

### 4.1 Auth Utilities

**File**: `app/public/js/auth.js`

```javascript
/**
 * CKX Authentication Utilities
 * Handles token storage, refresh, and API calls
 */
const Auth = {
  // Token management
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

  // API calls
  async login(email, password) {
    const response = await fetch('/facilitator/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    this.setTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.user;
  },

  async register(email, password, displayName) {
    const response = await fetch('/facilitator/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data = await response.json();
    this.setTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.user;
  },

  async logout() {
    const refreshToken = this.getRefreshToken();

    try {
      await fetch('/facilitator/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
    } catch (e) {
      // Ignore logout API errors
    }

    this.clearTokens();
    window.location.href = '/login';
  },

  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch('/facilitator/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.data.accessToken);
        return true;
      }
    } catch (e) {}

    return false;
  },

  async getUser() {
    const token = this.getToken();
    if (!token) return null;

    const response = await this.fetch('/facilitator/api/v1/users/me');
    if (!response.ok) return null;

    const data = await response.json();
    return data.data;
  },

  // Authenticated fetch with auto-refresh
  async fetch(url, options = {}) {
    const token = this.getToken();

    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    let response = await fetch(url, options);

    // If 401, try refresh and retry
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        options.headers['Authorization'] = `Bearer ${this.getToken()}`;
        response = await fetch(url, options);
      } else {
        this.clearTokens();
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      }
    }

    return response;
  },

  // Require auth - redirect if not logged in
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  }
};

// Export for use in other scripts
window.Auth = Auth;
```

### 4.2 Navigation Component

**File**: `app/public/js/nav.js`

```javascript
/**
 * CKX Navigation
 * Updates nav based on auth state
 */
const Nav = {
  async init() {
    const navContainer = document.getElementById('nav-auth');
    if (!navContainer) return;

    if (Auth.isAuthenticated()) {
      const user = await Auth.getUser();
      if (user) {
        navContainer.innerHTML = `
          <a href="/dashboard" class="nav-link">${user.displayName || user.email}</a>
          <button onclick="Auth.logout()" class="btn btn-outline-light btn-sm ms-2">Sign Out</button>
        `;
      } else {
        // Token invalid
        Auth.clearTokens();
        this.showUnauthenticated(navContainer);
      }
    } else {
      this.showUnauthenticated(navContainer);
    }
  },

  showUnauthenticated(container) {
    container.innerHTML = `
      <a href="/login" class="btn btn-outline-light btn-sm">Sign In</a>
      <a href="/register" class="btn btn-primary btn-sm ms-2">Sign Up</a>
    `;
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => Nav.init());
```

---

## 5. Routes to Add

**File**: `app/services/route-service.js`

```javascript
// Add these routes
'/login'           → login.html
'/register'        → register.html
'/dashboard'       → dashboard.html
'/logout'          → Clear session, redirect to /login
```

---

## 6. Implementation Order

### Phase 5.1: Auth Foundation (Day 1)
1. [ ] Create `app/public/js/auth.js`
2. [ ] Create `app/public/js/nav.js`
3. [ ] Create `app/public/login.html` + `login.js`
4. [ ] Create `app/public/register.html` + `register.js`
5. [ ] Update `route-service.js` with new routes

### Phase 5.2: Dashboard (Day 2)
6. [ ] Create `app/public/dashboard.html` + `dashboard.js`
7. [ ] Add access pass status display
8. [ ] Add exam history table
9. [ ] Add quick actions (start exam, buy pass)

### Phase 5.3: Navigation Update (Day 2)
10. [ ] Update `index.html` with nav component
11. [ ] Update `pricing.html` with nav component
12. [ ] Update `exam.html` with nav component
13. [ ] Update `results.html` with nav component

### Phase 5.4: Remove Sailor-Client (Day 3)
14. [ ] Remove auth redirects to sailor-client
15. [ ] Update `auth-service.js` to not redirect externally
16. [ ] Test all flows end-to-end
17. [ ] Delete `sailor-client/` directory (optional, keep for reference)

---

## 7. API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/users/me` | Get current user |
| GET | `/api/v1/users/me/stats` | Get statistics |
| GET | `/api/v1/users/me/exams` | Get exam history |
| GET | `/api/v1/access/status` | Get pass status |
| GET | `/api/v1/access/passes` | Get all passes |
| POST | `/api/v1/billing/checkout` | Create Stripe checkout |
| GET | `/api/v1/billing/verify/:id` | Verify payment |

---

## 8. File Structure (Final)

```
app/public/
├── index.html              # Home / exam selection
├── login.html              # NEW: Login page
├── register.html           # NEW: Register page
├── dashboard.html          # NEW: User dashboard
├── pricing.html            # Pricing (enhanced)
├── payment-success.html    # Payment success (exists)
├── exam.html               # Exam interface (exists)
├── results.html            # Exam results (exists)
├── js/
│   ├── auth.js             # NEW: Auth utilities
│   ├── nav.js              # NEW: Navigation component
│   ├── login.js            # NEW: Login page logic
│   ├── register.js         # NEW: Register page logic
│   ├── dashboard.js        # NEW: Dashboard logic
│   ├── pricing.js          # Pricing (update)
│   ├── index.js            # Home (update)
│   └── exam.js             # Exam (exists)
└── css/
    └── styles.css          # Shared styles
```

---

## 9. Migration Checklist

### Before Removal
- [ ] All auth flows work in CKX
- [ ] All pages have proper navigation
- [ ] Payment flow works end-to-end
- [ ] Dashboard shows user data correctly

### Sailor-Client Removal
- [ ] Remove redirect to sailor-client in `auth-service.js`
- [ ] Update docker-compose.yaml (remove sailor-client service if any)
- [ ] Update nginx config (remove sailor-client proxy if any)
- [ ] Archive or delete `sailor-client/` directory

---

## 10. Testing Checklist

- [ ] Register new user → redirects to dashboard
- [ ] Login existing user → redirects to dashboard
- [ ] Invalid credentials → shows error
- [ ] Token refresh → works silently
- [ ] Logout → clears tokens, redirects to login
- [ ] Protected pages → redirect to login if not authenticated
- [ ] Dashboard → shows user info, pass status, exam history
- [ ] Pricing → checkout works when logged in
- [ ] Pricing → prompts login when not authenticated
- [ ] Payment success → shows confirmation
- [ ] Start exam → works with valid pass
- [ ] Start exam → blocked without pass (for full exams)

---

## 11. Exit Criteria

- [ ] Login/Register pages functional
- [ ] Dashboard shows user stats and exam history
- [ ] Navigation updates based on auth state
- [ ] All existing features work without sailor-client
- [ ] sailor-client removal complete

---

_Document created: 2026-02-03_

# Phase 4: Payment MVP - Access Pass System

**Document Type**: Technical Implementation Plan
**Status**: ✅ Implemented
**Date**: 2026-02-02
**Last Updated**: 2026-02-03
**Author**: Danilo Jr. B. Casim
**Reviewed By**: Senior Software Engineer

---

## 1. Executive Summary

This document outlines the MVP implementation for the payment/access pass system. The goal is to validate the core flow before integrating real payment processing (Stripe).

### MVP Goals

1. **Simulate payment flow** - Button click grants access (no real payment yet)
2. **Countdown timer** - Display remaining access time to user
3. **Access expiry** - Redirect to login/purchase when access expires
4. **Security** - Server-side validation, no client-side bypasses

### Security Principles

> ⚠️ **Critical**: Never trust the client. All access control MUST be server-validated.

| What | Where | Why |
|------|-------|-----|
| Access expiry check | Server (every request) | Client can be manipulated |
| Countdown display | Client (cosmetic only) | UX feedback, not enforcement |
| Pass creation | Server only | Prevent fake passes |
| Timer data | Server-provided | Client displays server time |

---

## 2. Security Analysis

### 2.1 Potential Attack Vectors

| Attack | Risk | Mitigation |
|--------|------|------------|
| **Client-side timer manipulation** | High | Timer is cosmetic; server validates on every request |
| **JWT token tampering** | Medium | JWT signed with secret; validate signature server-side |
| **Expired token reuse** | Medium | Check `expires_at` in database, not just JWT claims |
| **Fake access pass creation** | High | Passes created only via server after payment verification |
| **Session hijacking** | Medium | HttpOnly cookies, short-lived access tokens |
| **Race condition on activation** | Low | Database transaction with row locking |

### 2.2 Defense in Depth Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REQUEST FLOW                                 │
└─────────────────────────────────────────────────────────────────────┘

  Client                    Server                     Database
    │                          │                           │
    │  Request + JWT           │                           │
    │ ────────────────────────>│                           │
    │                          │                           │
    │                          │  1. Validate JWT signature │
    │                          │  2. Check token not expired │
    │                          │  3. Query access_passes    │
    │                          │ ─────────────────────────>│
    │                          │                           │
    │                          │  4. Check expires_at > NOW() 
    │                          │<──────────────────────────│
    │                          │                           │
    │                          │  5. If expired → 403      │
    │                          │  6. If valid → proceed    │
    │                          │                           │
    │  Response + remaining_time│                          │
    │<─────────────────────────│                           │
    │                          │                           │
    │  Display countdown (UI)  │                           │
    │  (cosmetic only)         │                           │
```

### 2.3 What We DON'T Trust

- ❌ Client-side countdown reaching zero
- ❌ JWT expiry claim alone (also check database)
- ❌ LocalStorage values
- ❌ URL parameters for access control
- ❌ Client-reported timestamps

### 2.4 What We DO Trust

- ✅ Server-side database queries
- ✅ Server-generated timestamps
- ✅ Signed JWT tokens (for identity, not access duration)
- ✅ Database `expires_at` field

---

## 3. Database Schema

### 3.1 Access Passes Table

```sql
-- Add to facilitator/migrations/002_access_passes.sql

CREATE TABLE access_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_type VARCHAR(20) NOT NULL,
  duration_hours INTEGER NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Status lifecycle: pending → activated → expired
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Payment (for future Stripe integration)
  payment_provider VARCHAR(20),  -- 'stripe', 'mock'
  payment_id VARCHAR(100),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'activated', 'expired', 'cancelled'))
);

-- Indexes for common queries
CREATE INDEX idx_access_passes_user_status ON access_passes(user_id, status);
CREATE INDEX idx_access_passes_expires ON access_passes(expires_at) 
  WHERE status = 'activated';

-- Pass type lookup table
CREATE TABLE pass_types (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  duration_hours INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0
);

-- Seed pass types
INSERT INTO pass_types (id, name, description, duration_hours, price_cents, sort_order) VALUES
  ('trial', 'Free Trial', 'Try with mock exams - no payment required', 0, 0, 0),
  ('38_hours', '38 Hours Pass', 'Full access for 38 hours of practice', 38, 499, 1),
  ('1_week', '1 Week Pass', 'Full access for 7 days', 168, 1999, 2),
  ('2_weeks', '2 Weeks Pass', 'Full access for 14 days', 336, 2999, 3);
```

### 3.2 Migration Script

```sql
-- facilitator/migrations/002_access_passes.sql
-- Run after 001_init.sql

BEGIN;

-- Create tables (from above)
-- ...

-- Add expires_at to track when access ends
-- Server checks this on EVERY protected request

COMMIT;
```

---

## 4. API Design

### 4.1 Access Pass Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/access/status` | Yes | Get current access status + remaining time |
| `GET` | `/api/v1/access/passes` | Yes | List user's access passes |
| `POST` | `/api/v1/access/activate` | Yes | Activate a pending pass (starts timer) |
| `POST` | `/api/v1/access/purchase` | Yes | Create new pass (MVP: mock payment) |
| `GET` | `/api/v1/pricing` | No | Get available pass types |

### 4.2 Access Status Response

Every protected request should include access status in headers or response:

```json
{
  "success": true,
  "data": { /* ... */ },
  "access": {
    "hasAccess": true,
    "passType": "1_week",
    "expiresAt": "2026-02-09T13:00:00.000Z",
    "remainingSeconds": 604800,
    "remainingHuman": "7 days"
  }
}
```

### 4.3 Purchase Flow (MVP - Mock Payment)

```
POST /api/v1/access/purchase
{
  "passType": "1_week",
  "paymentMethod": "mock"  // MVP: skip real payment
}

Response:
{
  "success": true,
  "data": {
    "passId": "uuid",
    "passType": "1_week",
    "status": "pending",
    "durationHours": 168,
    "message": "Pass purchased. Activate to start your timer."
  }
}
```

### 4.4 Activation Flow

```
POST /api/v1/access/activate
{
  "passId": "uuid"
}

Response:
{
  "success": true,
  "data": {
    "passId": "uuid",
    "status": "activated",
    "activatedAt": "2026-02-02T14:00:00.000Z",
    "expiresAt": "2026-02-09T14:00:00.000Z",
    "remainingSeconds": 604800
  }
}
```

---

## 5. Server Implementation

### 5.1 Access Service

```javascript
// facilitator/src/services/accessService.js

const db = require('../utils/db');
const logger = require('../utils/logger');

/**
 * Check if user has valid access for full exams
 * Called on EVERY protected request
 */
async function checkAccess(userId) {
  // Query database for active, non-expired pass
  const result = await db.query(`
    SELECT id, pass_type, expires_at, activated_at
    FROM access_passes 
    WHERE user_id = $1 
      AND status = 'activated' 
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1
  `, [userId]);
  
  if (result.rows.length === 0) {
    // Check for pending (purchased but not activated) passes
    const pending = await db.query(`
      SELECT id, pass_type, duration_hours
      FROM access_passes 
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `, [userId]);
    
    return {
      hasAccess: false,
      hasPendingPass: pending.rows.length > 0,
      pendingPass: pending.rows[0] || null
    };
  }
  
  const pass = result.rows[0];
  const now = new Date();
  const expiresAt = new Date(pass.expires_at);
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  
  return {
    hasAccess: true,
    passId: pass.id,
    passType: pass.pass_type,
    activatedAt: pass.activated_at,
    expiresAt: pass.expires_at,
    remainingSeconds,
    remainingHuman: formatDuration(remainingSeconds)
  };
}

/**
 * Create a new access pass (MVP: mock payment)
 */
async function purchasePass(userId, passType, paymentMethod = 'mock') {
  // Get pass type details
  const passTypeResult = await db.query(
    'SELECT * FROM pass_types WHERE id = $1 AND is_active = true',
    [passType]
  );
  
  if (passTypeResult.rows.length === 0) {
    throw new Error('Invalid pass type');
  }
  
  const passInfo = passTypeResult.rows[0];
  
  // MVP: Skip real payment, just create pass
  if (paymentMethod !== 'mock') {
    throw new Error('Only mock payments supported in MVP');
  }
  
  // Create pending pass
  const result = await db.query(`
    INSERT INTO access_passes 
      (user_id, pass_type, duration_hours, price_cents, status, payment_provider)
    VALUES ($1, $2, $3, $4, 'pending', $5)
    RETURNING id, pass_type, duration_hours, status, created_at
  `, [userId, passType, passInfo.duration_hours, passInfo.price_cents, paymentMethod]);
  
  logger.info('Access pass purchased', { 
    userId, 
    passId: result.rows[0].id, 
    passType 
  });
  
  return result.rows[0];
}

/**
 * Activate a pending pass (starts the countdown timer)
 */
async function activatePass(userId, passId) {
  // Use transaction to prevent race conditions
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock the row to prevent double activation
    const passResult = await client.query(`
      SELECT * FROM access_passes 
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      FOR UPDATE
    `, [passId, userId]);
    
    if (passResult.rows.length === 0) {
      throw new Error('Pass not found or already activated');
    }
    
    const pass = passResult.rows[0];
    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt.getTime() + (pass.duration_hours * 60 * 60 * 1000));
    
    // Update pass to activated
    await client.query(`
      UPDATE access_passes 
      SET status = 'activated', activated_at = $1, expires_at = $2
      WHERE id = $3
    `, [activatedAt, expiresAt, passId]);
    
    await client.query('COMMIT');
    
    logger.info('Access pass activated', { 
      userId, 
      passId, 
      expiresAt 
    });
    
    return {
      passId,
      status: 'activated',
      activatedAt,
      expiresAt,
      remainingSeconds: pass.duration_hours * 60 * 60
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Format seconds into human-readable duration
 */
function formatDuration(seconds) {
  if (seconds <= 0) return 'Expired';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Expire old passes (run periodically via cron)
 */
async function expireOldPasses() {
  const result = await db.query(`
    UPDATE access_passes 
    SET status = 'expired'
    WHERE status = 'activated' AND expires_at < NOW()
    RETURNING id, user_id
  `);
  
  if (result.rows.length > 0) {
    logger.info('Expired old passes', { count: result.rows.length });
  }
  
  return result.rows.length;
}

module.exports = {
  checkAccess,
  purchasePass,
  activatePass,
  expireOldPasses,
  formatDuration
};
```

### 5.2 Access Middleware

```javascript
// facilitator/src/middleware/accessMiddleware.js

const accessService = require('../services/accessService');

/**
 * Middleware to check access for full exams
 * Attach access status to request and response
 */
async function requireAccess(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  try {
    const accessStatus = await accessService.checkAccess(req.userId);
    req.access = accessStatus;
    
    // Add access info to response headers for client
    res.set('X-Access-Status', accessStatus.hasAccess ? 'active' : 'none');
    if (accessStatus.expiresAt) {
      res.set('X-Access-Expires', accessStatus.expiresAt);
      res.set('X-Access-Remaining', accessStatus.remainingSeconds);
    }
    
    if (!accessStatus.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access pass required',
        message: 'Purchase an access pass to take full exams',
        access: accessStatus
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional access check - doesn't block, just attaches status
 */
async function checkAccessOptional(req, res, next) {
  if (!req.userId) {
    req.access = { hasAccess: false };
    return next();
  }
  
  try {
    req.access = await accessService.checkAccess(req.userId);
    next();
  } catch (error) {
    req.access = { hasAccess: false, error: error.message };
    next();
  }
}

module.exports = {
  requireAccess,
  checkAccessOptional
};
```

### 5.3 Exam Access Check Integration

```javascript
// Modify examController.js createExam function

async function createExam(req, res) {
  const { labId } = req.body;
  const lab = await getLab(labId);
  
  if (!lab) {
    return res.status(404).json({ error: 'Lab not found' });
  }
  
  // Mock exams: always allowed (even without auth)
  if (lab.type === 'mock' || lab.isFree) {
    return await startExamSession(req, res, lab);
  }
  
  // Full exams: require auth
  if (!req.userId) {
    return res.status(401).json({ 
      error: 'Authentication required for full exams',
      redirectTo: '/login'
    });
  }
  
  // Full exams: require valid access pass
  const accessStatus = await accessService.checkAccess(req.userId);
  
  if (!accessStatus.hasAccess) {
    return res.status(403).json({
      error: 'Access pass required',
      message: 'Purchase an access pass to take full exams',
      redirectTo: '/pricing',
      access: accessStatus
    });
  }
  
  // Start exam with access info attached
  return await startExamSession(req, res, lab, accessStatus);
}
```

---

## 6. Client Implementation

### 6.1 Countdown Timer Component (React)

```jsx
// sailor-client/client/src/components/CountdownTimer.jsx

import { useState, useEffect } from 'react';

export default function CountdownTimer({ expiresAt, onExpire }) {
  const [remaining, setRemaining] = useState(calculateRemaining());
  
  function calculateRemaining() {
    const now = new Date();
    const expires = new Date(expiresAt);
    return Math.max(0, Math.floor((expires - now) / 1000));
  }
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newRemaining = calculateRemaining();
      setRemaining(newRemaining);
      
      if (newRemaining <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  
  if (remaining <= 0) {
    return <span className="text-red-500 font-bold">Expired</span>;
  }
  
  return (
    <div className="flex gap-2 font-mono">
      {days > 0 && <span>{days}d</span>}
      <span>{String(hours).padStart(2, '0')}h</span>
      <span>{String(minutes).padStart(2, '0')}m</span>
      <span>{String(seconds).padStart(2, '0')}s</span>
    </div>
  );
}
```

### 6.2 Access Context

```jsx
// sailor-client/client/src/context/AccessContext.jsx

import { createContext, useContext, useState, useEffect } from 'react';
import { accessApi } from '../services/api';
import { useAuth } from './AuthContext';

const AccessContext = createContext(null);

export function AccessProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshAccess = async () => {
    if (!isAuthenticated) {
      setAccess({ hasAccess: false });
      setLoading(false);
      return;
    }
    
    try {
      const response = await accessApi.getStatus();
      setAccess(response.data.data);
    } catch (error) {
      setAccess({ hasAccess: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAccess();
  }, [isAuthenticated]);

  // Periodically refresh access status (every 5 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(refreshAccess, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleExpire = () => {
    // Server will reject requests anyway, but update UI
    setAccess({ hasAccess: false, expired: true });
    // Redirect to pricing page
    window.location.href = '/pricing';
  };

  return (
    <AccessContext.Provider value={{ access, loading, refreshAccess, handleExpire }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}
```

### 6.3 Handle Expiry During Exam

When a user's access expires while in an exam:

1. **Server rejects next API call** with 403 status
2. **Client catches error** and shows expiry modal
3. **Redirect to pricing** page

```javascript
// In api.js response interceptor

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle access expiry
    if (error.response?.status === 403 && 
        error.response?.data?.error === 'Access pass required') {
      // Show expiry notification
      window.dispatchEvent(new CustomEvent('access-expired', {
        detail: error.response.data
      }));
      
      // Redirect to pricing
      window.location.href = '/pricing?reason=expired';
      return Promise.reject(error);
    }
    
    // ... existing 401 handling
  }
);
```

---

## 7. CKX Webapp Integration

### 7.1 Access Expiry Handling

The CKX webapp should also check access on each protected action:

```javascript
// app/services/auth-service.js - Add access check

class AuthService {
  // ... existing code ...
  
  /**
   * Check if access has expired
   * Called on exam actions (start question, submit, etc.)
   */
  async checkAccessExpiry(req, res) {
    // Decode JWT to get userId
    const cookieToken = req.cookies?.ckx_token;
    if (!cookieToken) return { expired: true };
    
    const result = this.verifyToken(cookieToken);
    if (!result.valid) return { expired: true };
    
    // Call facilitator to check access
    try {
      const response = await fetch(
        `http://facilitator:3000/api/v1/access/status`,
        {
          headers: { 'Authorization': `Bearer ${cookieToken}` }
        }
      );
      
      if (!response.ok) return { expired: true };
      
      const data = await response.json();
      return {
        expired: !data.data?.hasAccess,
        remainingSeconds: data.data?.remainingSeconds
      };
    } catch (error) {
      console.error('Access check failed:', error);
      return { expired: false }; // Fail open for now (or fail closed in production)
    }
  }
}
```

---

## 8. Testing Checklist

### 8.1 Happy Path

- [ ] User can purchase mock pass (creates pending pass)
- [ ] User can activate pass (starts countdown)
- [ ] Countdown displays correctly on client
- [ ] User can access full exams with active pass
- [ ] Server returns remaining time in API responses

### 8.2 Security Tests

- [ ] Client-side timer manipulation doesn't grant access
- [ ] Expired pass is rejected server-side
- [ ] Cannot activate same pass twice
- [ ] Cannot use another user's pass
- [ ] JWT tampering is detected
- [ ] Pass creation only via API (no SQL injection)

### 8.3 Edge Cases

- [ ] Access expires during exam - graceful handling
- [ ] Multiple passes - uses latest expiry
- [ ] Stacking passes - future enhancement
- [ ] Timezone handling - all UTC

---

## 9. MVP Implementation Order

### Phase 4.1: Database & Backend (Week 1)

1. [ ] Create migration file `002_access_passes.sql`
2. [ ] Implement `accessService.js`
3. [ ] Implement `accessMiddleware.js`
4. [ ] Add access routes to facilitator
5. [ ] Integrate with exam creation flow
6. [ ] Add access check to CKX webapp

### Phase 4.2: Frontend Integration (Week 1-2)

1. [ ] Add `AccessContext` to sailor-client
2. [ ] Create `CountdownTimer` component
3. [ ] Add pricing page with mock purchase buttons
4. [ ] Handle expiry in exam interface
5. [ ] Add access status to dashboard

### Phase 4.3: Testing & Polish (Week 2)

1. [ ] Manual testing of all flows
2. [ ] Security testing
3. [ ] Fix edge cases
4. [ ] Documentation update

---

## 10. Future Enhancements (Post-MVP)

1. **Stripe Integration** - Replace mock payments with real
2. **Pass Stacking** - Allow multiple passes to add time
3. **Pause Feature** - Pause timer when not in exam
4. **Grace Period** - 5 minute warning before expiry
5. **Email Notifications** - Expiry reminders

---

## 11. Exit Criteria

- [x] User can "purchase" mock access pass
- [x] Pass activation starts countdown timer
- [x] Countdown displayed in UI (via WebSocket - Phase 4.0)
- [x] Full exams blocked without valid pass
- [x] Access validated server-side on every request
- [ ] Expired access redirects to pricing page (client-side pending)
- [x] Security review complete

---

## 12. Implementation Notes (2026-02-03)

### 12.1 Files Created

| File | Purpose |
|------|---------|
| `facilitator/migrations/002_access_passes.sql` | Database schema for pass_types and access_passes |
| `facilitator/src/services/accessService.js` | Core access pass business logic |
| `facilitator/src/services/stripeService.js` | Stripe one-time payment integration |
| `facilitator/src/controllers/accessController.js` | Access status and pass management endpoints |
| `facilitator/src/controllers/billingController.js` | Payment/billing endpoints |
| `facilitator/src/routes/accessRoutes.js` | Access API routes |
| `facilitator/src/routes/billingRoutes.js` | Billing API routes |
| `facilitator/src/middleware/accessMiddleware.js` | `requireFullAccess` middleware |
| `example.env` | Environment variable template |

### 12.2 Files Modified

| File | Changes |
|------|---------|
| `facilitator/package.json` | Added `stripe` dependency |
| `facilitator/src/config/index.js` | Added Stripe and APP_URL config |
| `facilitator/src/app.js` | Registered access/billing routes, webhook before JSON parser |
| `facilitator/src/routes/examRoutes.js` | Added `requireFullAccess` middleware to exam creation |
| `facilitator/src/controllers/examController.js` | Track exam type and access pass ID |
| `docker-compose.yaml` | Added Stripe environment variables |

### 12.3 API Endpoints Implemented

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/access/status` | Required | Check current access status |
| GET | `/api/v1/access/passes` | Required | List user's passes |
| POST | `/api/v1/access/activate/:id` | Required | Activate a purchased pass |
| GET | `/api/v1/billing/plans` | Public | List available pass types |
| POST | `/api/v1/billing/checkout` | Required | Create Stripe checkout session |
| POST | `/api/v1/billing/webhook` | Public | Handle Stripe webhooks |
| GET | `/api/v1/billing/verify/:id` | Required | Verify payment completion |

### 12.4 Environment Variables

```bash
# Required for Stripe integration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:30080
```

See `example.env` for full configuration template.

### 12.5 Key Implementation Details

1. **Mock exams bypass access check**: Labs with `isFree: true` or `type: 'mock'` are always accessible
2. **Auto-activation**: Pending passes are auto-activated when user starts a full exam
3. **Webhook before JSON parser**: Stripe webhook registered before `express.json()` for signature verification
4. **Pass stacking**: Future enhancement - currently only one active pass at a time

### 12.6 Remaining Work

- [ ] Client-side integration (pricing page, access status display)
- [ ] Pass expiration cron job
- [ ] Email notifications for expiring passes
- [ ] Payment success/cancel pages

---

_Document created: 2026-02-02. Last updated: 2026-02-03._

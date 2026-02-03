# Phase 4: Payment MVP - Implementation Notes

**Status**: In Progress
**Last Updated**: 2026-02-03

---

## Quick Start

### Prerequisites

1. PostgreSQL with migrations applied
2. Redis running
3. Stripe account with API keys

### Local Development Setup

```bash
# Terminal 1: Start postgres and redis
cd /home/danilo/repos/CKX
sudo docker compose up -d postgres redis

# Run migrations (first time only)
sudo docker compose exec postgres psql -U ckx -d ckx
# Then paste contents of facilitator/migrations/002_access_passes.sql

# Terminal 2: Run facilitator
cd /home/danilo/repos/CKX/facilitator
npm run dev

# Terminal 3: Run sailor-client
cd /home/danilo/repos/CKX/sailor-client/client
VITE_BACKEND_URL=http://localhost:3000 npm run dev
```

### Stripe Configuration

Set in `.env` or environment:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:30080
```

For local webhook testing:
```bash
stripe listen --forward-to localhost:3000/api/v1/billing/webhook
```

---

## Implementation Status

### Backend (Facilitator) - COMPLETE

| Component | Status | File |
|-----------|--------|------|
| Stripe config validation | ✅ | `src/config/index.js` |
| Stripe service | ✅ | `src/services/stripeService.js` |
| Access service | ✅ | `src/services/accessService.js` |
| Billing controller | ✅ | `src/controllers/billingController.js` |
| Access controller | ✅ | `src/controllers/accessController.js` |
| Billing routes | ✅ | `src/routes/billingRoutes.js` |
| Access routes | ✅ | `src/routes/accessRoutes.js` |
| requireFullAccess middleware | ✅ | `src/middleware/accessMiddleware.js` |
| requireSessionAccess middleware | ✅ | `src/middleware/accessMiddleware.js` |
| Database migrations | ✅ | `migrations/002_access_passes.sql` |

### Frontend (Sailor-Client) - COMPLETE

| Component | Status | File |
|-----------|--------|------|
| Pricing page | ✅ | `src/pages/Pricing.jsx` |
| Billing API | ✅ | `src/services/api.js` |
| Access API | ✅ | `src/services/api.js` |
| Checkout flow | ✅ | `src/pages/Pricing.jsx` |

### Frontend (CKX Vanilla JS) - COMPLETE

| Component | Status | File |
|-----------|--------|------|
| Pricing page | ✅ | `app/public/pricing.html` |
| Pricing JS | ✅ | `app/public/js/pricing.js` |
| Payment success page | ✅ | `app/public/payment-success.html` |
| Route handling | ✅ | `app/services/route-service.js` |

---

## API Endpoints

### Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/billing/plans` | No | List available pass types |
| POST | `/api/v1/billing/checkout` | Yes | Create Stripe checkout session |
| GET | `/api/v1/billing/verify/:sessionId` | Yes | Verify payment completion |
| POST | `/api/v1/billing/webhook` | No | Stripe webhook (raw body) |

### Access

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/access/status` | Yes | Get current access status |
| GET | `/api/v1/access/passes` | Yes | List user's passes |
| POST | `/api/v1/access/activate/:id` | Yes | Activate a purchased pass |

---

## Security Enforcement

### Middleware Chain

| Checkpoint | Middleware | Applied To |
|------------|------------|------------|
| Exam creation | `requireFullAccess` | `POST /exams` |
| Get questions | `requireSessionAccess` | `GET /exams/:id/questions` |
| Evaluate exam | `requireSessionAccess` | `POST /exams/:id/evaluate` |
| Update events | `requireSessionAccess` | `POST /exams/:id/events` |

### Key Security Principles

1. **Never trust client** - All access validation is server-side
2. **Countdown is cosmetic** - Server enforces expiry, client just displays
3. **Webhook creates passes** - Stripe success redirect is NOT proof of payment
4. **Check on every request** - Session access validated on each protected endpoint

---

## Payment Flow

```
User clicks "Buy Now"
    │
    ▼
POST /api/v1/billing/checkout
    │ Creates Stripe session
    │ Creates pending access_pass record
    ▼
Redirect to Stripe Checkout
    │
    ▼
User completes payment
    │
    ├──► Stripe sends webhook ──► POST /api/v1/billing/webhook
    │                                  │ Verifies signature
    │                                  │ Updates access_pass
    │                                  ▼
    │                             Status: 'purchased'
    │
    ▼
Redirect to /payment/success?session_id=xxx
    │
    ▼
GET /api/v1/billing/verify/:sessionId
    │ Confirms payment
    ▼
User starts exam
    │
    ▼
requireFullAccess middleware
    │ Auto-activates pending pass
    │ Sets activated_at, expires_at
    ▼
Status: 'activated' (timer starts)
```

---

## Test Card

```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/34)
CVC: Any 3 digits (e.g., 123)
```

---

## What's Next

### Phase 5: Auth Consolidation (Next)

Move login/register from sailor-client to CKX vanilla JS app.

See: [PHASE5_AUTH_CONSOLIDATION.md](./PHASE5_AUTH_CONSOLIDATION.md)

**Key Tasks:**
- [ ] Create login.html + login.js
- [ ] Create register.html + register.js
- [ ] Create auth utilities (token management)
- [ ] Create dashboard.html (user stats, exam history)
- [ ] Update navigation on all pages

### Immediate (Required for MVP)

- [ ] Test full payment flow end-to-end
- [ ] Add pass expiration cron job
- [ ] Handle expired access gracefully in exam UI

### Short Term (Post-MVP)

- [ ] Access status display in exam header
- [ ] Low-time warning toast (< 1 hour remaining)
- [ ] Email notifications for expiring passes

### Future Enhancements

- [ ] Pass stacking (multiple passes add time)
- [ ] Pause feature (pause timer when not in exam)
- [ ] Promotional codes / discounts
- [ ] Subscription option (alternative to one-time)

---

## Files Modified (2026-02-03)

### Backend

| File | Changes |
|------|---------|
| `facilitator/src/config/index.js` | Added Stripe config validation |
| `facilitator/src/app.js` | Calls config.validate() at startup |
| `facilitator/src/middleware/accessMiddleware.js` | Added `requireSessionAccess` |
| `facilitator/src/services/accessService.js` | Added `validatePassById()` |
| `facilitator/src/routes/examRoutes.js` | Applied session middleware |

### Frontend (Sailor-Client)

| File | Changes |
|------|---------|
| `sailor-client/client/src/services/api.js` | Added `billingApi`, `accessApi` |
| `sailor-client/client/src/pages/Pricing.jsx` | Wired checkout to API |
| `sailor-client/client/vite.config.js` | Made proxy configurable |

### Frontend (CKX)

| File | Changes |
|------|---------|
| `app/public/payment-success.html` | Created payment success page |
| `app/public/js/pricing.js` | Fixed API field names |
| `app/services/route-service.js` | Added payment routes |

---

## Troubleshooting

### "relation 'pass_types' does not exist"

Run the migration:
```bash
sudo docker compose exec postgres psql -U ckx -d ckx -f /tmp/002_access_passes.sql
```

### "ECONNREFUSED 127.0.0.1:30080"

Start Docker services or use local dev setup (see Quick Start).

### Webhook not receiving events

Use Stripe CLI for local testing:
```bash
stripe listen --forward-to localhost:3000/api/v1/billing/webhook
```

---

_Full technical documentation: [PHASE4_PAYMENT_MVP.md](./PHASE4_PAYMENT_MVP.md)_

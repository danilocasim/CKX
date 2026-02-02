# CKX Multi-Session Architecture Plan

**Document Type**: Technical Implementation Plan  
**Status**: Active  
**Last Updated**: 2026-02-02  
**Author**: Danilo Jr. B. Casim  
**Reviewed By**: Senior Software Engineer

---

## Executive Summary

This document outlines the complete technical roadmap for transforming CKX from a single-user exam simulator into a scalable multi-user SaaS platform. The plan is divided into sequential phases, each building upon the previous.

**Current Status**: Phases 0-3.5 complete. Authentication and exam types implemented. Ready for Phase 4.

**Architecture Decision**: One exam per user at a time. Each user receives an isolated environment (Kubernetes cluster, terminal, desktop). This mirrors real certification exams and optimizes resource utilization.

---

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 0 | Analysis & Documentation | ✅ Complete | Architecture review, constraint mapping |
| 1 | Session Isolation Foundation | ✅ Complete | Redis changes, port allocation, session-specific paths |
| 1.5 | Session Management Integration | ✅ Complete | Port allocator + exam lifecycle integration |
| 2 | Session Management API | ✅ Complete | REST API for session operations |
| 3 | User Authentication | ✅ Complete | PostgreSQL, JWT auth, user accounts, CKX webapp protection |
| 3.5 | Exam Content Restructuring | ✅ Complete | Mock exams for free trial, type/isFree fields, access control |
| 4 | Payment MVP | 🔄 **Next** | Mock payment flow, countdown timer, access validation |
| 4.5 | Stripe Integration | ⏳ Pending | Real payment processing |
| 5 | Production Deployment | ⏳ Pending | AWS infrastructure, CI/CD |
| 6 | Scaling & Performance | ⏳ Pending | Cluster pooling, auto-scaling |
| 7 | Enterprise Features | ⏳ Pending | SSO, teams, LMS integration |

---

## Completed Phases

### Phase 0: Analysis & Documentation ✅

**Deliverables**:
- [x] Single-session constraint analysis
- [x] Architecture enforcement points documented
- [x] Resource requirements calculated
- [x] Refactoring risk assessment

**Reference**: See `PHASE0_ANALYSIS.md` for details.

---

### Phase 1: Session Isolation Foundation ✅

**Deliverables**:
- [x] Session identity system (UUID per exam)
- [x] Redis key namespacing (`exam:{sessionId}:*`)
- [x] Removed global exam lock
- [x] Port allocation service
- [x] Session-specific asset paths (`/tmp/exam-assets-{examId}`)

**Reference**: See `PHASE1_IMPLEMENTATION.md` for details.

---

### Phase 1.5: Session Management Integration ✅

**Deliverables**:
- [x] Port allocator integrated with exam creation/cleanup
- [x] Session capacity limits (MAX_CONCURRENT_SESSIONS)
- [x] VNC restart conditional logic (first session only)
- [x] Session registration in Redis

**Reference**: See `PHASE1.5_SESSION_MANAGEMENT.md` for details.

---

### Phase 2: Session Management API ✅

**Deliverables**:
- [x] Session controller with CRUD operations
- [x] Joi validation middleware
- [x] Routes registered (`/api/v1/sessions/*`)
- [x] OpenAPI 3.0 specification

**Endpoints**:
```
GET    /api/v1/sessions              → List active sessions
GET    /api/v1/sessions/stats        → Get statistics
GET    /api/v1/sessions/:id          → Get session metadata
GET    /api/v1/sessions/:id/status   → Get session status
GET    /api/v1/sessions/:id/routing  → Get routing info
GET    /api/v1/sessions/:id/ports    → Get allocated ports
DELETE /api/v1/sessions/:id          → Terminate session
```

**Reference**: See `PHASE2_SESSION_API.md` for details.

---

## Active Phases

### Phase 3: User Authentication & Accounts ✅

**Goal**: Enable user registration, authentication, and exam history tracking.

**Status**: Complete

**Deliverables**:
- [x] PostgreSQL service with migrations
- [x] User registration and login (JWT-based)
- [x] Protected API routes
- [x] Sailor-client React UI integrated
- [x] CKX webapp auth protection (redirects to login if unauthenticated)
- [x] Logout sync between sailor-client and CKX

**Reference**: See `PHASE3_AUTH.md` for details.

---

### Phase 3.5: Exam Content Restructuring ✅

**Goal**: Create mock exams for free trial and restructure existing exams with type classification.

**Status**: Complete

**Depends on**: Phase 3 complete ✅

**Deliverables**:
- [x] Labs.json updated with `type` and `isFree` fields for all exams
- [x] Mock exam created for CKAD (5 questions, 30 minutes)
- [x] Mock exam created for CKA (5 questions, 30 minutes)
- [x] Mock exam created for CKS (3 questions, 20 minutes)
- [x] Mock exam created for Docker (3 questions, 15 minutes)
- [x] Mock exam created for Helm (3 questions, 15 minutes)
- [x] API filters by `type` and `category` query parameters
- [x] `optionalAuth` middleware for public/protected endpoints
- [x] Unauthenticated users only see mock exams
- [x] Full exams require authentication

**Reference**: See `PHASE3.5_EXAM_CONTENT.md` for details.

---

## Active Phases

### Phase 4: Payment Integration 🔄

**Goal**: Monetize with time-based access passes (not subscriptions).

**Status**: Planning Complete - MVP Ready

**Depends on**: Phase 3.5 complete ✅

**Reference**: See `PHASE4_PAYMENT_MVP.md` for detailed MVP implementation plan with security analysis.

#### 4.1 MVP Approach (Validate Before Stripe)

Before integrating real payments, we implement a mock payment flow to validate:
1. **Access pass flow** - Button click grants access (no real payment)
2. **Countdown timer** - Display remaining time to user  
3. **Server-side validation** - All access checks on server (security)
4. **Expiry handling** - Redirect to pricing when access expires

> ⚠️ **Security Principle**: Never trust the client. Countdown is cosmetic; server validates on every request.

#### 4.2 Pricing Model (Time-Based Access Passes)

| Plan | Price | Duration | Features |
|------|-------|----------|----------|
| **Free Trial** | $0 | Unlimited | Mock exams only, no card required |
| **38 Hours Pass** | $4.99 | 38 hours | Full exam access, instant feedback, unlimited retakes |
| **1 Week Pass** | $19.99 | 7 days | Full exam access, instant feedback, unlimited retakes |
| **2 Weeks Pass** | $29.99 | 14 days | Full exam access, priority support, unlimited retakes |

**Key Differences from Subscription Model**:
- One-time purchase, not recurring
- Time starts when pass is activated (not purchased)
- User can buy multiple passes (stacks time)
- No auto-renewal, no cancellation needed

#### 4.2 Database Schema

```sql
-- Access passes (time-based, not subscription)
CREATE TABLE access_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pass_type VARCHAR(20) NOT NULL,  -- '38_hours', '1_week', '2_weeks'
  duration_hours INTEGER NOT NULL,  -- 38, 168, 336
  price_cents INTEGER NOT NULL,
  stripe_payment_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'purchased', -- purchased, activated, expired
  purchased_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,          -- NULL until user starts first exam
  expires_at TIMESTAMP,            -- Calculated: activated_at + duration
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pass type definitions
CREATE TABLE pass_types (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  duration_hours INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  features JSONB,
  is_active BOOLEAN DEFAULT TRUE
);

-- Seed pass types
INSERT INTO pass_types (id, name, duration_hours, price_cents, features) VALUES
  ('38_hours', '38 Hours Access Pass', 38, 499, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true}'),
  ('1_week', '1 Week Access Pass', 168, 1999, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true}'),
  ('2_weeks', '2 Weeks Access Pass', 336, 2999, '{"full_access": true, "instant_feedback": true, "unlimited_retakes": true, "priority_support": true}');

-- Exam attempts (updated)
CREATE TABLE exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_pass_id UUID REFERENCES access_passes(id),  -- Links to the pass used
  ckx_session_id UUID NOT NULL,
  lab_id VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL,
  exam_type VARCHAR(10) NOT NULL,  -- 'mock' or 'full'
  status VARCHAR(20) NOT NULL,
  score INTEGER,
  max_score INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_minutes INTEGER
);

-- Indexes
CREATE INDEX idx_access_passes_user_status ON access_passes(user_id, status);
CREATE INDEX idx_access_passes_expires ON access_passes(expires_at) WHERE status = 'activated';
```

#### 4.3 Access Pass Logic

```javascript
// accessService.js

/**
 * Check if user has valid access for full exams
 */
async function checkUserAccess(userId) {
  // Find active pass that hasn't expired
  const pass = await db.query(`
    SELECT * FROM access_passes 
    WHERE user_id = $1 
      AND status = 'activated' 
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1
  `, [userId]);
  
  if (pass.rows.length > 0) {
    const activePass = pass.rows[0];
    const hoursRemaining = Math.ceil((new Date(activePass.expires_at) - new Date()) / (1000 * 60 * 60));
    
    return {
      hasValidPass: true,
      passType: activePass.pass_type,
      expiresAt: activePass.expires_at,
      hoursRemaining
    };
  }
  
  // Check for purchased but not activated passes
  const pendingPass = await db.query(`
    SELECT * FROM access_passes 
    WHERE user_id = $1 AND status = 'purchased'
    ORDER BY created_at ASC
    LIMIT 1
  `, [userId]);
  
  return {
    hasValidPass: false,
    hasPendingPass: pendingPass.rows.length > 0,
    pendingPassId: pendingPass.rows[0]?.id
  };
}

/**
 * Activate a purchased pass (starts the timer)
 */
async function activatePass(passId, userId) {
  const pass = await db.query(`
    SELECT * FROM access_passes WHERE id = $1 AND user_id = $2 AND status = 'purchased'
  `, [passId, userId]);
  
  if (pass.rows.length === 0) {
    throw new Error('Pass not found or already activated');
  }
  
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + (pass.rows[0].duration_hours * 60 * 60 * 1000));
  
  await db.query(`
    UPDATE access_passes 
    SET status = 'activated', activated_at = $1, expires_at = $2
    WHERE id = $3
  `, [activatedAt, expiresAt, passId]);
  
  return { activatedAt, expiresAt };
}

/**
 * Auto-activate pass on first full exam (optional UX)
 */
async function ensureActivePass(userId) {
  const access = await checkUserAccess(userId);
  
  if (access.hasValidPass) {
    return access;
  }
  
  if (access.hasPendingPass) {
    await activatePass(access.pendingPassId, userId);
    return await checkUserAccess(userId);
  }
  
  return { hasValidPass: false };
}
```

#### 4.4 Stripe Integration (One-Time Payments)

```javascript
// stripeService.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Create checkout session for access pass purchase
 */
async function createCheckoutSession(userId, passTypeId) {
  const passType = await getPassType(passTypeId);
  
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',  // One-time payment, not subscription
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: passType.name,
          description: `${passType.duration_hours} hours of full exam access`
        },
        unit_amount: passType.price_cents
      },
      quantity: 1
    }],
    metadata: {
      userId,
      passTypeId
    },
    success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`
  });
  
  return session;
}

/**
 * Handle successful payment webhook
 */
async function handlePaymentSuccess(session) {
  const { userId, passTypeId } = session.metadata;
  const passType = await getPassType(passTypeId);
  
  // Create access pass record
  await db.query(`
    INSERT INTO access_passes (user_id, pass_type, duration_hours, price_cents, stripe_payment_id, status)
    VALUES ($1, $2, $3, $4, $5, 'purchased')
  `, [userId, passTypeId, passType.duration_hours, passType.price_cents, session.payment_intent]);
  
  // Send confirmation email
  await sendPassPurchaseEmail(userId, passType);
}
```

**Endpoints**:

```
GET    /api/v1/access/status          → Check current access status
GET    /api/v1/access/passes          → List user's passes (active, expired, pending)
POST   /api/v1/access/activate/:id    → Manually activate a purchased pass
GET    /api/v1/billing/plans          → List available pass types
POST   /api/v1/billing/checkout       → Create Stripe checkout session
POST   /api/v1/billing/webhook        → Handle Stripe payment webhooks
```

#### 4.5 Access Enforcement Middleware

```javascript
// middleware/checkAccess.js

async function requireFullAccess(req, res, next) {
  const { userId } = req.auth;
  const { labId } = req.body;
  
  // Get lab info
  const lab = await getLab(labId);
  
  // Mock exams are always allowed
  if (lab.type === 'mock') {
    return next();
  }
  
  // Check for valid access pass
  const access = await checkUserAccess(userId);
  
  if (!access.hasValidPass) {
    return res.status(403).json({
      error: 'Access Required',
      message: 'An active access pass is required for full exams.',
      hasPendingPass: access.hasPendingPass,
      pricing: '/pricing'
    });
  }
  
  // Attach access info to request for logging
  req.accessPass = access;
  next();
}

async function optionalAuth(req, res, next) {
  // For mock exams, auth is optional but recommended
  try {
    await authenticate(req, res, next);
  } catch {
    req.auth = null;  // Anonymous user
    next();
  }
}
```

#### 4.6 Pass Expiration Handling

```javascript
// jobs/expirePassesJob.js (run every hour via cron)

async function expireOldPasses() {
  const result = await db.query(`
    UPDATE access_passes
    SET status = 'expired'
    WHERE status = 'activated' AND expires_at < NOW()
    RETURNING id, user_id
  `);
  
  // Notify users whose passes just expired
  for (const pass of result.rows) {
    await sendPassExpiredEmail(pass.user_id);
  }
  
  logger.info(`Expired ${result.rowCount} access passes`);
}
```

#### 4.7 Exit Criteria

- [ ] Stripe checkout flow working (one-time payments)
- [ ] Webhook handles payment success events
- [ ] Access passes created on successful payment
- [ ] Pass activation starts countdown timer
- [ ] Mock exams accessible without payment
- [ ] Full exams blocked without valid pass
- [ ] Expired passes handled correctly
- [ ] User can see remaining time on dashboard

---

### Phase 5: Production Deployment ⏳

**Goal**: Deploy to AWS with production-grade infrastructure.

**Duration**: 2-3 weeks

**Depends on**: Phase 4 complete

#### 5.1 Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWS VPC                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Public Subnet                                │ │
│  │   Route 53 → CloudFront → ALB (WebSocket enabled)                  │ │
│  └──────────────────────────┬─────────────────────────────────────────┘ │
│                              │                                           │
│  ┌──────────────────────────┴─────────────────────────────────────────┐ │
│  │                       Private Subnet                                │ │
│  │                                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │ │
│  │  │   Web App   │  │ Facilitator │  │     CKX Workers (EC2)       │ │ │
│  │  │   (ECS)     │  │   (ECS)     │  │  Auto Scaling Group         │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │ │
│  │         │                │                     │                    │ │
│  │  ┌──────┴────────────────┴─────────────────────┴──────────────────┐│ │
│  │  │  RDS PostgreSQL  │  ElastiCache Redis  │  S3 (assets)          ││ │
│  │  └────────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 5.2 Infrastructure as Code

Use Terraform for reproducible deployments:

```
infrastructure/
├── modules/
│   ├── vpc/
│   ├── ecs/
│   ├── rds/
│   ├── elasticache/
│   └── ec2-workers/
├── environments/
│   ├── staging/
│   └── production/
└── main.tf
```

#### 5.3 CI/CD Pipeline

GitHub Actions workflow:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker images
      - name: Run database migrations
      - name: Deploy to ECS
      - name: Health check
```

#### 5.4 Cost Estimate (10 concurrent users)

| Resource | Specification | Monthly Cost |
|----------|---------------|--------------|
| EC2 (CKX Workers) | 2x r5.xlarge | ~$350 |
| RDS PostgreSQL | db.t3.small | ~$30 |
| ElastiCache Redis | cache.t3.micro | ~$15 |
| ALB | Standard | ~$20 |
| ECS Fargate | 2 services | ~$30 |
| **Total** | | **~$445/month** |

**Break-even**: 24 Pro subscribers

#### 5.5 Exit Criteria

- [ ] Terraform provisions all resources
- [ ] CI/CD deploys on push to main
- [ ] SSL/TLS configured
- [ ] Monitoring and alerting in place
- [ ] Database backups configured

---

### Phase 6: Scaling & Performance ⏳

**Goal**: Support 100+ concurrent users with optimal performance.

**Duration**: 4-6 weeks

**Depends on**: Phase 5 complete, production data available

#### 6.1 Cluster Pooling

Pre-warm Kubernetes clusters to reduce exam start time:

```javascript
// clusterPool.js
class ClusterPool {
  constructor(minSize = 3, maxSize = 10) {
    this.available = [];
    this.inUse = new Map();
  }

  async warmUp() {
    // Create clusters during off-peak hours
    while (this.available.length < this.minSize) {
      const cluster = await createK3dCluster();
      this.available.push(cluster);
    }
  }

  async acquire(sessionId) {
    if (this.available.length === 0) {
      // Fall back to on-demand creation
      return await createK3dCluster();
    }
    const cluster = this.available.pop();
    this.inUse.set(sessionId, cluster);
    return cluster;
  }

  async release(sessionId) {
    const cluster = this.inUse.get(sessionId);
    await resetCluster(cluster); // Clean state
    this.available.push(cluster);
    this.inUse.delete(sessionId);
  }
}
```

**Performance Target**: Exam start time < 10 seconds (currently 30-60 seconds)

#### 6.2 Auto-Scaling

EC2 Auto Scaling based on active session count:

```hcl
# terraform
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "ckx-workers-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.workers.name
}

resource "aws_cloudwatch_metric_alarm" "high_sessions" {
  alarm_name          = "ckx-high-session-count"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ActiveSessions"
  namespace           = "CKX"
  period              = 60
  statistic           = "Average"
  threshold           = 8  # Per worker capacity
  alarm_actions       = [aws_autoscaling_policy.scale_up.arn]
}
```

#### 6.3 Exit Criteria

- [ ] Cluster pool maintains 3+ warm clusters
- [ ] Exam start time < 10 seconds
- [ ] Auto-scaling responds to load within 5 minutes
- [ ] System handles 100 concurrent users

---

### Phase 7: Enterprise Features ⏳

**Goal**: Capture enterprise customers with advanced features.

**Duration**: 8-12 weeks

**Depends on**: Phase 6 complete, B2B demand validated

#### 7.1 Team Management

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE organization_members (
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) NOT NULL, -- owner, admin, member
  PRIMARY KEY (organization_id, user_id)
);
```

#### 7.2 SSO Integration

- SAML 2.0 support (Okta, Azure AD)
- OAuth 2.0 (Google Workspace)
- SCIM for user provisioning

#### 7.3 LMS Integration

- LTI 1.3 compliance
- Grade passback
- Canvas, Moodle, Blackboard support

#### 7.4 Exit Criteria

- [ ] Organizations can invite members
- [ ] Admin dashboard shows team usage
- [ ] SSO login working with test IdP
- [ ] LTI integration tested with Canvas

---

## Technical Reference

### Resource Requirements Per Session

| Service | CPU (limit) | Memory (limit) |
|---------|-------------|----------------|
| k8s-api-server | 2.0 | 4 GB |
| remote-desktop | 1.0 | 1 GB |
| jumphost | 1.0 | 512 MB |
| remote-terminal | 0.5 | 512 MB |
| **Total** | **4.5** | **6 GB** |

### Scalability Matrix

| Concurrent Users | Infrastructure | Monthly Cost |
|------------------|----------------|--------------|
| 10 | Single large VM | ~$450 |
| 50 | VM cluster (3 nodes) | ~$2,000 |
| 100 | Auto-scaling cluster | ~$4,000 |
| 500 | Multi-region cluster | ~$20,000 |

### Technology Stack

| Component | Technology | Phase |
|-----------|------------|-------|
| Database | PostgreSQL 15 | 3 |
| Auth | JWT (jsonwebtoken) | 3 |
| Payments | Stripe | 4 |
| IaC | Terraform | 5 |
| CI/CD | GitHub Actions | 5 |
| Monitoring | CloudWatch + Sentry | 5 |
| Metrics | Prometheus | 6 |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| K3d startup time affects UX | High | High | Cluster pooling (Phase 6) |
| Infrastructure costs exceed revenue | High | Medium | Usage limits, efficient scaling |
| Security vulnerability | High | Low | Regular audits, dependency updates |
| Stripe integration complexity | Medium | Medium | Use Stripe's hosted checkout |
| Database scaling | Medium | Low | Read replicas, connection pooling |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-02 | One exam per user | Mirrors real exams, saves resources |
| 2026-02-02 | PostgreSQL over MongoDB | Relational data (users, subscriptions), ACID compliance |
| 2026-02-02 | Stripe for payments | Developer-friendly, handles complexity |
| 2026-02-02 | AWS over GCP/Azure | Best Docker-in-Docker support on EC2 |
| 2026-02-02 | Shared containers (Phase 1-5) | Simpler architecture, sufficient for <100 users |

---

*Last updated: 2026-02-02*

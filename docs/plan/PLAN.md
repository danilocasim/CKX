# CKX Project Plan

**Document Type**: Technical Implementation Plan  
**Status**: Active  
**Last Updated**: 2026-02-03  
**Author**: Development Team

---

## Executive Summary

CKX is a Kubernetes certification practice platform providing isolated exam environments for CKAD, CKA, CKS, and Docker/Helm certifications. The system has been refactored into a **Control Plane / Execution Engine** architecture:

- **Sailor-Client (Control Plane)**: Business logic, authentication, payments, user management
- **CKX (Execution Engine)**: Runtime execution only - creates isolated exam environments

**Current Status**: Phases 0-5 complete. Architecture refactor (Phase 2) complete. Ready for production deployment.

**Architecture Decision**: One exam per user at a time. Each user receives an isolated runtime (Docker containers + Kubernetes namespace) per `exam_session_id`.

---

## Phase Overview

| Phase   | Name                           | Status          | Description                                           |
| ------- | ------------------------------ | --------------- | ----------------------------------------------------- |
| 0       | Analysis & Documentation       | ✅ Complete     | Architecture review, constraint mapping               |
| 1       | Session Isolation Foundation   | ✅ Complete     | Redis namespacing, port allocation, session paths     |
| 1.5     | Session Management Integration | ✅ Complete     | Port allocator + exam lifecycle, session limits       |
| 2       | Session Management API         | ✅ Complete     | REST API for session operations                       |
| 3       | User Authentication            | ✅ Complete     | PostgreSQL, JWT, user accounts                        |
| 3.5     | Exam Content Restructuring     | ✅ Complete     | Mock exams, type/isFree, access control               |
| 4       | Payment MVP                    | ✅ Complete     | Stripe, access passes, countdown timer                |
| 5       | Auth & Payment in CKX          | ✅ Complete     | Login, register, dashboard, pricing in CKX            |
| **2.5** | **Architecture Refactor**      | ✅ **Complete** | **Sailor-Client + CKX split, service authentication** |
| 6       | Production Deployment          | 🔄 **Next**     | AWS infrastructure, CI/CD, monitoring                 |
| 7       | Scaling & Performance          | ⏳ Pending      | Cluster pooling, auto-scaling                         |
| 8       | Enterprise Features            | ⏳ Pending      | SSO, teams, LMS integration                           |

---

## Phase 0: Analysis & Documentation ✅

**Status**: Complete

**Completed Tasks**:

- [x] Single-session constraint analysis
- [x] Architecture enforcement points documented
- [x] Resource requirements calculated
- [x] Refactoring risk assessment

---

## Phase 1: Session Isolation Foundation ✅

**Status**: Complete

**Completed Tasks**:

- [x] Session identity system (UUID per exam)
- [x] Redis key namespacing (`exam:{sessionId}:*`)
- [x] Removed global exam lock
- [x] Port allocation service
- [x] Session-specific asset paths (`/tmp/exam-assets-{examId}`)

---

## Phase 1.5: Session Management Integration ✅

**Status**: Complete

**Completed Tasks**:

- [x] Port allocator integrated with exam creation/cleanup
- [x] Session capacity limits (MAX_CONCURRENT_SESSIONS)
- [x] Session registration in Redis

---

## Phase 2: Session Management API ✅

**Status**: Complete

**Completed Tasks**:

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
GET    /api/v1/sessions/:id/routing → Get routing info
GET    /api/v1/sessions/:id/ports    → Get allocated ports
DELETE /api/v1/sessions/:id          → Terminate session
```

---

## Phase 2.5: Architecture Refactor (Control Plane / Execution Engine) ✅

**Status**: Complete

**Goal**: Split CKX into Sailor-Client (Control Plane) and CKX (Execution Engine) for strict isolation and multi-tenancy.

### Completed Tasks

**Sailor-Client (Control Plane) Created**:

- [x] Complete service structure (Express.js, controllers, services, routes)
- [x] Authentication service (register, login, logout, refresh tokens)
- [x] Payment service (Stripe checkout, webhooks, verification)
- [x] Access service (pass management, time tracking)
- [x] Exam session service (business logic, calls CKX internal APIs)
- [x] CKX client (service-to-service authentication with HMAC)
- [x] User management (profile, stats, exam history)
- [x] One-user-one-session enforcement
- [x] Payment verification before exam creation
- [x] Access pass validation before exam creation

**CKX (Execution Engine) Refactored**:

- [x] Internal APIs (`/internal/*`) - service-to-service only
- [x] Service authentication middleware (HMAC signatures)
- [x] Runtime session service (isolated container spawning)
- [x] Ownership validation using `exam_sessions` table
- [x] Strict isolation enforcement (no shared fallbacks)
- [x] Removed auth/payment/user/access routes (moved to Sailor-Client)
- [x] Removed payment validation logic
- [x] Removed access pass checks

**Database Migrations**:

- [x] `004_runtime_sessions.sql` - Runtime session tracking
- [x] `005_exam_sessions.sql` - Exam session records (Sailor-Client owned)

**Frontend Updates**:

- [x] All API calls redirected to Sailor-Client
- [x] Response format handling (`{success: true, data: null}`)
- [x] Error handling for new response formats

**Testing**:

- [x] Unit tests for payment service
- [x] Unit tests for exam controller
- [x] Integration tests for CKX internal APIs
- [x] Service authentication tests

### Current Issues / Bugs

**Critical**:

- [ ] **Docker Socket Permissions**: Facilitator container cannot access `/var/run/docker.sock`
  - **Error**: `connect EACCES /var/run/docker.sock`
  - **Fix Applied**: `docker-compose.yaml` updated with `user: "995:1001"` (docker group GID: nodeuser UID)
  - **Status**: Requires container rebuild and restart
  - **Action**: Run `docker compose build facilitator && docker compose restart facilitator`

**Database Migrations**:

- [ ] **Missing Tables**: `runtime_sessions` and `exam_sessions` tables may not exist
  - **Fix**: Run `./scripts/run-all-migrations.sh` or manually execute migrations
  - **Status**: Migrations exist but may not have been applied

**Known Issues**:

- [ ] Deprecated routes still exist in CKX (marked for removal in Phase 3 cleanup)
- [ ] Frontend may have some old API calls that need updating
- [ ] Docker socket access requires container rebuild

### Next Steps

1. **Fix Docker Socket Access**:

   ```bash
   docker compose build facilitator
   docker compose restart facilitator
   ```

2. **Run Database Migrations**:

   ```bash
   ./scripts/run-all-migrations.sh
   ```

3. **Verify Isolation**:

   - Test User A creates exam → isolated runtime
   - Test User B creates exam → different isolated runtime
   - Verify User A cannot access User B's exam

4. **Phase 3 Cleanup** (Optional):
   - Remove deprecated routes from CKX
   - Remove deprecated controllers/services
   - Clean up old code

---

## Phase 3: User Authentication & Accounts ✅

**Status**: Complete

**Completed Tasks**:

- [x] PostgreSQL service with migrations
- [x] User registration and login (JWT: access + refresh tokens)
- [x] Protected API routes (authenticate, optionalAuth)
- [x] CKX webapp auth protection
- [x] Login, register, and session handling

**Token Strategy**: Access token 15 min; refresh token 7 days. Passwords hashed with bcrypt.

---

## Phase 3.5: Exam Content Restructuring ✅

**Status**: Complete

**Completed Tasks**:

- [x] Labs.json updated with `type` and `isFree` for all exams
- [x] Mock exams: CKAD, CKA, CKS, Docker, Helm
- [x] API filters by `type` and `category`
- [x] Access control by exam type

---

## Phase 4: Payment Integration ✅

**Status**: Complete

**Completed Tasks**:

- [x] Stripe checkout (one-time payments)
- [x] Access passes schema (access_passes, pass_types)
- [x] Access service (checkUserAccess, activatePass, getUserPasses)
- [x] Billing controller and routes
- [x] Payment verification (`getCheckoutSession`)
- [x] Pricing page and payment success page

**Pricing Model**:
| Plan | Price | Duration |
| ------------- | ------ | --------------- |
| Free Trial | $0 | Mock exams only |
| 38 Hours Pass | $4.99 | 38 hours |
| 1 Week Pass | $19.99 | 7 days |
| 2 Weeks Pass | $29.99 | 14 days |

---

## Phase 5: Auth & Payment in CKX ✅

**Status**: Complete

**Completed Tasks**:

- [x] Auth.js (token storage, login/register/logout/refresh)
- [x] Login and register pages
- [x] Dashboard (user, access status, exam history)
- [x] Navigation component on all pages
- [x] All facilitator API calls use Bearer tokens
- [x] Webapp allowlists for auth routes

**Result**: Single CKX frontend for exam session, auth, and payment.

---

## Phase 6: Production Deployment 🔄

**Status**: Next Phase

**Goal**: Deploy to AWS with production-grade infrastructure.

**Planned Tasks**:

- [ ] Route 53 → CloudFront → ALB (WebSocket enabled)
- [ ] Web app and Facilitator on ECS
- [ ] Sailor-Client on ECS
- [ ] CKX workers (EC2) in Auto Scaling Group
- [ ] RDS PostgreSQL, ElastiCache Redis, S3 for assets
- [ ] Terraform (VPC, ECS, RDS, ElastiCache, EC2 workers)
- [ ] CI/CD (GitHub Actions: build, migrate, deploy, health check)
- [ ] SSL/TLS, monitoring, alerting, database backups

**Cost Estimate (10 concurrent users)**: ~$445/month

**Exit Criteria**:

- [ ] Terraform provisions all resources
- [ ] CI/CD deploys on push to main
- [ ] SSL/TLS configured
- [ ] Monitoring and alerting in place
- [ ] Database backups configured

---

## Phase 7: Scaling & Performance ⏳

**Status**: Pending

**Goal**: Support 100+ concurrent users; exam start < 10 seconds.

**Planned Tasks**:

- [ ] Cluster pooling (pre-warm clusters)
- [ ] EC2 Auto Scaling on active session count
- [ ] Target < 10s exam start time

**Exit Criteria**:

- [ ] Cluster pool (e.g. 3+ warm clusters)
- [ ] Exam start time < 10 seconds
- [ ] Auto-scaling responds within ~5 minutes
- [ ] System handles 100 concurrent users

---

## Phase 8: Enterprise Features ⏳

**Status**: Pending

**Goal**: SSO, teams, LMS integration for enterprise.

**Planned Tasks**:

- [ ] Organizations and members tables
- [ ] SAML 2.0 / OAuth 2.0 SSO
- [ ] LTI 1.3 (Canvas, Moodle, Blackboard)

**Exit Criteria**:

- [ ] Organizations can invite members
- [ ] Admin dashboard for team usage
- [ ] SSO login with test IdP
- [ ] LTI integration tested with Canvas

---

## Current Architecture

### Services

**Sailor-Client (Control Plane)**:

- Port: 4000 (internal), 4001 (exposed)
- Responsibilities: Auth, payments, user management, exam session business logic
- Database: Owns `users`, `exam_sessions`, `access_passes`, `refresh_tokens`
- APIs: `/sailor-client/api/v1/*`

**CKX (Execution Engine)**:

- Port: 3000 (internal), 3001 (exposed)
- Responsibilities: Runtime execution, container spawning, exam grading
- Database: Owns `runtime_sessions`, `terminal_sessions`
- APIs: `/internal/*` (service-to-service), `/api/v1/*` (runtime access)

**Webapp**:

- Port: 3000 (internal), exposed via nginx
- Responsibilities: Frontend UI, VNC/SSH proxying

**Supporting Services**:

- PostgreSQL: Shared database
- Redis: Session state
- Nginx: Reverse proxy (port 30080)
- Docker: Container runtime for isolation

### Isolation Model

**Per Exam Session**:

- Unique `exam_session_id` (UUID)
- Dedicated VNC container: `ckx-vnc-{exam_session_id}`
- Dedicated SSH container: `ckx-ssh-{exam_session_id}`
- Dedicated Kubernetes namespace: `exam-{exam_session_id}`
- No shared resources between sessions

**Enforcement**:

- Sailor-Client: One active session per user (409 Conflict)
- CKX: Ownership validation (`user_id` matches `exam_session_id`)
- CKX: Strict `expires_at` enforcement
- CKX: No shared fallbacks (403 Forbidden if isolation fails)

---

## Known Issues & Bugs

### Critical

1. **Docker Socket Permission Error**

   - **Error**: `connect EACCES /var/run/docker.sock`
   - **Location**: Facilitator container
   - **Impact**: Cannot spawn isolated containers
   - **Fix**: Container needs rebuild with docker group GID
   - **Status**: Fix applied, requires rebuild

2. **Missing Database Tables**
   - **Error**: `relation "runtime_sessions" does not exist` or `relation "exam_sessions" does not exist`
   - **Impact**: Exam creation fails
   - **Fix**: Run migrations: `./scripts/run-all-migrations.sh`
   - **Status**: Migrations exist, may not be applied

### Medium Priority

3. **Deprecated Routes Still Active**

   - **Location**: CKX `/api/v1/exams/*`, `/api/v1/auth/*`, etc.
   - **Impact**: Code clutter, potential confusion
   - **Fix**: Remove in Phase 3 cleanup
   - **Status**: Marked as deprecated, still functional

4. **Frontend Response Format Handling**
   - **Issue**: Some frontend code may not handle new `{success: true, data: null}` format
   - **Impact**: UI may not work correctly when no exam exists
   - **Fix**: Already updated in most places, verify all
   - **Status**: Mostly fixed, needs verification

### Low Priority

5. **Test Coverage**
   - **Issue**: Limited test coverage for new architecture
   - **Impact**: Risk of regressions
   - **Fix**: Add more integration tests
   - **Status**: Basic tests exist, needs expansion

---

## Immediate Action Items

### Before Production

1. **Fix Docker Socket Access**:

   ```bash
   docker compose build facilitator
   docker compose restart facilitator
   docker compose logs facilitator --tail 20 | grep -i docker
   ```

2. **Run All Migrations**:

   ```bash
   ./scripts/run-all-migrations.sh
   ```

3. **Verify Database Tables**:

   ```bash
   docker compose exec postgres psql -U ckx -d ckx -c "\dt"
   ```

   Should show: `users`, `exam_sessions`, `runtime_sessions`, `terminal_sessions`, `access_passes`

4. **Test Isolation**:

   - Create exam as User A
   - Verify containers spawned: `docker ps | grep ckx-vnc`
   - Create exam as User B
   - Verify different containers
   - Verify User A cannot access User B's exam

5. **Test Payment Flow**:
   - Create checkout session
   - Complete payment
   - Verify payment status
   - Create exam session

### Phase 3 Cleanup (Optional)

1. Remove deprecated routes from CKX:

   - `/api/v1/auth/*`
   - `/api/v1/billing/*`
   - `/api/v1/users/*`
   - `/api/v1/access/*`
   - `/api/v1/exams/*` (keep only runtime access routes)

2. Remove deprecated controllers/services:

   - `authController.js`
   - `billingController.js`
   - `userController.js`
   - `accessController.js`
   - `authService.js`
   - `paymentService.js` (from CKX)

3. Update documentation

---

## Technical Reference

### Resource Requirements Per Session

| Service         | CPU (limit) | Memory (limit) |
| --------------- | ----------- | -------------- |
| k8s-api-server  | 2.0         | 4 GB           |
| remote-desktop  | 1.0         | 1 GB           |
| jumphost        | 1.0         | 512 MB         |
| remote-terminal | 0.5         | 512 MB         |
| VNC container   | 1.0         | 1 GB           |
| SSH container   | 0.5         | 512 MB         |
| **Total**       | **6.0**     | **7.5 GB**     |

### Scalability Matrix

| Concurrent Users | Infrastructure       | Monthly Cost |
| ---------------- | -------------------- | ------------ |
| 10               | Single large VM      | ~$450        |
| 50               | VM cluster (3 nodes) | ~$2,000      |
| 100              | Auto-scaling cluster | ~$4,000      |
| 500              | Multi-region cluster | ~$20,000     |

### Technology Stack

| Component  | Technology          | Phase |
| ---------- | ------------------- | ----- |
| Database   | PostgreSQL 15       | 3     |
| Cache      | Redis               | 1     |
| Auth       | JWT (jsonwebtoken)  | 3     |
| Payments   | Stripe              | 4     |
| Containers | Docker              | 2.5   |
| K8s        | KIND (K3d)          | 1     |
| IaC        | Terraform           | 6     |
| CI/CD      | GitHub Actions      | 6     |
| Monitoring | CloudWatch + Sentry | 6     |

---

## Risk Assessment

| Risk                                | Impact   | Likelihood | Mitigation                         |
| ----------------------------------- | -------- | ---------- | ---------------------------------- |
| Docker socket access failure        | High     | Medium     | Proper group permissions, testing  |
| Database migration failures         | High     | Low        | Migration scripts, rollback plan   |
| Service authentication failure      | High     | Low        | HMAC validation, logging           |
| Isolation breach                    | Critical | Low        | Strict ownership validation        |
| Infrastructure costs exceed revenue | High     | Medium     | Usage limits, efficient scaling    |
| Security vulnerability              | High     | Low        | Regular audits, dependency updates |

---

## Decision Log

| Date       | Decision                                      | Rationale                                          |
| ---------- | --------------------------------------------- | -------------------------------------------------- |
| 2026-02-02 | One exam per user                             | Mirrors real exams, saves resources                |
| 2026-02-02 | PostgreSQL over MongoDB                       | Relational data, ACID compliance                   |
| 2026-02-02 | Stripe for payments                           | Developer-friendly, handles complexity             |
| 2026-02-03 | Control Plane / Execution Engine split        | Strict isolation, multi-tenancy, reusability       |
| 2026-02-03 | Sailor-Client owns business logic             | Single source of truth for auth/payments           |
| 2026-02-03 | CKX only trusts Sailor-Client                 | Never trusts browsers, service authentication only |
| 2026-02-03 | One user = one isolated session               | Backend enforcement; 409 on duplicate start        |
| 2026-02-03 | Ownership validation from exam_sessions table | Never trust Redis; PostgreSQL is source of truth   |

---

_Last updated: 2026-02-03_

# Phase 3.5: Exam Content Restructuring

**Document Type**: Implementation Record  
**Status**: ✅ Complete  
**Date**: 2026-02-02  
**Author**: Danilo Jr. B. Casim  
**Reviewed By**: Senior Software Engineer

---

## 1. Executive Summary

Phase 3.5 restructures the exam content system to support mock (free) and full (paid) exams. This enables a freemium model where users can try the platform with mock exams before purchasing access to full exams.

### Goals

- Create mock exams for each certification category (CKAD, CKA, CKS, Docker, Helm)
- Add `type` and `isFree` fields to lab configuration
- Implement API filtering by exam type and category
- Restrict full exams to authenticated users only
- Mock exams accessible to all users (no authentication required)

### Implementation Status

- [x] Labs.json updated with `type` and `isFree` fields for all exams
- [x] Mock exam created for CKAD (5 questions, 30 minutes)
- [x] Mock exam created for CKA (5 questions, 30 minutes)
- [x] Mock exam created for CKS (3 questions, 20 minutes)
- [x] Mock exam created for Docker (3 questions, 15 minutes)
- [x] Mock exam created for Helm (3 questions, 15 minutes)
- [x] API returns exam type in listing (`GET /api/v1/exams/labs`)
- [x] API filters by `type` and `category` query parameters
- [x] `optionalAuth` middleware for public endpoints
- [x] Unauthenticated users only see mock exams
- [x] Full exams require authentication (401 if not logged in)
- [x] Documentation updated (`how-to-add-new-labs.md`)

---

## 2. Content Strategy

### 2.1 Mock vs Full Exams

| Aspect | Mock Exams | Full Exams |
|--------|------------|------------|
| **Purpose** | Free preview, platform trial | Complete exam simulation |
| **Access** | No authentication required | Requires login |
| **Duration** | 15-30 minutes | 60-120 minutes |
| **Questions** | 3-5 questions | 10-20 questions |
| **Difficulty** | Mixed (showcase platform) | Exam-level |
| **Pricing** | Free | Requires access pass (Phase 4) |

### 2.2 Mock Exam Summary

| Category | Lab ID | Questions | Duration | Topics Covered |
|----------|--------|-----------|----------|----------------|
| **CKAD** | `ckad-mock` | 5 | 30 min | Deployments, ConfigMaps, NetworkPolicies, Services, Probes |
| **CKA** | `cka-mock` | 5 | 30 min | Pods, ConfigMaps, PVC/Storage, HPA, Helm |
| **CKS** | `cks-mock` | 3 | 20 min | NetworkPolicies, RBAC, Pod Security Standards |
| **Docker** | `docker-mock` | 3 | 15 min | Containers, Volumes, Networking |
| **Helm** | `helm-mock` | 3 | 15 min | Repo management, Chart installation, Upgrades |

---

## 3. Labs.json Schema

### 3.1 Updated Fields

Each lab entry now includes:

```json
{
  "id": "ckad-mock",
  "assetPath": "assets/exams/ckad/mock",
  "name": "CKAD Mock Exam - Free Preview",
  "category": "CKAD",
  "description": "Free preview with 5 questions...",
  "warmUpTimeInSeconds": 120,
  "difficulty": "Medium",
  "examDurationInMinutes": 30,
  "type": "mock",
  "isFree": true
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `type` | string | `"mock"`, `"full"` | Exam classification |
| `isFree` | boolean | `true`, `false` | Whether exam requires payment |

### 3.2 Full Labs Registry

```json
{
  "labs": [
    // CKAD
    { "id": "ckad-001", "type": "full", "isFree": false },
    { "id": "ckad-002", "type": "full", "isFree": false },
    { "id": "ckad-mock", "type": "mock", "isFree": true },
    
    // CKA
    { "id": "cka-001", "type": "full", "isFree": false },
    { "id": "cka-002", "type": "full", "isFree": false },
    { "id": "cka-mock", "type": "mock", "isFree": true },
    
    // CKS
    { "id": "cks-001", "type": "full", "isFree": false },
    { "id": "cks-mock", "type": "mock", "isFree": true },
    
    // Docker
    { "id": "docker-001", "type": "full", "isFree": false },
    { "id": "docker-mock", "type": "mock", "isFree": true },
    
    // Helm
    { "id": "helm-001", "type": "full", "isFree": false },
    { "id": "helm-mock", "type": "mock", "isFree": true }
  ]
}
```

---

## 4. Directory Structure

### 4.1 Mock Exam Locations

```
facilitator/assets/exams/
├── ckad/
│   ├── 001/                    # Full exam
│   ├── 002/                    # Full exam
│   └── mock/                   # NEW: Mock exam
│       ├── config.json
│       ├── assessment.json
│       ├── answers.md
│       └── scripts/
│           ├── setup/
│           └── validation/
├── cka/
│   ├── 001/
│   ├── 002/
│   └── mock/                   # NEW: Mock exam
├── cks/
│   ├── 001/
│   └── mock/                   # NEW: Mock exam
├── other/
│   ├── 001/                    # Docker full
│   ├── 002/                    # Helm full
│   ├── docker-mock/            # NEW: Docker mock
│   └── helm-mock/              # NEW: Helm mock
└── labs.json                   # Updated with all exams
```

---

## 5. API Changes

### 5.1 Labs Listing Endpoint

**Endpoint**: `GET /api/v1/exams/labs`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by exam type (`mock` or `full`) |
| `category` | string | Filter by category (`ckad`, `cka`, `cks`, etc.) |

**Examples**:
```bash
# Get all labs (authenticated)
GET /api/v1/exams/labs

# Get only mock exams
GET /api/v1/exams/labs?type=mock

# Get CKAD exams only
GET /api/v1/exams/labs?category=ckad

# Combine filters
GET /api/v1/exams/labs?type=full&category=cka
```

**Response**:
```json
{
  "success": true,
  "labs": [
    {
      "id": "ckad-mock",
      "name": "CKAD Mock Exam - Free Preview",
      "category": "CKAD",
      "description": "Free preview with 5 questions...",
      "difficulty": "Medium",
      "duration": 30,
      "type": "mock",
      "isFree": true
    }
  ]
}
```

### 5.2 Access Control Logic

```javascript
// In examController.js - getLabsList()

// Filter by type if specified
if (type) {
  labs = labs.filter(lab => lab.type === type);
}

// Filter by category if specified
if (category) {
  labs = labs.filter(lab => 
    lab.category.toLowerCase() === category.toLowerCase()
  );
}

// Unauthenticated users only see mock exams
if (!isAuthenticated) {
  labs = labs.filter(lab => lab.type === 'mock');
}
```

### 5.3 Exam Creation Access Control

```javascript
// In examController.js - createExam()

// Check access control: full exams require authentication
const labType = lab.type || 'full';
const isAuthenticated = !!req.userId;

if (labType === 'full' && !isAuthenticated) {
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required for full exams. Please login or try a mock exam.'
  });
}
```

---

## 6. Middleware Changes

### 6.1 Optional Auth Middleware

The `optionalAuth` middleware was added to allow endpoints to work for both authenticated and anonymous users:

```javascript
// In authMiddleware.js

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token - continue without auth
    req.userId = null;
    return next();
  }
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    req.userId = decoded.userId;
  } catch (error) {
    // Invalid token - continue without auth
    req.userId = null;
  }
  
  next();
}
```

### 6.2 Route Registration

```javascript
// In examRoutes.js

// Labs listing - optional auth (shows mock to anonymous, all to authenticated)
router.get('/labs', optionalAuth, examController.getLabsList);

// Exam creation - optional auth (mock allowed anonymous, full requires auth)
router.post('/', optionalAuth, validateCreateExam, examController.createExam);
```

---

## 7. Mock Exam Details

### 7.1 CKAD Mock Exam

**Questions**:
1. Create deployment with specific replicas in namespace
2. Create ConfigMap and pod using environment variables
3. Create NetworkPolicy for traffic isolation
4. Create deployment with ClusterIP service
5. Create pod with liveness and readiness probes

**Topics Covered**: Deployments, ConfigMaps, NetworkPolicies, Services, Health Probes

### 7.2 CKA Mock Exam

**Questions**:
1. Create namespace and pod with labels
2. Create ConfigMap and mount in pod
3. Create PVC and pod with persistent storage
4. Create deployment with HPA
5. Install Helm chart (nginx)

**Topics Covered**: Pods, Namespaces, ConfigMaps, Storage, HPA, Helm

### 7.3 CKS Mock Exam

**Questions**:
1. Create NetworkPolicy (deny all + specific allow)
2. Create Role and RoleBinding with minimal permissions
3. Configure namespace with Pod Security Standards

**Topics Covered**: NetworkPolicies, RBAC, Pod Security

### 7.4 Docker Mock Exam

**Questions**:
1. Run container with environment variables and port mapping
2. Create volume and mount in container
3. Create custom network and connect containers

**Topics Covered**: Containers, Volumes, Networking

### 7.5 Helm Mock Exam

**Questions**:
1. Add Helm repository
2. Install chart with custom values
3. Upgrade release with new settings

**Topics Covered**: Helm repos, Installation, Upgrades

---

## 8. Documentation Updates

### 8.1 Updated Files

| File | Changes |
|------|---------|
| `docs/how-to-add-new-labs.md` | Added `type` and `isFree` fields documentation |
| `CLAUDE.md` | Updated API endpoints with filter parameters |

### 8.2 New Lab Registration Example

```json
{
  "id": "ckad-003",
  "assetPath": "assets/exams/ckad/003",
  "name": "CKAD Practice Lab - Advanced Deployments",
  "category": "CKAD",
  "description": "Practice advanced deployment patterns",
  "warmUpTimeInSeconds": 60,
  "difficulty": "medium",
  "type": "full",
  "isFree": false
}
```

---

## 9. Testing Checklist

### 9.1 API Tests

- [x] `GET /labs` returns all labs when authenticated
- [x] `GET /labs` returns only mock labs when not authenticated
- [x] `GET /labs?type=mock` filters correctly
- [x] `GET /labs?type=full` filters correctly
- [x] `GET /labs?category=ckad` filters correctly
- [x] Filters can be combined

### 9.2 Access Control Tests

- [x] Anonymous user can start mock exam
- [x] Anonymous user blocked from full exam (401)
- [x] Authenticated user can start mock exam
- [x] Authenticated user can start full exam
- [x] Error messages guide user to login or try mock

### 9.3 Mock Exam Functionality

- [x] Each mock exam has valid assessment.json
- [x] Each mock exam has setup scripts
- [x] Each mock exam has validation scripts
- [x] Each mock exam has answers.md
- [x] Scripts are executable

---

## 10. Exit Criteria

- [x] Labs.json updated with `type` field for all exams
- [x] Mock exam created for CKAD (5 questions)
- [x] Mock exam created for CKA (5 questions)
- [x] Mock exam created for CKS (3 questions)
- [x] Mock exam created for Helm (3 questions)
- [x] Mock exam created for Docker (3 questions)
- [x] API returns exam type in listing
- [x] API filters by type parameter
- [x] API filters by category parameter
- [x] Unauthenticated users only see mock exams
- [x] Full exams require authentication
- [x] Documentation updated

---

## 11. Next Steps (Phase 4)

With exam types in place, Phase 4 can now implement:

1. **Access Pass System** - Time-based access for full exams
2. **Mock Payment Flow** - Simulate purchase before Stripe
3. **Countdown Timer** - Display remaining access time
4. **Expiry Handling** - Redirect when access expires

See `PHASE4_PAYMENT_MVP.md` for detailed implementation plan.

---

_Document created: 2026-02-02. Last updated: 2026-02-02._

# Phase 1.5: Session Management Integration

**Document Type**: Implementation Record
**Status**: Completed
**Date**: 2026-02-02
**Author**: Danilo Jr. B. Casim

---

## 1. Executive Summary

Phase 1.5 integrates the port allocator with the exam lifecycle for multi-user support. This enables multiple users to run exams concurrently (one exam per user/browser).

**Key Features**:

- Ports are allocated when exams are created
- Ports are released when exams end
- VNC restart no longer disrupts other active sessions
- Session limits prevent resource exhaustion

**Completed**:

- [x] Port allocator integration with exam creation/cleanup
- [x] Session capacity limits (MAX_CONCURRENT_SESSIONS)
- [x] VNC restart conditional logic (first session only)
- [x] Session orchestrator (SHARED mode)
- [x] Session routes API endpoints

**Design Decision**: Single exam per browser. Users must end current exam before starting a new one. This mirrors real certification exam behavior.

---

## 2. Port Allocator Integration

### 2.1 Exam Creation Flow

**File**: `facilitator/src/services/examService.js`

```javascript
// NEW: Configuration for session limits
const MAX_CONCURRENT_SESSIONS = parseInt(
  process.env.MAX_CONCURRENT_SESSIONS || '10',
  10,
);

async function createExam(examData) {
  // Check capacity
  const activeSessions = await redisClient.getActiveSessions();
  if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
    return {
      success: false,
      error: 'Capacity Reached',
      message: `Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached.`,
    };
  }

  const examId = uuidv4();

  // Allocate ports BEFORE setup
  const sessionPorts = await portAllocator.allocateSessionPorts(examId);
  // sessionPorts = { vnc: 6901, sshTerminal: 2201, sshJumphost: 2301, k8sApi: 6443 }

  // Register session with port info
  await redisClient.registerSession(examId, {
    labId: examData.config?.lab,
    category: examData.category,
    createdAt: examData.createdAt,
    ports: sessionPorts, // NEW: Include ports
  });

  // Pass ports to environment setup
  setupExamEnvironmentAsync(examId, nodeCount, sessionPorts);

  return {
    success: true,
    data: {
      id: examId,
      status: 'CREATED',
      ports: sessionPorts, // NEW: Return ports to client
    },
  };
}
```

### 2.2 Exam Cleanup Flow

```javascript
async function endExam(examId) {
  // ... cleanup environment ...

  // Release allocated ports
  await portAllocator.releaseSessionPorts(examId);

  // Unregister session
  await redisClient.unregisterSession(examId);
  await redisClient.deleteAllExamData(examId);
}
```

### 2.3 Failure Handling

```javascript
// In setupExamEnvironmentAsync - release ports on failure
catch (error) {
  await redisClient.persistExamStatus(examId, 'PREPARATION_FAILED');

  // Release ports to prevent leaks
  await portAllocator.releaseSessionPorts(examId);
}
```

---

## 3. Session Capacity Limits

### 3.1 Configuration

| Variable                  | Default | Description                        |
| ------------------------- | ------- | ---------------------------------- |
| `MAX_CONCURRENT_SESSIONS` | 10      | Maximum simultaneous exam sessions |

### 3.2 Enforcement Logic

```javascript
const activeSessions = await redisClient.getActiveSessions();
if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
  return {
    success: false,
    error: 'Capacity Reached',
    message: `Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached.`,
    activeSessions: activeSessions.length,
  };
}
```

### 3.3 Response Codes

| Scenario               | HTTP Status | Error Code                   |
| ---------------------- | ----------- | ---------------------------- |
| Capacity reached       | 503         | `Capacity Reached`           |
| Port allocation failed | 500         | `Resource Allocation Failed` |
| Success                | 201         | —                            |

---

## 4. VNC Restart Fix

### 4.1 Problem

**Before**: Every `createExam()` call triggered `remoteDesktopService.restartVncSession()`, which:

- Killed VNC display `:1`
- Disconnected ALL active VNC users
- Broke multi-session functionality

**Location**: `facilitator/src/services/jumphostService.js:35`

### 4.2 Solution

Only restart VNC for the FIRST session:

```javascript
async function setupExamEnvironment(
  examId,
  nodeCount = 1,
  sessionPorts = null,
) {
  // ...

  // Only restart VNC if this is the first/only session
  const activeSessions = await redisClient.getActiveSessions();
  const isFirstSession = activeSessions.length <= 1;

  if (isFirstSession) {
    logger.info('First session - restarting VNC display');
    try {
      await remoteDesktopService.restartVncSession();
    } catch (vncError) {
      logger.warn(`VNC restart failed (non-fatal): ${vncError.message}`);
    }
  } else {
    logger.info(
      `Skipping VNC restart - ${activeSessions.length} sessions active`,
    );
  }

  // Continue with setup...
}
```

### 4.3 Behavior Matrix

| Active Sessions | VNC Restart | Reason                      |
| --------------- | ----------- | --------------------------- |
| 0 (first exam)  | Yes         | Clean slate for new session |
| 1+              | No          | Would disrupt other users   |

---

## 5. API Changes

### 5.1 Create Exam Response

```json
{
  "success": true,
  "data": {
    "id": "abc123-...",
    "status": "CREATED",
    "message": "Exam created successfully...",
    "ports": {
      "vnc": 6901,
      "sshTerminal": 2201,
      "sshJumphost": 2301,
      "k8sApi": 6443
    }
  }
}
```

### 5.2 Capacity Error Response

```json
{
  "success": false,
  "error": "Capacity Reached",
  "message": "Maximum concurrent sessions (10) reached. Please try again later.",
  "activeSessions": 10
}
```

### 5.3 Port Allocation Error Response

```json
{
  "success": false,
  "error": "Resource Allocation Failed",
  "message": "Unable to allocate ports for new session. Try ending unused sessions.",
  "details": "No available VNC ports. Range 6901-6999 exhausted."
}
```

---

## 6. Files Modified

| File                                              | Changes                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `facilitator/src/services/examService.js`         | +40 lines - port allocation, limits, cleanup     |
| `facilitator/src/services/jumphostService.js`     | +15 lines - conditional VNC restart, ports param |
| `facilitator/src/services/sessionOrchestrator.js` | NEW - session lifecycle management               |
| `facilitator/src/services/portAllocator.js`       | NEW - port allocation service                    |
| `facilitator/src/routes/sessionRoutes.js`         | NEW - session API endpoints                      |
| `facilitator/src/app.js`                          | +2 lines - register session routes               |
| `app/server.js`                                   | +20 lines - session router integration           |
| `app/services/session-router.js`                  | NEW - session routing service                    |
| `app/services/ssh-terminal.js`                    | +25 lines - session-aware SSH                    |

---

## 7. Implemented Components (Phase 1.5-C/D)

### 7.1 Session Orchestrator (Implemented)

**Location**: `facilitator/src/services/sessionOrchestrator.js`

**Current Mode**: SHARED (all sessions use common containers)

**Features**:

- Session lifecycle management (initialize, activate, terminate)
- Port allocation coordination with portAllocator
- Session state tracking in Redis
- Routing information API for webapp

**Future Enhancement**: ISOLATED mode for per-session containers using Docker API.

### 7.2 WebSocket Routing (Implemented)

**Files Modified**:

- `app/server.js` - Added SessionRouter integration
- `app/services/session-router.js` - Session routing service
- `app/services/ssh-terminal.js` - Session-aware SSH connections
- `facilitator/src/app.js` - Registered session routes
- `facilitator/src/routes/sessionRoutes.js` - Session API endpoints

**Supported URL Patterns**:

```
VNC:  /websockify                     → Default VNC (backward compatible)
SSH:  /ssh                            → Default SSH namespace
SSH:  /session/{examId}/ssh           → Session-specific SSH namespace
```

**Session ID Extraction**:

- URL path: `/session/:sessionId/...`
- Query parameter: `?sessionId=xxx`
- Header: `X-Session-Id`
- Socket.io handshake query

### 7.3 Session Routes API

**Endpoint**: `/api/v1/sessions`

| Route                 | Method | Description                     |
| --------------------- | ------ | ------------------------------- |
| `/`                   | GET    | List all active sessions        |
| `/stats`              | GET    | Get session and port statistics |
| `/:sessionId`         | GET    | Get session information         |
| `/:sessionId/routing` | GET    | Get routing info for VNC/SSH    |
| `/:sessionId/ports`   | GET    | Get allocated ports             |
| `/:sessionId`         | DELETE | Terminate a session             |

---

## 8. Testing Checklist

### 8.1 Port Allocation

- [ ] First exam allocates ports 6901, 2201, 2301, 6443
- [ ] Second exam allocates ports 6902, 2202, 2302, 6444
- [ ] Ending exam releases ports back to pool
- [ ] Failed setup releases allocated ports

### 8.2 Session Limits

- [ ] 11th exam rejected when limit is 10
- [ ] Error message includes current count
- [ ] After ending one exam, new exam succeeds

### 8.3 VNC Behavior

- [ ] First exam restarts VNC
- [ ] Second exam skips VNC restart
- [ ] Existing VNC connections survive second exam creation

### 8.4 Manual Verification

```bash
# Create first exam
curl -X POST http://localhost:30080/facilitator/api/v1/exams \
  -H "Content-Type: application/json" \
  -d '{"labId": "ckad-lab1", ...}'
# Response includes ports: { vnc: 6901, ... }

# Check port allocations
redis-cli HGETALL ports:allocated
# VNC:6901 → exam-id-1

# Create second exam (should NOT restart VNC)
curl -X POST http://localhost:30080/facilitator/api/v1/exams \
  -H "Content-Type: application/json" \
  -d '{"labId": "ckad-lab2", ...}'
# Response includes ports: { vnc: 6902, ... }

# Verify both allocated
redis-cli HGETALL ports:allocated
# VNC:6901 → exam-id-1
# VNC:6902 → exam-id-2

# End first exam
curl -X POST http://localhost:30080/facilitator/api/v1/exams/exam-id-1/terminate

# Verify port released
redis-cli HGETALL ports:allocated
# VNC:6902 → exam-id-2  (6901 gone)
```

---

## 9. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         EXAM CREATION (Multi-Session)                     │
└──────────────────────────────────────────────────────────────────────────┘

    POST /api/v1/exams
           │
           ▼
    ┌─────────────────┐
    │ Check Capacity  │ ─── >= MAX_SESSIONS? ───▶ Return 503
    └────────┬────────┘
             │ OK
             ▼
    ┌─────────────────┐
    │ Allocate Ports  │ ─── Failed? ───▶ Return 500
    │ (portAllocator) │
    └────────┬────────┘
             │ Success
             ▼
    ┌─────────────────┐
    │ Register Session│
    │ (Redis)         │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Setup Async     │
    │ (background)    │
    └────────┬────────┘
             │
             ├──▶ Is First Session? ──▶ Yes ──▶ Restart VNC
             │                          │
             │                          ▼ No
             │                     Skip VNC Restart
             │
             ▼
    ┌─────────────────┐
    │ Return Response │
    │ + Ports Info    │
    └─────────────────┘


┌──────────────────────────────────────────────────────────────────────────┐
│                           EXAM CLEANUP                                    │
└──────────────────────────────────────────────────────────────────────────┘

    DELETE /api/v1/exams/:id  or  POST /terminate
           │
           ▼
    ┌─────────────────┐
    │ Cleanup Env     │
    │ (SSH scripts)   │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Release Ports   │ ◀── Frees ports for reuse
    │ (portAllocator) │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Unregister      │
    │ Session (Redis) │
    └─────────────────┘
```

---

## 10. Risk Assessment

### 10.1 Current Risks

| Risk                   | Severity | Status    | Mitigation                                   |
| ---------------------- | -------- | --------- | -------------------------------------------- |
| Port leak on crash     | Medium   | Mitigated | Release on failure + cleanup daemon (future) |
| VNC shared by all      | Medium   | By Design | SHARED mode for MVP, ISOLATED mode future    |
| No container isolation | Medium   | By Design | SHARED mode for MVP, ISOLATED mode future    |

### 10.2 What Works Now

- Multiple exams can be CREATED concurrently
- Each exam gets unique port allocations
- Ports are properly released on cleanup
- VNC is not restarted for subsequent exams
- Session routes API provides routing information
- WebSocket routing infrastructure ready for ISOLATED mode
- SSH terminal supports session-aware connections

### 10.3 Limitations (By Design for MVP)

- All exams share same VNC display (SHARED mode)
- All exams share same SSH terminal (SHARED mode)
- Full isolation requires ISOLATED mode (Phase 2+)

---

## 11. Next Steps

### Phase 2: Full Session Isolation

1. **ISOLATED Mode**: Spawn per-session containers using Docker API (dockerode)
2. **Per-session kubeconfig**: Isolated Kubernetes access per exam
3. **Session health monitoring**: Track container and connection health
4. **Automatic cleanup**: Daemon to clean stale sessions

### Phase 2+: Operations

1. Admin dashboard for session management
2. Session resource usage metrics
3. Horizontal scaling support

---

_Document generated as part of Phase 1.5 implementation. Completed: 2026-02-02._

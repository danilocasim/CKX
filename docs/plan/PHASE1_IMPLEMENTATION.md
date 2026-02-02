# Phase 1: Session Isolation Foundation

**Document Type**: Implementation Record
**Status**: Complete
**Date**: 2026-02-02
**Author**: Danilo Jr. B. Casim

---

## 1. Executive Summary

Phase 1 implements the foundational changes required for multi-session support in CKX. This phase removes the global exam lock, introduces session-based resource management, and updates shell scripts for session-specific isolation.

**Key Achievements**:
- Removed single-exam enforcement from Redis and exam service
- Created port allocation service for dynamic resource assignment
- Updated shell scripts for session-specific paths and cluster names
- Maintained backward compatibility with deprecation warnings

---

## 2. Phase 1A: Remove Global Exam Lock

### 2.1 Redis Client Changes

**File**: `facilitator/src/utils/redisClient.js`

#### Removed/Deprecated Keys

```javascript
// BEFORE (Single-session)
const KEYS = {
  EXAM_INFO: 'exam:info:',
  EXAM_STATUS: 'exam:status:',
  CURRENT_EXAM_ID: 'current-exam-id',  // REMOVED
  EXAM_RESULT: 'exam:result:',
};

// AFTER (Multi-session)
const KEYS = {
  EXAM_INFO: 'exam:info:',
  EXAM_STATUS: 'exam:status:',
  EXAM_RESULT: 'exam:result:',
  // NEW: Multi-session keys
  ACTIVE_SESSIONS: 'sessions:active',
  SESSION_PORTS: 'session:ports:',
  PORT_ALLOCATIONS: 'ports:allocated',
};
```

#### New Functions Added

| Function | Purpose | Parameters |
|----------|---------|------------|
| `registerSession()` | Register an active exam session | `sessionId`, `sessionData`, `ttl` |
| `unregisterSession()` | Remove session from active set | `sessionId` |
| `getActiveSessions()` | List all active session IDs | none |
| `getSessionData()` | Get session metadata | `sessionId` |

#### Deprecated Functions

| Function | Replacement | Behavior |
|----------|-------------|----------|
| `setCurrentExamId()` | `registerSession()` | Logs warning, calls `registerSession()` |
| `getCurrentExamId()` | `getActiveSessions()` | Returns first active session |
| `updateCurrentExamId()` | `registerSession()` | Logs warning |
| `deleteCurrentExamId()` | `unregisterSession()` | Clears specified or all sessions |

### 2.2 Exam Service Changes

**File**: `facilitator/src/services/examService.js`

#### Removed Blocking Logic

```javascript
// BEFORE: Blocked concurrent exams
async function createExam(examData) {
  const currentExamId = await redisClient.getCurrentExamId();
  if (currentExamId) {
    return {
      success: false,
      error: 'Exam already exists',
      message: 'Only one exam can be active at a time...'
    };
  }
  // ...
}

// AFTER: Allows concurrent exams
async function createExam(examData) {
  const activeSessions = await redisClient.getActiveSessions();
  if (activeSessions.length > 0) {
    logger.info(`Creating new exam. Currently ${activeSessions.length} active session(s)`);
  }
  // ... proceeds with creation
}
```

#### Updated Session Registration

```javascript
// BEFORE
await redisClient.setCurrentExamId(examId);

// AFTER
await redisClient.registerSession(examId, {
  labId: examData.config?.lab,
  category: examData.category,
  createdAt: examData.createdAt
});
```

#### New Function: `getActiveExams()`

```javascript
async function getActiveExams() {
  const sessionIds = await redisClient.getActiveSessions();
  const exams = await Promise.all(
    sessionIds.map(async (examId) => ({
      id: examId,
      status: await redisClient.getExamStatus(examId),
      info: await redisClient.getExamInfo(examId),
      session: await redisClient.getSessionData(examId)
    }))
  );
  return { success: true, data: { count: exams.length, exams } };
}
```

#### Updated `endExam()` Function

```javascript
// BEFORE: Checked against "current" exam
const currentExamId = await redisClient.getCurrentExamId();
if (currentExamId !== examId) {
  logger.warn(`Attempted to end exam ${examId} but current exam is ${currentExamId}`);
}
await redisClient.deleteCurrentExamId();

// AFTER: Each exam independently terminable
const examInfo = await redisClient.getExamInfo(examId);
if (!examInfo) {
  return { success: false, error: 'Not Found', message: `Exam ${examId} not found` };
}
await redisClient.unregisterSession(examId);
await redisClient.deleteAllExamData(examId);
```

---

## 3. Phase 1B: Resource Isolation

### 3.1 Port Allocation Service

**File**: `facilitator/src/services/portAllocator.js` (NEW)

#### Port Range Configuration

| Type | Range | Capacity | Environment Variables |
|------|-------|----------|----------------------|
| VNC | 6901-6999 | 99 sessions | `VNC_PORT_RANGE_START`, `VNC_PORT_RANGE_END` |
| SSH Terminal | 2201-2299 | 99 sessions | `SSH_TERMINAL_PORT_RANGE_START`, `SSH_TERMINAL_PORT_RANGE_END` |
| SSH Jumphost | 2301-2399 | 99 sessions | `SSH_JUMPHOST_PORT_RANGE_START`, `SSH_JUMPHOST_PORT_RANGE_END` |
| K8s API | 6443-6542 | 100 sessions | `K8S_PORT_RANGE_START`, `K8S_PORT_RANGE_END` |

#### API Functions

```javascript
// Initialize with Redis client
await portAllocator.initialize(redisClient);

// Allocate all ports for a session
const ports = await portAllocator.allocateSessionPorts(sessionId);
// Returns: { vnc: 6901, sshTerminal: 2201, sshJumphost: 2301, k8sApi: 6443 }

// Release all ports for a session
await portAllocator.releaseSessionPorts(sessionId);

// Get allocation statistics
const stats = portAllocator.getStats();
// Returns: { VNC: { allocated: 1, available: 98, total: 99 }, ... }

// Get max concurrent sessions
const max = portAllocator.getMaxSessions(); // 99
```

#### Redis Storage Structure

```
ports:allocated (Hash)
├── VNC:6901 → "session-abc123"
├── VNC:6902 → "session-def456"
├── SSH_TERMINAL:2201 → "session-abc123"
└── ...

session:ports:abc123 (String/JSON)
{
  "vnc": 6901,
  "sshTerminal": 2201,
  "sshJumphost": 2301,
  "k8sApi": 6443,
  "registeredAt": "2026-02-02T13:00:00.000Z"
}
```

### 3.2 Application Initialization

**File**: `facilitator/src/app.js`

```javascript
// Added import
const portAllocator = require('./services/portAllocator');

// Updated initialization
(async () => {
  try {
    await redisClient.connect();
    logger.info('Redis connected successfully');

    // Initialize port allocator for multi-session support
    await portAllocator.initialize(redisClient);
    const stats = portAllocator.getStats();
    logger.info(`Port allocator ready. Max sessions: ${portAllocator.getMaxSessions()}`, stats);
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
})();
```

---

## 4. Shell Script Updates

### 4.1 Exam Environment Preparation

**File**: `jumphost/scripts/prepare-exam-env.sh`

#### Path Changes

| Resource | Before | After |
|----------|--------|-------|
| Assets Directory | `/tmp/exam-assets` | `/tmp/exam-assets-{EXAM_ID}` |
| Environment Directory | `/tmp/exam-env` | `/tmp/exam-env-{EXAM_ID}` |
| Cluster Name | `$CLUSTER_NAME` (undefined) | `${EXAM_ID}` |

#### Key Changes

```bash
# BEFORE
CLUSTER_NAME=${2:-cluster}  # Often undefined
mkdir -p /tmp/exam-assets
tar -xzvf assets.tar.gz -C /tmp/exam-assets
for script in /tmp/exam-assets/scripts/setup/q*_setup.sh; do $script; done

# AFTER
EXAM_ID=${2:-"default"}
CLUSTER_NAME="${EXAM_ID}"
EXAM_ASSETS_DIR="/tmp/exam-assets-${EXAM_ID}"

mkdir -p "$EXAM_ASSETS_DIR"
tar -xzf assets.tar.gz -C "$EXAM_ASSETS_DIR"
for script in "$EXAM_ASSETS_DIR"/scripts/setup/q*_setup.sh; do
  if [ -f "$script" ]; then
    "$script"
  fi
done
```

### 4.2 Exam Environment Cleanup

**File**: `jumphost/scripts/cleanup-exam-env.sh`

#### Usage Change

```bash
# BEFORE
cleanup-exam-env  # No parameters, cleaned everything

# AFTER
cleanup-exam-env [EXAM_ID]  # Session-specific cleanup
```

#### Multi-Session Safety

```bash
# Only run Docker prune if no other sessions active
OTHER_SESSIONS=$(ls -d /tmp/exam-assets-* 2>/dev/null | grep -v "$EXAM_ASSETS_DIR" | wc -l)
if [ "$OTHER_SESSIONS" -eq 0 ]; then
  log "No other active sessions, performing docker cleanup"
  docker system prune --volumes -f 2>/dev/null || true
else
  log "Skipping docker prune: $OTHER_SESSIONS other session(s) active"
fi
```

### 4.3 K3d Cluster Setup

**File**: `kind-cluster/scripts/env-setup`

#### Config File Path

```bash
# BEFORE
cat <<EOF > /tmp/k3d-config.yaml  # Shared config, overwrites

# AFTER
CONFIG_FILE="/tmp/k3d-config-${CLUSTER_NAME}.yaml"  # Per-cluster config
cat <<EOF > "$CONFIG_FILE"
```

### 4.4 K3d Cluster Cleanup

**File**: `kind-cluster/scripts/env-cleanup`

#### Multi-Session Safety

```bash
# Count remaining clusters before aggressive cleanup
REMAINING_CLUSTERS=$(k3d cluster list 2>/dev/null | grep -v "NAME" | wc -l)

if [ "$REMAINING_CLUSTERS" -eq 0 ]; then
  # Safe to clean Docker resources
  docker volume prune -f
  docker network prune -f
  rm -f /home/candidate/.kube/kubeconfig
else
  # Other sessions active, skip Docker cleanup
  echo "Skipping Docker cleanup: other clusters still active"
fi
```

---

## 5. Jumphost Service Updates

**File**: `facilitator/src/services/jumphostService.js`

### 5.1 Cleanup Command

```javascript
// BEFORE
const command = 'cleanup-exam-env';

// AFTER - Passes examId for session-specific cleanup
const command = `cleanup-exam-env ${examId}`;
```

### 5.2 Validation Script Path

```javascript
// BEFORE
const scriptPath = `/tmp/exam-assets/scripts/validation/${verificationScript}`;

// AFTER - Session-specific asset path
const examAssetsDir = `/tmp/exam-assets-${examId}`;
const scriptPath = `${examAssetsDir}/scripts/validation/${verificationScript}`;
```

---

## 6. API Changes Summary

### 6.1 New Endpoints (Recommended)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/exams/active` | List all active exam sessions |
| GET | `/api/v1/exams/:id/ports` | Get port allocations for session |
| GET | `/api/v1/admin/ports/stats` | Get port allocation statistics |

### 6.2 Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/exams` | No longer returns 409 for concurrent exams |
| `GET /api/v1/exams/current` | Returns first active session (deprecated behavior) |
| `DELETE /api/v1/exams/:id` | Works for any valid exam, not just "current" |

---

## 7. Backward Compatibility

### 7.1 Maintained Compatibility

| Feature | Behavior |
|---------|----------|
| Single-session usage | Works exactly as before |
| `getCurrentExam()` API | Returns first active session |
| Deprecated Redis functions | Log warnings but function correctly |
| Legacy cleanup (no EXAM_ID) | Cleans default/legacy paths |

### 7.2 Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| Multiple exams allowed | UI may show unexpected state | Update UI to handle multiple sessions |
| Cleanup requires EXAM_ID | Legacy scripts may fail | Default parameter provided |

---

## 8. Files Modified

| File | Type | Lines Changed |
|------|------|---------------|
| `facilitator/src/utils/redisClient.js` | Modified | +85, -15 |
| `facilitator/src/services/examService.js` | Modified | +70, -25 |
| `facilitator/src/services/portAllocator.js` | **New** | +280 |
| `facilitator/src/services/jumphostService.js` | Modified | +10, -5 |
| `facilitator/src/app.js` | Modified | +8, -2 |
| `jumphost/scripts/prepare-exam-env.sh` | Modified | +35, -15 |
| `jumphost/scripts/cleanup-exam-env.sh` | Modified | +45, -20 |
| `kind-cluster/scripts/env-setup` | Modified | +15, -8 |
| `kind-cluster/scripts/env-cleanup` | Modified | +30, -15 |

---

## 9. Testing Checklist

### 9.1 Unit Tests

- [ ] `registerSession()` creates Redis entries correctly
- [ ] `unregisterSession()` removes session from active set
- [ ] `getActiveSessions()` returns all active IDs
- [ ] Port allocator assigns unique ports per session
- [ ] Port allocator releases ports on session end
- [ ] Port exhaustion throws appropriate error

### 9.2 Integration Tests

- [ ] Create exam A, verify session registered
- [ ] Create exam B while A active, verify both registered
- [ ] End exam A, verify B unaffected
- [ ] Verify session-specific asset paths created
- [ ] Verify session-specific cluster names used
- [ ] Verify cleanup only affects target session

### 9.3 Manual Verification

```bash
# Start first exam
curl -X POST http://localhost:30080/facilitator/api/v1/exams \
  -H "Content-Type: application/json" \
  -d '{"labId": "ckad-lab1", ...}'

# Verify active sessions
redis-cli SMEMBERS sessions:active

# Start second exam (should succeed now)
curl -X POST http://localhost:30080/facilitator/api/v1/exams \
  -H "Content-Type: application/json" \
  -d '{"labId": "ckad-lab2", ...}'

# Verify both sessions active
redis-cli SMEMBERS sessions:active
# Expected: ["exam-id-1", "exam-id-2"]
```

---

## 10. Next Steps (Phase 2+)

### Completed in Phase 1/1.5
- ✅ Port allocator for multi-user support
- ✅ Session orchestrator (SHARED mode)
- ✅ Session routes API
- ✅ Conditional VNC restart

### Future Work

1. **User Authentication** - Login system for user identity
2. **ISOLATED Mode** - Per-user container spawning
3. **Admin Dashboard** - Session management
4. **Session Persistence** - Resume sessions after restart

---

## 11. Appendix: Code Snippets

### A. Register Session Example

```javascript
// In examService.createExam()
await redisClient.registerSession(examId, {
  labId: examData.config?.lab,
  category: examData.category,
  createdAt: examData.createdAt
});
```

### B. Port Allocation Example

```javascript
// Allocate ports for new session
const ports = await portAllocator.allocateSessionPorts(examId);
console.log(ports);
// { vnc: 6901, sshTerminal: 2201, sshJumphost: 2301, k8sApi: 6443 }

// Release on cleanup
await portAllocator.releaseSessionPorts(examId);
```

### C. Session-Specific Paths

```bash
# In prepare-exam-env.sh
EXAM_ID="abc123"
EXAM_ASSETS_DIR="/tmp/exam-assets-${EXAM_ID}"
# Result: /tmp/exam-assets-abc123

# In env-setup
CLUSTER_NAME="${EXAM_ID}"
CONFIG_FILE="/tmp/k3d-config-${CLUSTER_NAME}.yaml"
# Result: /tmp/k3d-config-abc123.yaml
```

---

*Document generated as part of Phase 1 implementation. Last updated: 2026-02-02.*

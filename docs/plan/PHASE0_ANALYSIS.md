# Phase 0: CKX Single-Session Constraint Analysis

**Document Type**: Technical Analysis
**Status**: Complete
**Last Updated**: 2026-02-02

---

## 1. Executive Summary

This document provides a complete mapping of all single-session constraints in CKX, including hardcoded hostnames, ports, shared resources, and global state. It identifies the **minimum viable changes** required to support 2 concurrent sessions.

---

## 2. Hostname & Service Discovery Map

### 2.1 Docker Compose Service Definitions

| Service | Hostname | Container Name | DNS Resolution |
|---------|----------|----------------|----------------|
| remote-desktop | `terminal` | (auto) | `remote-desktop` |
| webapp | (none) | (auto) | `webapp` |
| nginx | (none) | (auto) | `nginx` |
| jumphost | `ckad9999` | (auto) | `jumphost` |
| remote-terminal | `remote-terminal` | (auto) | `remote-terminal` |
| k8s-api-server | `k8s-api-server` | `kind-cluster` | `k8s-api-server` |
| redis | `redis` | (auto) | `redis` |
| facilitator | `facilitator` | (auto) | `facilitator` |

### 2.2 Hardcoded Hostname References

| File | Line | Reference | Used For |
|------|------|-----------|----------|
| `docker-compose.yaml` | 7 | `hostname: terminal` | VNC server identification |
| `docker-compose.yaml` | 97 | `hostname: ckad9999` | Jumphost SSH target |
| `docker-compose.yaml` | 124 | `hostname: remote-terminal` | SSH terminal entry |
| `docker-compose.yaml` | 148 | `container_name: kind-cluster` | K8s cluster container |
| `docker-compose.yaml` | 149 | `hostname: k8s-api-server` | K8s API server DNS |
| `docker-compose.yaml` | 176 | `hostname: redis` | Redis connection |
| `docker-compose.yaml` | 203 | `hostname: facilitator` | Backend API |
| `nginx/default.conf` | 12 | `proxy_pass http://webapp:3000` | Frontend routing |
| `nginx/default.conf` | 25 | `proxy_pass http://facilitator:3000` | API routing |
| `nginx/default.conf` | 51 | `proxy_pass http://remote-desktop:6901` | VNC WebSocket |
| `facilitator/src/config/index.js` | 8 | `host: 'jumphost'` | SSH connection |
| `facilitator/src/config/index.js` | 21 | `host: 'remote-desktop'` | VNC control |
| `app/server.js` | 15 | `VNC_SERVICE_HOST: 'remote-desktop-service'` | VNC proxy |
| `app/server.js` | 20 | `SSH_HOST: 'remote-terminal'` | SSH proxy |
| `jumphost/scripts/prepare-exam-env.sh` | 43 | `candidate@k8s-api-server` | K8s cluster setup |
| `jumphost/scripts/cleanup-exam-env.sh` | 20 | `candidate@k8s-api-server` | K8s cluster cleanup |

---

## 3. Port Allocation Map

### 3.1 Exposed Ports (docker-compose.yaml)

| Service | Internal Port | External Port | Protocol | Purpose |
|---------|---------------|---------------|----------|---------|
| nginx | 80 | **30080** | HTTP | Main entry point |
| remote-desktop | 5901 | — | TCP | VNC raw |
| remote-desktop | 6901 | — | HTTP/WS | VNC WebSocket (noVNC) |
| webapp | 3000 | — | HTTP | Frontend server |
| facilitator | 3000 | — | HTTP | Backend API |
| jumphost | 22 | — | TCP | SSH |
| remote-terminal | 22 | — | TCP | SSH |
| k8s-api-server | 6443 | — | HTTPS | K8s API |
| k8s-api-server | 22 | — | TCP | SSH |
| redis | 6379 | — | TCP | Redis protocol |

### 3.2 Hardcoded Port References

| File | Line | Port | Context |
|------|------|------|---------|
| `docker-compose.yaml` | 9 | `5901` | VNC server port |
| `docker-compose.yaml` | 10 | `6901` | noVNC web port |
| `docker-compose.yaml` | 38 | `3000` | Webapp port |
| `docker-compose.yaml` | 75 | `30080:80` | Nginx external |
| `docker-compose.yaml` | 101 | `22` | Jumphost SSH |
| `docker-compose.yaml` | 126 | `22` | Remote-terminal SSH |
| `docker-compose.yaml` | 152 | `6443` | K8s API |
| `docker-compose.yaml` | 153 | `22` | K8s SSH |
| `docker-compose.yaml` | 179 | `6379` | Redis |
| `docker-compose.yaml` | 205 | `3000` | Facilitator |
| `kind-cluster/scripts/env-setup` | 11 | `6443` | K8s API port |
| `kind-cluster/scripts/env-setup` | 59 | `6443:6443` | K3d port mapping |
| `facilitator/src/config/index.js` | 9 | `22` | SSH port |
| `facilitator/src/config/index.js` | 22 | `5000` | Remote desktop agent |
| `facilitator/src/utils/redisClient.js` | 19 | `6379` | Redis port |
| `nginx/default.conf` | 8 | `80` | Listen port |

### 3.3 Port Conflict Analysis for Multi-Session

| Port | Service | Conflict Risk | Solution |
|------|---------|---------------|----------|
| 30080 | nginx | None (shared) | Keep single instance |
| 6901 | VNC | **High** | Dynamic allocation (6901-6999) |
| 22 (jumphost) | SSH | **High** | Dynamic allocation (2201-2299) |
| 22 (remote-terminal) | SSH | **High** | Dynamic allocation (2301-2399) |
| 6443 | K8s API | **High** | Dynamic allocation (6443-6543) |
| 3000 (facilitator) | API | None (shared) | Keep single instance |
| 6379 | Redis | None (shared) | Keep single instance |

---

## 4. Shared Volume Analysis

### 4.1 Named Volumes

| Volume Name | Mount Points | Purpose | Multi-Session Impact |
|-------------|--------------|---------|---------------------|
| `kube-config` | jumphost:/home/candidate/.kube | K8s credentials | **Critical** - Single kubeconfig overwritten |
| | k8s-api-server:/home/candidate/.kube | K8s credentials | Same volume, same problem |

### 4.2 Volume Conflict Details

**File**: `docker-compose.yaml:103,155,242`

```yaml
volumes:
  kube-config: # Shared volume for Kubernetes configuration

# jumphost mount:
volumes:
  - kube-config:/home/candidate/.kube

# k8s-api-server mount:
volumes:
  - kube-config:/home/candidate/.kube
```

**Problem**: When `env-setup` runs, it overwrites `kubeconfig` with the new cluster's credentials. Concurrent exams would corrupt each other's K8s access.

**Solution**: Per-session named volumes: `kube-config-{sessionId}`

---

## 5. Shared Filesystem Paths

### 5.1 Temporary Directories

| Path | Created By | Cleared By | Multi-Session Impact |
|------|------------|------------|---------------------|
| `/tmp/exam-assets` | `prepare-exam-env.sh:48` | `cleanup-exam-env.sh:35` | **High** - Overwritten per exam |
| `/tmp/exam-env` | setup scripts | `cleanup-exam-env.sh:30` | **High** - Shared temp |
| `/tmp/exam` | setup scripts | `cleanup-exam-env.sh:31` | **High** - Shared temp |
| `/tmp/k3d-config.yaml` | `env-setup:51` | Next `env-setup` | **High** - Overwritten |

### 5.2 File Path References

| File | Line | Path | Purpose |
|------|------|------|---------|
| `prepare-exam-env.sh` | 48 | `/tmp/exam-assets` | Exam assets extraction |
| `prepare-exam-env.sh` | 50 | `-C /tmp/exam-assets` | Tar extraction target |
| `cleanup-exam-env.sh` | 30 | `/tmp/exam-env` | Cleanup |
| `cleanup-exam-env.sh` | 31 | `/tmp/exam` | Cleanup |
| `cleanup-exam-env.sh` | 35 | `/tmp/exam-assets` | Assets cleanup |
| `kind-cluster/scripts/env-setup` | 51 | `/tmp/k3d-config.yaml` | K3d config |
| `jumphostService.js` | 227 | `/tmp/exam-assets/scripts/validation/` | Validation scripts |
| `jumphostService.js` | 230 | `/home/candidate/.kube/kubeconfig` | K8s config |

---

## 6. Global State Analysis

### 6.1 Redis Key Structure

| Key Pattern | Type | Namespaced | Multi-Session Safe |
|-------------|------|------------|-------------------|
| `current-exam-id` | String | **No** | **No** - Single global key |
| `exam:info:{examId}` | JSON | Yes | Yes |
| `exam:status:{examId}` | String | Yes | Yes |
| `exam:result:{examId}` | JSON | Yes | Yes |

### 6.2 Global State Enforcement Code

**File**: `facilitator/src/services/examService.js:19-33`

```javascript
async function createExam(examData) {
  try {
    // Check if there's already an active exam
    const currentExamId = await redisClient.getCurrentExamId();

    // If currentExamId exists, don't allow creating a new exam
    if (currentExamId) {
      logger.warn(`Attempted to create a new exam while exam ${currentExamId} is still active`);
      return {
        success: false,
        error: 'Exam already exists',
        message: 'Only one exam can be active at a time...',
        currentExamId
      };
    }
    // ... continues with exam creation
```

**File**: `facilitator/src/utils/redisClient.js:13`

```javascript
const KEYS = {
  // ...
  CURRENT_EXAM_ID: 'current-exam-id', // For storing current exam ID (single key)
  // ...
};
```

### 6.3 Singleton Services

| Service | File | Line | Pattern |
|---------|------|------|---------|
| RemoteDesktopService | `remoteDesktopService.js` | 54 | `module.exports = new RemoteDesktopService()` |
| RedisClient | `redisClient.js` | 18 | Single `createClient()` instance |

---

## 7. Exam Lifecycle Dependency Graph

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           EXAM CREATION FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   POST /exams   │
│   (Frontend)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ examController  │────▶│ Check Redis     │ ◀── BLOCKS if currentExamId exists
│  .createExam()  │     │ getCurrentExamId│
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ examService     │
│  .createExam()  │
└────────┬────────┘
         │
         ├──▶ Generate examId (UUID)
         │
         ├──▶ redisClient.persistExamInfo(examId, data)     [exam:info:{id}]
         │
         ├──▶ redisClient.persistExamStatus(examId, 'CREATED') [exam:status:{id}]
         │
         ├──▶ redisClient.setCurrentExamId(examId)          [current-exam-id] ◀── GLOBAL
         │
         └──▶ setupExamEnvironmentAsync(examId, nodeCount)  [Background]
                    │
                    ▼
         ┌─────────────────┐
         │ jumphostService │
         │ .setupExam...() │
         └────────┬────────┘
                  │
                  ├──▶ remoteDesktopService.restartVncSession() ◀── KILLS existing VNC
                  │         │
                  │         └──▶ GET remote-desktop:5000/restart-vnc-session
                  │
                  └──▶ sshService.executeCommand('prepare-exam-env ...')
                            │
                            ▼
                  ┌─────────────────────────────────────────────┐
                  │            JUMPHOST EXECUTION               │
                  │                                             │
                  │  1. SSH to k8s-api-server                   │
                  │     └─▶ env-setup {nodes} {cluster_name}    │
                  │         └─▶ k3d cluster create              │
                  │         └─▶ Writes /home/candidate/.kube/*  │ ◀── SHARED VOLUME
                  │                                             │
                  │  2. curl facilitator:3000/.../assets        │
                  │     └─▶ Download exam assets                │
                  │                                             │
                  │  3. Extract to /tmp/exam-assets             │ ◀── SHARED PATH
                  │                                             │
                  │  4. Run setup scripts                       │
                  │     └─▶ /tmp/exam-assets/scripts/setup/*    │
                  └─────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                           EXAM CLEANUP FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ DELETE /exams/:id│
│ or POST /end     │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ examService     │
│   .endExam()    │
└────────┬────────┘
         │
         ├──▶ jumphostService.cleanupExamEnvironment()
         │         │
         │         └──▶ sshService.executeCommand('cleanup-exam-env')
         │                   │
         │                   ▼
         │         ┌─────────────────────────────────────────┐
         │         │         CLEANUP EXECUTION               │
         │         │                                         │
         │         │  1. SSH to k8s-api-server               │
         │         │     └─▶ env-cleanup {cluster_name}      │
         │         │         └─▶ k3d cluster delete          │
         │         │                                         │
         │         │  2. docker system prune -a              │ ◀── Affects ALL Docker
         │         │                                         │
         │         │  3. rm -rf /tmp/exam-assets             │ ◀── SHARED PATH
         │         │     rm -rf /tmp/exam-env                │
         │         │     rm -rf /tmp/exam                    │
         │         └─────────────────────────────────────────┘
         │
         ├──▶ redisClient.deleteCurrentExamId()              [current-exam-id] ◀── GLOBAL
         │
         └──▶ redisClient.deleteAllExamData(examId)
```

---

## 8. Session Routing Analysis

### 8.1 Current Request Flow

```
User Browser
     │
     │ HTTP/WebSocket
     ▼
┌─────────────────┐
│   nginx:80      │ (exposed as 30080)
└────────┬────────┘
         │
         ├──▶ /                    → webapp:3000
         ├──▶ /facilitator/api/*   → facilitator:3000/api/*
         ├──▶ /vnc-proxy/*         → webapp:3000/vnc-proxy/*
         └──▶ /websockify          → remote-desktop:6901/websockify  ◀── HARDCODED
```

### 8.2 WebSocket Connections

| Endpoint | Backend | Session-Aware | Multi-Session Impact |
|----------|---------|---------------|---------------------|
| `/websockify` | `remote-desktop:6901` | No | **Critical** - All users same VNC |
| `/ssh` (Socket.io) | `remote-terminal:22` | No | **Critical** - All users same SSH |

### 8.3 Session Routing Requirements

For multi-session support, need dynamic routing:

```
/session/{sessionId}/websockify  → session-{sessionId}-vnc:690X
/session/{sessionId}/ssh         → session-{sessionId}-terminal:22XX
```

---

## 9. Minimum Viable Changes for 2-Session Support

### 9.1 Critical Path (Must Change)

| # | Component | Change | Files | Effort |
|---|-----------|--------|-------|--------|
| 1 | Redis global key | Remove `CURRENT_EXAM_ID` usage | `redisClient.js`, `examService.js` | 2h |
| 2 | Exam creation lock | Remove blocking logic | `examService.js:21-33` | 1h |
| 3 | VNC restart | Make session-aware or remove | `jumphostService.js:35` | 2h |
| 4 | Container naming | Add sessionId suffix | `docker-compose.yaml` template | 4h |
| 5 | Port allocation | Dynamic port service | New `portAllocator.js` | 4h |
| 6 | Volume naming | Per-session volumes | Compose template | 2h |
| 7 | Temp directories | Per-session paths | `prepare-exam-env.sh`, `cleanup-exam-env.sh` | 2h |
| 8 | Session routing | Add session-aware proxy | `nginx/default.conf` or Node proxy | 8h |

**Total Estimated Effort**: ~25 hours (3-4 days)

### 9.2 Change Priority Order

```
Phase 1A: Remove Global Lock (Day 1)
├── 1. Delete CURRENT_EXAM_ID usage in redisClient.js
├── 2. Remove exam creation check in examService.js
└── 3. Update endExam() to not require "current" exam match

Phase 1B: Resource Isolation (Days 2-3)
├── 4. Create port allocation service
├── 5. Template docker-compose.yaml with sessionId
├── 6. Update prepare-exam-env.sh for session paths
├── 7. Update env-setup for session cluster names
└── 8. Update cleanup-exam-env.sh for session cleanup

Phase 1C: Session Routing (Day 4)
├── 9. Add session-aware VNC proxy
├── 10. Add session-aware SSH proxy
└── 11. Update nginx for session routes
```

### 9.3 Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `facilitator/src/utils/redisClient.js` | Modify | Remove `CURRENT_EXAM_ID` constant and functions |
| `facilitator/src/services/examService.js` | Modify | Remove global exam check, add sessionId handling |
| `facilitator/src/services/jumphostService.js` | Modify | Pass sessionId to scripts, conditional VNC restart |
| `jumphost/scripts/prepare-exam-env.sh` | Modify | Use `/tmp/exam-assets-{sessionId}` |
| `jumphost/scripts/cleanup-exam-env.sh` | Modify | Cleanup session-specific paths |
| `kind-cluster/scripts/env-setup` | Modify | Use sessionId for cluster name |
| `kind-cluster/scripts/env-cleanup` | Modify | Accept cluster name parameter |
| `docker-compose.yaml` | Replace | Template with session variables |
| `nginx/default.conf` | Modify | Add session-based routing |
| `app/server.js` | Modify | Session-aware WebSocket handling |
| **New**: `facilitator/src/services/portAllocator.js` | Create | Dynamic port management |
| **New**: `facilitator/src/services/sessionOrchestrator.js` | Create | Docker Compose spawning |

---

## 10. Risk Assessment

### 10.1 High-Risk Changes

| Change | Risk | Mitigation |
|--------|------|------------|
| Docker Compose templating | Container orchestration complexity | Test with 2 sessions extensively |
| Port allocation | Port leaks, exhaustion | Implement cleanup daemon, port TTL |
| K3d cluster per session | Resource exhaustion | Hard limit on concurrent sessions |
| WebSocket routing | Connection drops | Implement reconnection logic |

### 10.2 Rollback Strategy

1. Keep original `docker-compose.yaml` as `docker-compose.single.yaml`
2. Feature flag for multi-session mode
3. Maintain backward compatibility for single-session deployment

---

## 11. Test Plan for 2-Session Verification

### 11.1 Test Cases

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create exam A | Success, returns examId A |
| 2 | Create exam B while A active | Success, returns examId B (not blocked) |
| 3 | Connect to VNC for exam A | Connects to correct VNC instance |
| 4 | Connect to VNC for exam B | Connects to different VNC instance |
| 5 | Run kubectl in exam A | Shows exam A cluster resources |
| 6 | Run kubectl in exam B | Shows exam B cluster resources |
| 7 | Evaluate exam A | Returns A's results |
| 8 | Evaluate exam B | Returns B's results |
| 9 | End exam A | Cleans up A, B unaffected |
| 10 | End exam B | Cleans up B |

### 11.2 Resource Isolation Verification

```bash
# From session A terminal:
kubectl get nodes
# Should show: k3d-{sessionA}-server-0

# From session B terminal:
kubectl get nodes
# Should show: k3d-{sessionB}-server-0

# Verify different clusters
kubectl config view --minify | grep server
# Session A: https://k8s-api-server-{sessionA}:6443
# Session B: https://k8s-api-server-{sessionB}:6444
```

---

## 12. Appendix: Environment Variables

### 12.1 Current Environment Variables

| Variable | Default | Used In | Multi-Session Impact |
|----------|---------|---------|---------------------|
| `VNC_SERVICE_HOST` | `remote-desktop-service` | app/server.js | Needs session suffix |
| `VNC_SERVICE_PORT` | `6901` | app/server.js | Needs dynamic |
| `SSH_HOST` | `remote-terminal` | app/server.js | Needs session suffix |
| `SSH_PORT` | `22` | app/server.js | Needs dynamic |
| `REDIS_HOST` | `localhost` | redisClient.js | Shared (OK) |
| `REDIS_PORT` | `6379` | redisClient.js | Shared (OK) |
| `SSH_HOST` | `jumphost` | facilitator config | Needs session suffix |
| `REMOTE_DESKTOP_HOST` | `remote-desktop` | facilitator config | Needs session suffix |

### 12.2 New Environment Variables Needed

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `SESSION_ID` | Current session identifier | `abc123` |
| `VNC_PORT_RANGE_START` | Port pool start | `6901` |
| `VNC_PORT_RANGE_END` | Port pool end | `6999` |
| `SSH_PORT_RANGE_START` | Port pool start | `2201` |
| `SSH_PORT_RANGE_END` | Port pool end | `2299` |
| `K8S_PORT_RANGE_START` | Port pool start | `6443` |
| `K8S_PORT_RANGE_END` | Port pool end | `6543` |
| `MAX_CONCURRENT_SESSIONS` | Hard limit | `10` |

---

*End of Phase 0 Analysis Document*

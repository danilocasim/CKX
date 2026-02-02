#!/bin/bash
exec >> /proc/1/fd/1 2>&1

# cleanup-exam-env.sh
# 
# This script cleans up the exam environment on the jumphost.
# It removes all resources created during the exam to prepare for a new exam.
#
# Usage: cleanup-exam-env.sh [EXAM_ID]
#
# Example: cleanup-exam-env.sh abc-123-def

# Get exam ID from argument (for session-specific cleanup)
EXAM_ID=${1:-""}

# Log function with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting exam environment cleanup"
log "Cleaning up cluster $CLUSTER_NAME"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null candidate@k8s-api-server "env-cleanup $CLUSTER_NAME"

#cleanup docker env
log "Cleaning up docker environment"
docker system prune -a --volumes -fa
docker network prune -fa
docker image prune -fa

# Remove the exam environment directory
log "Removing exam environment directory"
rm -rf /tmp/exam-env
rm -rf /tmp/exam

# Remove the exam assets directory (session-specific if EXAM_ID provided)
log "Removing exam assets directory"
if [ -n "$EXAM_ID" ]; then
  rm -rf "/tmp/exam-assets-${EXAM_ID}"
else
  # Fallback: remove all exam-assets directories
  rm -rf /tmp/exam-assets*
fi

log "Exam environment cleanup completed successfully"
exit 0 
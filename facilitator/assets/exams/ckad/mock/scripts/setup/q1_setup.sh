#!/bin/bash

# Setup for Question 1: Create a deployment called nginx-deployment in namespace dev
# Uses EXAM_NAMESPACE when set (per-exam isolation) so each session has its own namespace.

NS="${EXAM_NAMESPACE:-dev}"
if [ -z "$EXAM_NAMESPACE" ]; then
  # Legacy: create dev if not using per-exam namespace
  if kubectl get namespace dev &> /dev/null; then
    kubectl delete namespace dev --ignore-not-found=true
  fi
fi

kubectl delete deployment nginx-deployment -n "$NS" --ignore-not-found=true

echo "Setup complete for Question 1: Environment ready for creating nginx deployment in namespace '$NS'"
exit 0 
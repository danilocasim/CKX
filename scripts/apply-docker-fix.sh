#!/bin/bash
# Apply Docker socket permission fix

set -e

echo "=== Applying Docker Socket Permission Fix ==="
echo ""

# Get Docker group GID
DOCKER_GID=$(getent group docker | cut -d: -f3)

if [ -z "$DOCKER_GID" ]; then
  echo "ERROR: Docker group not found!"
  exit 1
fi

echo "Docker group GID: $DOCKER_GID"
echo ""

# Stop facilitator
echo "Stopping facilitator..."
docker compose stop facilitator

# Rebuild facilitator with updated Dockerfile
echo "Rebuilding facilitator..."
docker compose build facilitator

# Update docker-compose.yaml if needed (ensure correct GID)
echo "Verifying docker-compose.yaml configuration..."
if ! grep -q "user:.*${DOCKER_GID}" docker-compose.yaml; then
  echo "Updating docker-compose.yaml with Docker GID: $DOCKER_GID"
  sed -i "s/user:.*DOCKER_GID.*/user: \"${DOCKER_GID}:1001\"/" docker-compose.yaml
fi

# Start facilitator
echo "Starting facilitator..."
docker compose up -d facilitator

# Wait for container to start
sleep 3

echo ""
echo "=== Verification ==="

# Check container user
echo "Container user/group:"
docker compose exec facilitator id 2>/dev/null || echo "Container not ready yet"

echo ""
echo "Docker socket permissions:"
docker compose exec facilitator ls -la /var/run/docker.sock 2>/dev/null || echo "Cannot check - container may need more time"

echo ""
echo "Testing Docker access..."
if docker compose exec facilitator sh -c "test -r /var/run/docker.sock" 2>/dev/null; then
  echo "✓ Docker socket is readable"
else
  echo "✗ Docker socket is NOT readable"
  echo ""
  echo "Trying alternative: Run as root temporarily..."
  # Update to run as root
  sed -i 's/user:.*995.*/user: "0:0"/' docker-compose.yaml
  docker compose restart facilitator
  sleep 2
  if docker compose exec facilitator sh -c "test -r /var/run/docker.sock" 2>/dev/null; then
    echo "✓ Docker socket accessible as root"
    echo "WARNING: Running as root - consider fixing group permissions"
  fi
fi

echo ""
echo "=== Check Logs ==="
docker compose logs facilitator --tail 10 | grep -i "docker\|runtime" || echo "No recent docker/runtime logs"

echo ""
echo "=== Complete ==="
echo ""
echo "Next steps:"
echo "1. Try creating an exam again"
echo "2. Check logs: docker compose logs facilitator --tail 50"
echo "3. If still failing, check: docker compose exec facilitator id"

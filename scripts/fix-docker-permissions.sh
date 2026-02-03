#!/bin/bash
# Fix Docker socket permissions for facilitator container

echo "=== Fixing Docker Socket Permissions ==="
echo ""

# Get Docker group GID
DOCKER_GID=$(getent group docker | cut -d: -f3)

if [ -z "$DOCKER_GID" ]; then
  echo "ERROR: Docker group not found!"
  echo "Please ensure Docker is installed and the docker group exists."
  exit 1
fi

echo "Docker group GID: $DOCKER_GID"
echo ""

# Update docker-compose.yaml with the correct GID
echo "Updating docker-compose.yaml..."
sed -i "s/user: \"\${DOCKER_GID:-[0-9]*}:1001\"/user: \"\${DOCKER_GID:-$DOCKER_GID}:1001\"/" docker-compose.yaml

echo "✓ Updated docker-compose.yaml with Docker GID: $DOCKER_GID"
echo ""

# Restart facilitator service
echo "Restarting facilitator service..."
docker compose restart facilitator

echo ""
echo "=== Verification ==="
echo "Checking Docker socket access from facilitator container..."
sleep 2

docker compose exec facilitator sh -c "ls -la /var/run/docker.sock" 2>&1 | head -1

if docker compose exec facilitator sh -c "test -r /var/run/docker.sock" 2>/dev/null; then
  echo "✓ Docker socket is readable"
else
  echo "✗ Docker socket is NOT readable"
  echo ""
  echo "Troubleshooting:"
  echo "1. Check facilitator container user:"
  echo "   docker compose exec facilitator id"
  echo ""
  echo "2. Verify docker group GID matches:"
  echo "   getent group docker"
  echo ""
  echo "3. If GID doesn't match, manually set in docker-compose.yaml:"
  echo "   user: \"$DOCKER_GID:1001\""
fi

echo ""
echo "=== Complete ==="

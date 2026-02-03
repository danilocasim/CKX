#!/bin/bash
# Diagnostic script to check if runtime setup is correct

echo "=== Checking Runtime Setup ==="
echo ""

echo "1. Checking Docker socket access..."
if docker compose exec facilitator test -r /var/run/docker.sock; then
  echo "   ✓ Docker socket is readable"
else
  echo "   ✗ Docker socket is NOT readable"
fi

echo ""
echo "2. Checking Docker client in facilitator..."
docker compose exec facilitator node -e "
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
docker.ping()
  .then(() => console.log('   ✓ Docker client can connect'))
  .catch(err => console.log('   ✗ Docker client error:', err.message));
"

echo ""
echo "3. Checking database tables..."
docker compose exec postgres psql -U ckx -d ckx -c "\dt" | grep -E "(exam_sessions|runtime_sessions|terminal_sessions)"

echo ""
echo "4. Checking facilitator logs for recent errors..."
docker compose logs facilitator --tail 20 | grep -i error

echo ""
echo "5. Checking CKX service authentication..."
echo "   CKX_URL: ${CKX_URL:-http://facilitator:3000}"
echo "   SERVICE_SECRET: ${CKX_SERVICE_SECRET:-not set}"

echo ""
echo "=== Diagnostic Complete ==="

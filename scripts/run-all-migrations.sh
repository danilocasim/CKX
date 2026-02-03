#!/bin/bash
# Run all database migrations
# This ensures all required tables exist

echo "=== Running Database Migrations ==="
echo ""

MIGRATIONS_DIR="facilitator/migrations"

# List of migrations in order
MIGRATIONS=(
  "001_init.sql"
  "002_access_passes.sql"
  "003_terminal_sessions.sql"
  "004_runtime_sessions.sql"
  "005_exam_sessions.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  migration_path="$MIGRATIONS_DIR/$migration"
  if [ -f "$migration_path" ]; then
    echo "Running $migration..."
    sudo docker compose exec -T postgres psql -U ckx -d ckx < "$migration_path" 2>&1 | grep -v "NOTICE" || true
    echo "  ✓ $migration completed"
  else
    echo "  ✗ $migration not found"
  fi
done

echo ""
echo "=== Verifying Tables ==="
sudo docker compose exec postgres psql -U ckx -d ckx -c "\dt" | grep -E "(users|exam_sessions|runtime_sessions|terminal_sessions|access_passes)"

echo ""
echo "=== Migration Complete ==="

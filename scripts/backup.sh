#!/bin/bash
# CRM Database Backup Script
# Usage: bash scripts/backup.sh
# Keeps the last 7 backups

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_DIR="$PROJECT_DIR/data"
BACKUP_DIR="$PROJECT_DIR/backups"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/crm-$TIMESTAMP.db"

# Copy all 3 SQLite files atomically
cp "$DB_DIR/crm.db" "$BACKUP_FILE"
cp "$DB_DIR/crm.db-wal" "$BACKUP_DIR/crm-$TIMESTAMP.db-wal" 2>/dev/null || true
cp "$DB_DIR/crm.db-shm" "$BACKUP_DIR/crm-$TIMESTAMP.db-shm" 2>/dev/null || true

echo "✅ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep only the last 7 backups
cd "$BACKUP_DIR"
ls -1t crm-*.db 2>/dev/null | tail -n +8 | while read -r old; do
  base="${old%.db}"
  rm -f "$old" "${base}.db-wal" "${base}.db-shm"
  echo "🗑️  Removed old backup: $old"
done

echo "📦 Current backups: $(ls -1 crm-*.db 2>/dev/null | wc -l)"

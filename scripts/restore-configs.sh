#!/bin/bash
set -e

echo "=========================================="
echo "♻️  Restore Configuration Snapshot"
echo "=========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check if timestamp argument provided
if [ -z "$1" ]; then
  echo "❌ Error: No timestamp specified"
  echo ""
  echo "Usage: $0 <timestamp>"
  echo ""
  echo "Example: $0 2024-11-19_14-30-00"
  echo ""
  echo "💡 To see available snapshots, run:"
  echo "  ./scripts/list-config-versions.sh"
  echo ""
  exit 1
fi

TIMESTAMP="$1"
BACKUP_DIR="backups/${TIMESTAMP}"

# Check if backup exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Error: Snapshot not found: ${BACKUP_DIR}"
  echo ""
  echo "💡 Available snapshots:"
  ./scripts/list-config-versions.sh
  exit 1
fi

echo "📅 Restoring snapshot: ${TIMESTAMP}"
echo "📁 Source: ${BACKUP_DIR}"
echo ""

# Confirmation prompt
read -p "⚠️  This will overwrite current configurations. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Restore cancelled"
  exit 0
fi

echo ""
echo "📋 Restoring configuration files..."
echo ""

# Counter for tracking
total_files=0
restored_files=0

# Restore agent-specific configs
AGENTS=("cz" "sbf" "trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron")
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt")

for agent in "${AGENTS[@]}"; do
  echo "📦 Restoring: ${agent}"
  
  for file in "${FILES[@]}"; do
    backup_file="${BACKUP_DIR}/agents/${agent}/${file}"
    dest_file="agents/${agent}/${file}"
    total_files=$((total_files + 1))
    
    if [ -f "$backup_file" ]; then
      cp "${backup_file}" "${dest_file}"
      echo "  ✓ ${file}"
      restored_files=$((restored_files + 1))
    else
      echo "  ⚠ ${file} not in backup, skipping"
    fi
  done
  echo ""
done

# Restore shared templates
echo "📦 Restoring shared templates"
SHARED_FILES=("operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt")

for file in "${SHARED_FILES[@]}"; do
  backup_file="${BACKUP_DIR}/shared/${file}"
  dest_file="agents/shared/${file}"
  total_files=$((total_files + 1))
  
  if [ -f "$backup_file" ]; then
    cp "${backup_file}" "${dest_file}"
    echo "  ✓ ${file}"
    restored_files=$((restored_files + 1))
  else
    echo "  ⚠ ${file} not in backup, skipping"
  fi
done
echo ""

# Restore root configuration files
echo "📦 Restoring root configurations"

# premium_services.json
if [ -f "${BACKUP_DIR}/premium_services.json" ]; then
  cp "${BACKUP_DIR}/premium_services.json" "agents/premium_services.json"
  echo "  ✓ premium_services.json"
  restored_files=$((restored_files + 1))
else
  echo "  ⚠ premium_services.json not in backup, skipping"
fi
total_files=$((total_files + 1))

# agents-session-configuration.json
if [ -f "${BACKUP_DIR}/agents-session-configuration.json" ]; then
  cp "${BACKUP_DIR}/agents-session-configuration.json" "agents-session-configuration.json"
  echo "  ✓ agents-session-configuration.json"
  restored_files=$((restored_files + 1))
else
  echo "  ⚠ agents-session-configuration.json not in backup, skipping"
fi
total_files=$((total_files + 1))

echo ""
echo "=========================================="
echo "✅ Snapshot Restored Successfully!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "  • Files restored: ${restored_files}/${total_files}"
echo "  • From snapshot: ${TIMESTAMP}"
echo ""
echo "⚠️  Next steps:"
echo "  1. Review restored configurations"
echo "  2. Restart agents if running: docker-compose restart"
echo "  3. Upload to S3: ./scripts/upload-configs.sh"
echo ""


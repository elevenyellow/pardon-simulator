#!/bin/bash
set -e

echo "=========================================="
echo "📦 Creating Local Configuration Snapshot"
echo "=========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Generate timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="backups/${TIMESTAMP}"

echo "📅 Timestamp: ${TIMESTAMP}"
echo "📁 Backup location: ${BACKUP_DIR}"
echo ""

# Create backup directory structure
mkdir -p "${BACKUP_DIR}/agents"
mkdir -p "${BACKUP_DIR}/shared"

echo "📋 Copying configuration files..."
echo ""

# List of agents
AGENTS=("cz" "sbf" "trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron")

# Files to backup per agent
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt")

# Counter for tracking
total_files=0
copied_files=0

# Copy agent-specific configs
for agent in "${AGENTS[@]}"; do
  echo "📦 Backing up: ${agent}"
  
  # Create agent directory in backup
  mkdir -p "${BACKUP_DIR}/agents/${agent}"
  
  for file in "${FILES[@]}"; do
    filepath="agents/${agent}/${file}"
    total_files=$((total_files + 1))
    
    if [ -f "$filepath" ]; then
      cp "${filepath}" "${BACKUP_DIR}/agents/${agent}/${file}"
      echo "  ✓ ${file}"
      copied_files=$((copied_files + 1))
    else
      echo "  ⚠ ${file} not found, skipping"
    fi
  done
  echo ""
done

# Copy shared templates
echo "📦 Backing up shared templates"
SHARED_FILES=("operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt")

for file in "${SHARED_FILES[@]}"; do
  filepath="agents/shared/${file}"
  total_files=$((total_files + 1))
  
  if [ -f "$filepath" ]; then
    cp "${filepath}" "${BACKUP_DIR}/shared/${file}"
    echo "  ✓ ${file}"
    copied_files=$((copied_files + 1))
  else
    echo "  ⚠ ${file} not found, skipping"
  fi
done
echo ""

# Copy root configuration files
echo "📦 Backing up root configurations"
ROOT_FILES=("agents/premium_services.json" "agents-session-configuration.json" "website/src/lib/premium-services/service-limits.json")

for filepath in "${ROOT_FILES[@]}"; do
  total_files=$((total_files + 1))
  
  if [ -f "$filepath" ]; then
    filename=$(basename "$filepath")
    cp "${filepath}" "${BACKUP_DIR}/${filename}"
    echo "  ✓ ${filename}"
    copied_files=$((copied_files + 1))
  else
    echo "  ⚠ ${filepath} not found, skipping"
  fi
done

echo ""
echo "=========================================="
echo "✅ Snapshot Created Successfully!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "  • Files backed up: ${copied_files}/${total_files}"
echo "  • Location: ${BACKUP_DIR}"
echo "  • Size: $(du -sh "${BACKUP_DIR}" | cut -f1)"
echo ""
echo "💡 To restore this snapshot:"
echo "  ./scripts/restore-configs.sh ${TIMESTAMP}"
echo ""


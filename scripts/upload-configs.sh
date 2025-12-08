#!/bin/bash
set -e

echo "=========================================="
echo "🔐 Uploading Agent Configs to AWS S3"
echo "=========================================="
echo ""

# Check for flags
SKIP_VALIDATION=false
FORCE_UPLOAD=false
for arg in "$@"; do
  if [ "$arg" == "--skip-validation" ]; then
    SKIP_VALIDATION=true
    echo "⚠️  WARNING: Validation skipped (--skip-validation flag)"
    echo ""
  fi
  if [ "$arg" == "--force" ]; then
    FORCE_UPLOAD=true
    echo "⚠️  WARNING: Force upload enabled (--force flag)"
    echo ""
  fi
done

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ AWS CLI not configured. Please run 'aws configure' first."
  exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

AGENTS=("cz" "sbf" "trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron")
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt" "tool-definitions.json")
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME=${S3_BUCKET_NAME:-pardon-simulator-configs}

# Generate timestamp for this upload session
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

echo "📍 Region: ${REGION}"
echo "🪣 S3 Bucket: ${BUCKET_NAME}"
echo "📅 Version: ${TIMESTAMP}"
echo ""

# Validate tool definitions before uploading
if [ "$SKIP_VALIDATION" = false ]; then
  echo "🔍 Validating tool definitions..."
  if command -v python3 &> /dev/null; then
    if python3 "${SCRIPT_DIR}/validate-tool-definitions.py" "${AGENTS[@]}"; then
      echo "  ✅ Validation passed"
    else
      echo ""
      echo "❌ Tool definitions validation FAILED!"
      echo "   Fix errors before uploading to S3."
      echo "   Run: python3 scripts/validate-tool-definitions.py"
      echo ""
      echo "To skip validation (not recommended):"
      echo "   ./scripts/upload-configs.sh --skip-validation"
      exit 1
    fi
  else
    echo "  ⚠️  Python3 not found - skipping validation (not recommended)"
  fi
  echo ""
fi

# Create S3 bucket if it doesn't exist
echo "🪣 Checking/creating S3 bucket..."
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
  echo "  Creating bucket ${BUCKET_NAME}..."
  if [ "$REGION" == "us-east-1" ]; then
    aws s3 mb "s3://${BUCKET_NAME}" --region ${REGION}
  else
    aws s3 mb "s3://${BUCKET_NAME}" --region ${REGION} --create-bucket-configuration LocationConstraint=${REGION}
  fi
  
  # Enable encryption
  aws s3api put-bucket-encryption \
    --bucket ${BUCKET_NAME} \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        },
        "BucketKeyEnabled": true
      }]
    }' --region ${REGION}
  
  # Block public access
  aws s3api put-public-access-block \
    --bucket ${BUCKET_NAME} \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    --region ${REGION}
  
  echo "  ✓ Bucket created and secured"
else
  echo "  ✓ Bucket already exists"
fi
echo ""

# Detect changes by comparing with most recent backup
echo "🔍 Detecting changed files..."
CHANGED_FILES=()
MOST_RECENT_BACKUP=""

# Find most recent backup directory
if [ -d "backups" ]; then
  MOST_RECENT_BACKUP=$(ls -1t backups/ | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$" | head -1)
fi

if [ -n "$MOST_RECENT_BACKUP" ] && [ -d "backups/${MOST_RECENT_BACKUP}" ]; then
  echo "  Comparing with previous backup: ${MOST_RECENT_BACKUP}"
  
  # Compare agent configs
  for agent in "${AGENTS[@]}"; do
    for file in "${FILES[@]}"; do
      filepath="agents/${agent}/${file}"
      backup_filepath="backups/${MOST_RECENT_BACKUP}/agents/${agent}/${file}"
      
      if [ -f "$filepath" ]; then
        if [ ! -f "$backup_filepath" ]; then
          CHANGED_FILES+=("agents/${agent}/${file} (new)")
        elif ! diff -q "$filepath" "$backup_filepath" > /dev/null 2>&1; then
          CHANGED_FILES+=("agents/${agent}/${file}")
        fi
      fi
    done
  done
  
  # Compare shared files
  for file in "operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt"; do
    filepath="agents/shared/${file}"
    backup_filepath="backups/${MOST_RECENT_BACKUP}/shared/${file}"
    
    if [ -f "$filepath" ]; then
      if [ ! -f "$backup_filepath" ]; then
        CHANGED_FILES+=("agents/shared/${file} (new)")
      elif ! diff -q "$filepath" "$backup_filepath" > /dev/null 2>&1; then
        CHANGED_FILES+=("agents/shared/${file}")
      fi
    fi
  done
  
  # Compare premium_services.json
  if [ -f "agents/premium_services.json" ]; then
    if [ ! -f "backups/${MOST_RECENT_BACKUP}/premium_services.json" ]; then
      CHANGED_FILES+=("agents/premium_services.json (new)")
    elif ! diff -q "agents/premium_services.json" "backups/${MOST_RECENT_BACKUP}/premium_services.json" > /dev/null 2>&1; then
      CHANGED_FILES+=("agents/premium_services.json")
    fi
  fi
  
  # Compare service-limits.json
  if [ -f "website/src/lib/premium-services/service-limits.json" ]; then
    if [ -f "backups/${MOST_RECENT_BACKUP}/service-limits.json" ]; then
      if ! diff -q "website/src/lib/premium-services/service-limits.json" "backups/${MOST_RECENT_BACKUP}/service-limits.json" > /dev/null 2>&1; then
        CHANGED_FILES+=("website/src/lib/premium-services/service-limits.json")
      fi
    else
      CHANGED_FILES+=("website/src/lib/premium-services/service-limits.json (new)")
    fi
  fi
  
  if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
    echo "  ✓ No changes detected (all files identical to ${MOST_RECENT_BACKUP})"
    
    if [ "$FORCE_UPLOAD" = false ]; then
      echo ""
      echo "=========================================="
      echo "✅ No upload needed - configs unchanged"
      echo "=========================================="
      echo ""
      echo "📊 Summary:"
      echo "  • No changes since: ${MOST_RECENT_BACKUP}"
      echo "  • Last backup: backups/${MOST_RECENT_BACKUP}/"
      echo "  • S3 current: s3://${BUCKET_NAME}/current/ (unchanged)"
      echo ""
      echo "💡 Tip: Make changes to config files, then run this script again."
      echo "   Or use --force flag to upload anyway."
      echo ""
      exit 0
    else
      echo "  ⚠️  Force upload enabled - proceeding despite no changes"
    fi
  else
    echo "  ✓ ${#CHANGED_FILES[@]} file(s) changed:"
    for file in "${CHANGED_FILES[@]}"; do
      echo "     - ${file}"
    done
    echo ""
    echo "📋 Showing changes (additions in green, deletions in red):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Show diff for each changed file
    for file in "${CHANGED_FILES[@]}"; do
      # Remove " (new)" suffix if present
      clean_file="${file% (new)}"
      current_file="${clean_file}"
      
      # Construct backup file path based on file type
      # Check specific files first before general patterns
      if [[ "$clean_file" == "agents/premium_services.json" ]]; then
        # Root premium services: agents/premium_services.json -> backups/TIMESTAMP/premium_services.json
        backup_file="backups/${MOST_RECENT_BACKUP}/premium_services.json"
      elif [[ "$clean_file" == agents/shared/* ]]; then
        # Shared files: agents/shared/FILE -> backups/TIMESTAMP/shared/FILE
        backup_file="backups/${MOST_RECENT_BACKUP}/shared/${clean_file#agents/shared/}"
      elif [[ "$clean_file" == agents/* ]]; then
        # Agent files: agents/AGENT/FILE -> backups/TIMESTAMP/agents/AGENT/FILE
        backup_file="backups/${MOST_RECENT_BACKUP}/${clean_file}"
      elif [[ "$clean_file" == website/src/lib/premium-services/service-limits.json ]]; then
        # Service limits: website/.../ -> backups/TIMESTAMP/service-limits.json
        backup_file="backups/${MOST_RECENT_BACKUP}/service-limits.json"
      else
        # Other root files
        backup_file="backups/${MOST_RECENT_BACKUP}/${clean_file##*/}"
      fi
      
      if [[ "$file" == *"(new)"* ]]; then
        echo "📄 ${clean_file} (NEW FILE)"
        echo "   All content is new (shown in green):"
        echo ""
        # Show new file content in green
        if [ -f "$current_file" ]; then
          awk '{print "\033[32m+ " $0 "\033[0m"}' "$current_file" | head -20
          line_count=$(wc -l < "$current_file" 2>/dev/null || echo 0)
          if [ "$line_count" -gt 20 ]; then
            echo "\033[32m   ... (${line_count} total lines, showing first 20)\033[0m"
          fi
        fi
      else
        echo "📄 ${clean_file}"
        echo ""
        # Use git diff for nice colored output if available, otherwise use diff with color
        if command -v git &> /dev/null && [ -f "$backup_file" ] && [ -f "$current_file" ]; then
          git diff --no-index --color=always "$backup_file" "$current_file" 2>/dev/null | tail -n +5 || \
            diff -u --color=always "$backup_file" "$current_file" 2>/dev/null | tail -n +3
        elif [ -f "$backup_file" ] && [ -f "$current_file" ]; then
          # Fallback to basic diff with manual coloring
          diff -u "$backup_file" "$current_file" | tail -n +3 | while IFS= read -r line; do
            if [[ "$line" == +* ]] && [[ "$line" != +++* ]]; then
              echo -e "\033[32m${line}\033[0m"  # Green for additions
            elif [[ "$line" == -* ]] && [[ "$line" != ---* ]]; then
              echo -e "\033[31m${line}\033[0m"  # Red for deletions
            else
              echo "$line"
            fi
          done
        else
          echo "  ⚠️  Could not find backup file: ${backup_file}"
        fi
      fi
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
    done
  fi
else
  echo "  ⚠ No previous backup found - first upload or backups directory empty"
  echo "  Proceeding with upload..."
fi
echo ""

# Create local backup snapshot before uploading
echo "📦 Creating local backup snapshot..."
BACKUP_DIR="backups/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}/agents"
mkdir -p "${BACKUP_DIR}/shared"

# Copy agent configs to backup
for agent in "${AGENTS[@]}"; do
  mkdir -p "${BACKUP_DIR}/agents/${agent}"
  for file in "${FILES[@]}"; do
    filepath="agents/${agent}/${file}"
    if [ -f "$filepath" ]; then
      cp "${filepath}" "${BACKUP_DIR}/agents/${agent}/${file}"
    fi
  done
done

# Copy shared templates to backup
SHARED_FILES=("operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt")
for file in "${SHARED_FILES[@]}"; do
  filepath="agents/shared/${file}"
  if [ -f "$filepath" ]; then
    cp "${filepath}" "${BACKUP_DIR}/shared/${file}"
  fi
done

# Copy root configs to backup
if [ -f "agents/premium_services.json" ]; then
  cp "agents/premium_services.json" "${BACKUP_DIR}/premium_services.json"
fi
if [ -f "agents-session-configuration.json" ]; then
  cp "agents-session-configuration.json" "${BACKUP_DIR}/agents-session-configuration.json"
fi
if [ -f "website/src/lib/premium-services/service-limits.json" ]; then
  cp "website/src/lib/premium-services/service-limits.json" "${BACKUP_DIR}/service-limits.json"
fi

echo "  ✓ Local backup created: ${BACKUP_DIR}"
echo ""

# Update changelog file for git-based deployment triggering
echo "📝 Updating agents changelog..."
CHANGELOG_FILE="${PROJECT_ROOT}/agents/CHANGELOG.md"
if [ -f "$CHANGELOG_FILE" ]; then
  # Append timestamp entry to changelog
  echo "" >> "$CHANGELOG_FILE"
  echo "### $(date '+%Y-%m-%d %H:%M:%S')" >> "$CHANGELOG_FILE"
  echo "- Configurations uploaded to S3" >> "$CHANGELOG_FILE"
  echo "- Backup: \`backups/${TIMESTAMP}/\`" >> "$CHANGELOG_FILE"
  
  # Add changed files list if any
  if [ ${#CHANGED_FILES[@]} -gt 0 ]; then
    echo "- Changed files (${#CHANGED_FILES[@]}):" >> "$CHANGELOG_FILE"
    for file in "${CHANGED_FILES[@]}"; do
      echo "  - \`${file}\`" >> "$CHANGELOG_FILE"
    done
  else
    if [ -n "$MOST_RECENT_BACKUP" ]; then
      echo "- No changes detected (identical to backup ${MOST_RECENT_BACKUP})" >> "$CHANGELOG_FILE"
    else
      echo "- First upload or no previous backup to compare" >> "$CHANGELOG_FILE"
    fi
  fi
  
  echo "  ✓ Changelog updated"
else
  echo "  ⚠ Changelog not found, skipping"
fi
echo ""

# Upload agent-specific configs
for agent in "${AGENTS[@]}"; do
  echo "📦 Uploading configs for: ${agent}"
  
  for file in "${FILES[@]}"; do
    filepath="agents/${agent}/${file}"
    
    if [ -f "$filepath" ]; then
      echo -n "  Uploading ${file}... "
      
      # Upload to current/ (active config)
      if output=$(aws s3 cp "${filepath}" \
        "s3://${BUCKET_NAME}/current/agents/${agent}/${file}" \
        --region "${REGION}" \
        --sse AES256 2>&1); then
        
        # Also upload to versions/TIMESTAMP/ (snapshot)
        aws s3 cp "${filepath}" \
          "s3://${BUCKET_NAME}/versions/${TIMESTAMP}/agents/${agent}/${file}" \
          --region "${REGION}" \
          --sse AES256 &>/dev/null
        
        echo "✓"
      else
        echo "❌"
        echo "  Error: ${output}"
        exit 1
      fi
    else
      echo "  ⚠ ${filepath} not found, skipping"
    fi
  done
  echo ""
done

# Upload shared premium services config
echo "📦 Uploading shared configs"
if [ -f "agents/premium_services.json" ]; then
  echo -n "  Uploading premium_services.json... "
  if output=$(aws s3 cp "agents/premium_services.json" \
    "s3://${BUCKET_NAME}/current/premium_services.json" \
    --region "${REGION}" \
    --sse AES256 2>&1); then
    
    # Also upload to versions/TIMESTAMP/
    aws s3 cp "agents/premium_services.json" \
      "s3://${BUCKET_NAME}/versions/${TIMESTAMP}/premium_services.json" \
      --region "${REGION}" \
      --sse AES256 &>/dev/null
    
    echo "✓"
  else
    echo "❌"
    echo "  Error: ${output}"
    exit 1
  fi
else
  echo "  ⚠ agents/premium_services.json not found, skipping"
fi

if [ -f "website/src/lib/premium-services/service-limits.json" ]; then
  echo -n "  Uploading service-limits.json... "
  if output=$(aws s3 cp "website/src/lib/premium-services/service-limits.json" \
    "s3://${BUCKET_NAME}/current/service-limits.json" \
    --region "${REGION}" \
    --sse AES256 2>&1); then
    
    # Also upload to versions/TIMESTAMP/
    aws s3 cp "website/src/lib/premium-services/service-limits.json" \
      "s3://${BUCKET_NAME}/versions/${TIMESTAMP}/service-limits.json" \
      --region "${REGION}" \
      --sse AES256 &>/dev/null
    
    echo "✓"
  else
    echo "❌"
    echo "  Error: ${output}"
    exit 1
  fi
else
  echo "  ⚠ website/src/lib/premium-services/service-limits.json not found, skipping"
fi
echo ""

# Upload shared templates (required by all agents at startup)
echo "📦 Uploading shared templates"
SHARED_FILES=("operational-template.txt" "personality-template.txt" "scoring-mandate.txt" "agent-comms-note.txt")

for file in "${SHARED_FILES[@]}"; do
  filepath="agents/shared/${file}"
  
  if [ -f "$filepath" ]; then
    echo -n "  Uploading ${file}... "
    if output=$(aws s3 cp "${filepath}" \
      "s3://${BUCKET_NAME}/current/shared/${file}" \
      --region "${REGION}" \
      --sse AES256 2>&1); then
      
      # Also upload to versions/TIMESTAMP/
      aws s3 cp "${filepath}" \
        "s3://${BUCKET_NAME}/versions/${TIMESTAMP}/shared/${file}" \
        --region "${REGION}" \
        --sse AES256 &>/dev/null
      
      echo "✓"
    else
      echo "❌"
      echo "  Error: ${output}"
      exit 1
    fi
  else
    echo "  ⚠ ${filepath} not found, skipping"
  fi
done

echo ""
echo "=========================================="
echo "✅ All configs uploaded successfully!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "  • Timestamp: ${TIMESTAMP}"
echo "  • Local backup: ${BACKUP_DIR}"
echo "  • S3 current: s3://${BUCKET_NAME}/current/"
echo "  • S3 snapshot: s3://${BUCKET_NAME}/versions/${TIMESTAMP}/"
echo "  • Changelog: agents/CHANGELOG.md updated"
if [ ${#CHANGED_FILES[@]} -gt 0 ]; then
  echo "  • Changed files: ${#CHANGED_FILES[@]}"
else
  if [ -n "$MOST_RECENT_BACKUP" ]; then
    echo "  • Changed files: 0 (identical to ${MOST_RECENT_BACKUP})"
  else
    echo "  • Changed files: N/A (first upload)"
  fi
fi
echo ""
echo "Next steps:"
echo "  1. Commit changelog: git add agents/CHANGELOG.md && git commit -m 'Update agent configs ${TIMESTAMP}'"
echo "  2. Deploy to ECS: git push origin main (triggers GitHub Actions)"
echo "  3. Or test locally: docker-compose restart"
echo ""
echo "💡 Version management:"
echo "  • List versions: ./scripts/list-config-versions.sh"
echo "  • Restore local: ./scripts/restore-configs.sh ${TIMESTAMP}"
echo ""
echo "💡 Upload options:"
echo "  • Skip validation: ./scripts/upload-configs.sh --skip-validation"
echo "  • Force upload (no change detection): ./scripts/upload-configs.sh --force"
echo ""


#!/bin/bash
set -e

echo "=========================================="
echo "🔐 Uploading Agent Configs to AWS S3"
echo "=========================================="
echo ""

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
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt")
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME=${S3_BUCKET_NAME:-pardon-simulator-configs}

# Generate timestamp for this upload session
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

echo "📍 Region: ${REGION}"
echo "🪣 S3 Bucket: ${BUCKET_NAME}"
echo "📅 Version: ${TIMESTAMP}"
echo ""

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


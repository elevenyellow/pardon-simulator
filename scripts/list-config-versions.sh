#!/bin/bash

echo "=========================================="
echo "📚 Configuration Version History"
echo "=========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# S3 configuration
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME=${S3_BUCKET_NAME:-pardon-simulator-configs}

# Check for local backups
echo "📁 Local Snapshots:"
echo ""

if [ -d "backups" ] && [ "$(ls -A backups 2>/dev/null)" ]; then
  # List directories in backups folder, sorted by name (which is timestamp)
  local_count=0
  
  for dir in backups/*/; do
    if [ -d "$dir" ]; then
      timestamp=$(basename "$dir")
      size=$(du -sh "$dir" 2>/dev/null | cut -f1)
      file_count=$(find "$dir" -type f | wc -l | tr -d ' ')
      
      # Parse timestamp for human-readable date
      if [[ $timestamp =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})_([0-9]{2}-[0-9]{2}-[0-9]{2})$ ]]; then
        date_part="${BASH_REMATCH[1]}"
        time_part="${BASH_REMATCH[2]}"
        time_formatted=$(echo "$time_part" | tr '-' ':')
        echo "  📦 $timestamp"
        echo "     Date: $date_part at $time_formatted"
        echo "     Size: $size ($file_count files)"
        echo ""
        local_count=$((local_count + 1))
      fi
    fi
  done
  
  if [ $local_count -eq 0 ]; then
    echo "  (No valid snapshots found)"
    echo ""
  else
    echo "  Total: $local_count snapshot(s)"
    echo ""
  fi
else
  echo "  (No local snapshots found)"
  echo ""
  echo "  💡 Create a snapshot with:"
  echo "     ./scripts/backup-configs.sh"
  echo ""
fi

# Check for S3 backups
echo "☁️  S3 Snapshots:"
echo ""

# Check if AWS CLI is available and configured
if ! command -v aws &> /dev/null; then
  echo "  ⚠️  AWS CLI not installed"
  echo ""
elif ! aws sts get-caller-identity &>/dev/null; then
  echo "  ⚠️  AWS CLI not configured"
  echo ""
else
  # Check if bucket exists
  if aws s3 ls "s3://${BUCKET_NAME}" &>/dev/null; then
    # List versions in S3
    s3_versions=$(aws s3 ls "s3://${BUCKET_NAME}/versions/" --region "${REGION}" 2>/dev/null | grep "PRE" | awk '{print $2}' | sed 's#/##' | sort -r || echo "")
    
    if [ -z "$s3_versions" ]; then
      echo "  (No S3 snapshots found)"
      echo ""
      echo "  💡 Upload configs to create first S3 snapshot:"
      echo "     ./scripts/upload-configs.sh"
      echo ""
    else
      s3_count=0
      while IFS= read -r timestamp; do
        if [ -n "$timestamp" ]; then
          # Parse timestamp for human-readable date
          if [[ $timestamp =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})_([0-9]{2}-[0-9]{2}-[0-9]{2})$ ]]; then
            date_part="${BASH_REMATCH[1]}"
            time_part="${BASH_REMATCH[2]}"
            time_formatted=$(echo "$time_part" | tr '-' ':')
            echo "  ☁️  $timestamp"
            echo "     Date: $date_part at $time_formatted"
            echo "     Location: s3://${BUCKET_NAME}/versions/${timestamp}/"
            echo ""
            s3_count=$((s3_count + 1))
          fi
        fi
      done <<< "$s3_versions"
      
      echo "  Total: $s3_count snapshot(s)"
      echo ""
    fi
  else
    echo "  ⚠️  S3 bucket not found: ${BUCKET_NAME}"
    echo ""
  fi
fi

echo "=========================================="
echo "💡 Usage:"
echo "=========================================="
echo ""
echo "Create snapshot:"
echo "  ./scripts/backup-configs.sh"
echo ""
echo "Restore local snapshot:"
echo "  ./scripts/restore-configs.sh <timestamp>"
echo ""
echo "Upload to S3 (creates S3 snapshot):"
echo "  ./scripts/upload-configs.sh"
echo ""
echo "Restore from S3 snapshot:"
echo "  aws s3 sync s3://${BUCKET_NAME}/versions/<timestamp>/ . --region ${REGION}"
echo ""


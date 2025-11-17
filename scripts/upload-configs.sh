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

AGENTS=("cz" "sbf" "trump-donald" "trump-melania" "trump-eric" "trump-donjr" "trump-barron")
FILES=("operational-private.txt" "personality-public.txt" "scoring-config.txt" "tool-descriptions.txt")
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME=${S3_BUCKET_NAME:-pardon-simulator-configs}

echo "📍 Region: ${REGION}"
echo "🪣 S3 Bucket: ${BUCKET_NAME}"
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

# Upload agent-specific configs
for agent in "${AGENTS[@]}"; do
  echo "📦 Uploading configs for: ${agent}"
  
  for file in "${FILES[@]}"; do
    filepath="agents/${agent}/${file}"
    
    if [ -f "$filepath" ]; then
      echo -n "  Uploading ${file}... "
      if output=$(aws s3 cp "${filepath}" \
        "s3://${BUCKET_NAME}/agents/${agent}/${file}" \
        --region "${REGION}" \
        --sse AES256 2>&1); then
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
    "s3://${BUCKET_NAME}/premium_services.json" \
    --region "${REGION}" \
    --sse AES256 2>&1); then
    echo "✓"
  else
    echo "❌"
    echo "  Error: ${output}"
    exit 1
  fi
else
  echo "  ⚠ agents/premium_services.json not found, skipping"
fi

echo ""
echo "=========================================="
echo "✅ All configs uploaded successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Deploy to EC2: ./scripts/deploy-to-aws.sh"
echo "  2. Or restart agents: docker-compose restart"


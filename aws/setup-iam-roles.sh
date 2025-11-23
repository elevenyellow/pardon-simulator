#!/bin/bash
set -e

echo "=========================================="
echo "🔐 Setup IAM Roles for Elastic Beanstalk"
echo "=========================================="
echo ""

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📍 AWS Account ID: ${AWS_ACCOUNT_ID}"
echo ""

# 1. Create EC2 Instance Role
echo "1️⃣  Creating EC2 Instance Role..."

# Create trust policy for EC2
cat > /tmp/ec2-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name aws-elasticbeanstalk-ec2-role \
  --assume-role-policy-document file:///tmp/ec2-trust-policy.json \
  --description "EC2 instance role for Elastic Beanstalk" || echo "  Role already exists"

# Attach managed policies
aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier || true

aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier || true

# Attach custom S3 policy
aws iam put-role-policy \
  --role-name aws-elasticbeanstalk-ec2-role \
  --policy-name PardonS3ConfigAccess \
  --policy-document file://aws/iam-policies/eb-ec2-role-policy.json

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name aws-elasticbeanstalk-ec2-role || echo "  Instance profile already exists"

aws iam add-role-to-instance-profile \
  --instance-profile-name aws-elasticbeanstalk-ec2-role \
  --role-name aws-elasticbeanstalk-ec2-role || true

echo "  ✓ EC2 role created"
echo ""

# 2. Create Service Role
echo "2️⃣  Creating Elastic Beanstalk Service Role..."

# Create trust policy for EB service
cat > /tmp/eb-service-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "elasticbeanstalk.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "elasticbeanstalk"
        }
      }
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name aws-elasticbeanstalk-service-role \
  --assume-role-policy-document file:///tmp/eb-service-trust-policy.json \
  --description "Service role for Elastic Beanstalk" || echo "  Role already exists"

# Attach managed policies
aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-service-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth || true

aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-service-role \
  --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy || true

echo "  ✓ Service role created"
echo ""

# 3. Create Deploy User (for GitHub Actions)
echo "3️⃣  Creating Deploy User (for CI/CD)..."

aws iam create-user \
  --user-name pardon-deploy-user \
  --tags Key=Purpose,Value=GitHubActions || echo "  User already exists"

# Attach deploy policy
aws iam put-user-policy \
  --user-name pardon-deploy-user \
  --policy-name PardonDeployPolicy \
  --policy-document file://aws/iam-policies/deploy-user-policy.json

echo "  ✓ Deploy user created"
echo ""

# Create access key
echo "4️⃣  Creating Access Key..."
ACCESS_KEY=$(aws iam create-access-key --user-name pardon-deploy-user --output json 2>/dev/null || echo "{}")

if [ "$ACCESS_KEY" != "{}" ]; then
  echo ""
  echo "=========================================="
  echo "✅ IAM Setup Complete!"
  echo "=========================================="
  echo ""
  echo "📋 Save these credentials (they won't be shown again):"
  echo ""
  echo "AWS_ACCESS_KEY_ID=$(echo $ACCESS_KEY | jq -r .AccessKey.AccessKeyId)"
  echo "AWS_SECRET_ACCESS_KEY=$(echo $ACCESS_KEY | jq -r .AccessKey.SecretAccessKey)"
  echo ""
  echo "Add these to GitHub Secrets:"
  echo "  - AWS_ACCESS_KEY_ID"
  echo "  - AWS_SECRET_ACCESS_KEY"
  echo "  - AWS_REGION (e.g., us-east-1)"
  echo "  - S3_BUCKET_NAME (e.g., pardon-simulator-configs)"
else
  echo "  ⚠️  Access key already exists or couldn't be created"
  echo "     You can create one manually in AWS Console"
fi

echo ""
echo "Next steps:"
echo "  1. Review roles in AWS Console"
echo "  2. Add credentials to GitHub Secrets"
echo "  3. Initialize Elastic Beanstalk: ./scripts/eb-init.sh"

# Cleanup
rm -f /tmp/ec2-trust-policy.json /tmp/eb-service-trust-policy.json





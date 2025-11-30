#!/usr/bin/env node

/**
 * Fetch configuration files from S3 before build
 * This runs during Vercel build to fetch private config files
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'pardon-simulator-configs';
const REGION = process.env.AWS_REGION || 'us-east-1';

const CONFIG_FILES = [
  {
    s3Key: 'current/service-limits.json',
    localPath: 'src/lib/premium-services/service-limits.json',
    fallbackPath: 'src/lib/premium-services/service-limits.json.example',
    required: false,
  },
  // Premium services pricing - required for payment validation
  {
    s3Key: 'current/premium_services.json',
    localPath: 'src/lib/premium-services/premium-services.json',
    fallbackPath: 'src/lib/premium-services/premium-services.json.example',
    required: true,
  }
];

async function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function fetchConfig(s3Client, config) {
  const { s3Key, localPath, fallbackPath, required } = config;
  const fullLocalPath = path.join(__dirname, '..', localPath);
  
  console.log(`📥 Fetching ${s3Key}...`);
  
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    
    const response = await s3Client.send(command);
    const content = await streamToString(response.Body);
    
    // Ensure directory exists
    const dir = path.dirname(fullLocalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullLocalPath, content);
    console.log(`  ✓ Downloaded to ${localPath}`);
    return true;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      console.log(`  ⚠ File not found in S3: ${s3Key}`);
    } else {
      console.error(`  ❌ Error fetching ${s3Key}:`, error.message);
    }
    
    // Try to use fallback
    if (fallbackPath) {
      const fullFallbackPath = path.join(__dirname, '..', fallbackPath);
      if (fs.existsSync(fullFallbackPath)) {
        console.log(`  📋 Using fallback: ${fallbackPath}`);
        fs.copyFileSync(fullFallbackPath, fullLocalPath);
        return true;
      }
    }
    
    if (required) {
      throw new Error(`Required config file ${s3Key} not found and no fallback available`);
    }
    
    return false;
  }
}

async function main() {
  console.log('🔧 Fetching configuration files from S3...');
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Region: ${REGION}`);
  console.log('');
  
  // Check if AWS credentials are available
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('⚠️  AWS credentials not found in environment');
    console.log('   Using fallback configurations for local development');
    console.log('');
    
    // Copy fallback files
    for (const config of CONFIG_FILES) {
      if (config.fallbackPath) {
        const fullLocalPath = path.join(__dirname, '..', config.localPath);
        const fullFallbackPath = path.join(__dirname, '..', config.fallbackPath);
        
        if (fs.existsSync(fullFallbackPath)) {
          fs.copyFileSync(fullFallbackPath, fullLocalPath);
          console.log(`  ✓ Using fallback for ${config.localPath}`);
        }
      }
    }
    
    console.log('');
    console.log('✅ Fallback configurations copied');
    return;
  }
  
  try {
    const s3Client = new S3Client({ region: REGION });
    
    for (const config of CONFIG_FILES) {
      await fetchConfig(s3Client, config);
    }
    
    console.log('');
    console.log('✅ Configuration files fetched successfully');
  } catch (error) {
    console.error('');
    console.error('❌ Failed to fetch configurations:', error.message);
    process.exit(1);
  }
}

main();




# Website Deployment Guide

## Environment Variables Required

### Vercel Environment Variables

Add these to your Vercel project settings (Settings → Environment Variables):

#### AWS S3 Configuration (for fetching private configs)
```
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
AWS_REGION=us-east-1
S3_BUCKET_NAME=pardon-simulator-configs
```

#### Database
```
DATABASE_URL=<your-postgresql-connection-string>
```

#### Solana
```
SOLANA_RPC_URL=<your-solana-rpc-url>
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_PAYMENT_WALLET=<payment-receiving-wallet-address>
```

#### Application
```
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_BACKEND_URL=https://your-domain.com
CORAL_SERVER_URL=<your-coral-server-url>
```

## Build Process

The build process follows these steps:

1. **Install dependencies**: `npm install`
2. **Fetch configs from S3**: `npm run prebuild` (runs `scripts/fetch-configs.js`)
   - Downloads `service-limits.json` from S3
   - Falls back to `.example` files if S3 credentials are missing (for local dev)
3. **Database migrations**: `postinstall` hook runs `prisma generate && prisma migrate deploy`
4. **Build application**: `npm run build`

## Private Configuration Files

These files are kept out of git (to prevent cheating) and fetched from S3 during build:

- `website/src/lib/premium-services/service-limits.json`
  - **S3 Path**: `s3://pardon-simulator-configs/current/service-limits.json`
  - **Purpose**: Service usage limitations and cooldown rules
  - **Fallback**: `service-limits.json.example`

## Uploading Configs to S3

Before deploying, ensure configs are uploaded to S3:

```bash
# From project root
./scripts/upload-configs.sh
```

This uploads:
- All agent configurations
- Premium services configuration
- **Service limits configuration** ← Important for the website build
- Shared templates

## Local Development

For local development without S3 access:

1. Copy the example file:
   ```bash
   cp website/src/lib/premium-services/service-limits.json.example \
      website/src/lib/premium-services/service-limits.json
   ```

2. The build will use the local copy

## Troubleshooting

### Build fails with "Module not found: Can't resolve './service-limits.json'"

**Cause**: S3 credentials not configured and no local copy exists.

**Solution**:
1. Add AWS credentials to Vercel environment variables
2. Or copy the `.example` file as shown above

### "⚠️ AWS credentials not found in environment"

This is normal for local development. The build will use fallback configurations.

### Service limits not working in production

**Check**:
1. Verify `service-limits.json` was uploaded to S3: `aws s3 ls s3://pardon-simulator-configs/current/`
2. Check Vercel build logs for "✓ Downloaded to src/lib/premium-services/service-limits.json"
3. Verify AWS credentials in Vercel have S3 read permissions

## Security Notes

- `service-limits.json` is intentionally excluded from git (`.gitignore` line 204)
- This prevents players from seeing game mechanics and cooldown rules
- The file is encrypted at rest in S3 (AES256)
- Vercel build environment has read-only access to S3 configs




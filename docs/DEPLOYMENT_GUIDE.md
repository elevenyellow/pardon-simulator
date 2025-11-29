# Production Deployment Guide

Complete guide for deploying Pardon Simulator to production.

---

## Prerequisites Checklist

Before starting deployment:

- [ ] PostgreSQL database set up (Railway/Neon/Supabase)
- [ ] All code tested locally
- [ ] Agent wallets funded with SOL
- [ ] Helius API key obtained
- [ ] Domain name (optional)

---

## Phase 4.2: Production Deployment

### Step 1: Deploy Database (Railway)

**Time**: 10 minutes

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init pardon-game

# Add PostgreSQL
railway add postgresql

# Get DATABASE_URL
railway variables
# Copy the DATABASE_URL value
```

**Alternative: Neon**

1. Go to https://neon.tech
2. Create new project "pardon-game"
3. Copy connection string

**Alternative: Supabase**

1. Go to https://supabase.com
2. Create project "pardon-game"
3. Get direct connection string from Settings → Database

### Step 2: Deploy Frontend (Vercel)

**Time**: 20 minutes

**Production:**
- Auto-deploys from `main` branch via GitHub integration
- Manual deployment not typically needed

**Manual Deployment:**
```bash
cd website

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Configure Environment Variables** (Vercel Dashboard):

**Critical: Generate White House Treasury Wallet First!**

Before deploying, create a dedicated secure treasury wallet:

```bash
# Generate secure keypair
solana-keygen new --outfile white-house-treasury.json

# Extract public address
solana-keygen pubkey white-house-treasury.json
# Output: <WHITE_HOUSE_ADDRESS> - Copy this!

# IMPORTANT: Secure the private key!
# - Store in hardware wallet (Ledger/Trezor) for production
# - OR use multi-sig (Squads Protocol)
# - Keep offline except for prize distribution
# - All user payments forward here automatically
```

Go to Project → Settings → Environment Variables:

```
DATABASE_URL=postgresql://<YOUR_DATABASE_URL>
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>
PARDON_TOKEN_MINT=<YOUR_TOKEN_MINT_ADDRESS>
CRON_SECRET=<GENERATE_RANDOM_STRING>
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>

# Treasury & Agent Wallets (CRITICAL!)
WALLET_WHITE_HOUSE=<WHITE_HOUSE_TREASURY_ADDRESS>
WALLET_DONALD_TRUMP=<DONALD_AGENT_WALLET_ADDRESS>
WALLET_MELANIA_TRUMP=<MELANIA_AGENT_WALLET_ADDRESS>
WALLET_ERIC_TRUMP=<ERIC_AGENT_WALLET_ADDRESS>
WALLET_DONJR_TRUMP=<DONJR_AGENT_WALLET_ADDRESS>
WALLET_BARRON_TRUMP=<BARRON_AGENT_WALLET_ADDRESS>
WALLET_CZ=<CZ_AGENT_WALLET_ADDRESS>
```

**Run Database Migration**:

```bash
# Set DATABASE_URL locally to production URL
export DATABASE_URL="postgresql://..."

# Run migration
npx prisma migrate deploy

# Verify
npx prisma studio
```

### Step 3: Deploy to AWS ECS (Production Method)

**Current Production Setup:**
- AWS ECS Fargate in us-east-1
- Single task running Coral Server + all 6 agents
- Simplified single-session architecture
- Auto-deployment via GitHub Actions

**Architecture:**
```
ECS Task (pardon-production-service)
├── Coral Server (localhost:5555)
└── 6 Agent Processes
    ├── trump-donald
    ├── trump-melania
    ├── trump-eric
    ├── trump-donjr
    ├── trump-barron
    └── cz
```

**Deployment:**
```bash
# Automatic: Push to main branch
git push origin main

# Manual: Force new deployment
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --force-new-deployment
```

See [ECS_DEPLOYMENT.md](./ECS_DEPLOYMENT.md) for detailed ECS setup.

### Alternative: Deploy Coral Server (VPS)

**For Development/Testing:**

**Create VPS**:
- OS: Ubuntu 22.04 LTS
- Size: 2GB RAM minimum
- Open ports: 5555 (Coral), 22 (SSH)

**Setup Script**:

```bash
# SSH into server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Java 17
apt install -y openjdk-17-jdk

# Install Git
apt install -y git

# Clone repository
git clone https://github.com/your-repo/pardon-simulator.git
cd pardon-simulator/coral-server

# Build
./gradlew build

# Create systemd service
cat > /etc/systemd/system/coral-server.service << EOF
[Unit]
Description=Coral Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pardon-simulator/coral-server
ExecStart=/usr/bin/java -jar build/libs/coral-server.jar
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl enable coral-server
systemctl start coral-server

# Check status
systemctl status coral-server
```

**Configure Nginx** (optional, for HTTPS):

```bash
apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
cat > /etc/nginx/sites-available/coral << EOF
server {
    listen 80;
    server_name coral.yourdomain.com;

    location / {
        proxy_pass http://localhost:5555;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/coral /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Get SSL certificate
certbot --nginx -d coral.yourdomain.com
```

### Step 4: Deploy Agents (Same VPS or separate)

**Time**: 30 minutes per agent

For each agent (donald-trump, cz, melania, etc.):

```bash
cd /root/pardon-simulator/agents/trump-donald

# Create .env file
cat > .env << EOF
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<YOUR_HELIUS_API_KEY>
SOLANA_PRIVATE_KEY=<AGENT_PRIVATE_KEY_BASE58>
MODEL_API_KEY=<YOUR_OPENAI_API_KEY>
MODEL_NAME=gpt-5.1
CORAL_SSE_URL=http://localhost:5555/sse
CORAL_AGENT_ID=donald-trump
BACKEND_URL=https://your-vercel-app.vercel.app
EOF

# Create systemd service
cat > /etc/systemd/system/agent-donald-trump.service << EOF
[Unit]
Description=Donald Trump Agent
After=network.target coral-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/pardon-simulator/agents/trump-donald
ExecStart=/root/pardon-simulator/agents/trump-donald/.venv/bin/python main.py
Restart=always
RestartSec=10
EnvironmentFile=/root/pardon-simulator/agents/trump-donald/.env

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
systemctl enable agent-donald-trump
systemctl start agent-donald-trump
systemctl status agent-donald-trump
```

Repeat for all agents: cz, melania, eric, donjr, barron.

### Step 5: Deploy Prize Contract

**Time**: 30 minutes

```bash
cd /root/pardon-simulator/pardon-prizes

# Install Anchor (if not already)
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Configure for mainnet
solana config set --url mainnet-beta

# Build
anchor build

# Get program ID
anchor keys list
# Update this ID in Anchor.toml and lib.rs

# Deploy (requires SOL for deployment ~5-10 SOL)
anchor deploy

# Save the program ID
echo "Prize Program ID: [program-id]" > PROGRAM_ID.txt
```

Update `website/src/lib/prize-contract.ts`:
```typescript
const PRIZE_PROGRAM_ID = new PublicKey('YOUR_DEPLOYED_PROGRAM_ID');
```

Redeploy frontend:
```bash
cd website
vercel --prod
```

---

## Phase 4.3: Mainnet Switch & Configuration

### Step 1: Fund Agent Wallets

Each agent needs:
- **5-10 SOL** for transaction fees
- **Optional**: 10,000 $PARDON tokens for testing

```bash
# From your funded wallet, send SOL to each agent
solana transfer <agent-pubkey> 10 --allow-unfunded-recipient

# Send PARDON tokens (if launched)
spl-token transfer <PARDON_MINT> 10000 <agent-pubkey>
```

### Step 2: Create Prize Pool Wallet

```bash
# Generate new wallet for prize pool
solana-keygen new -o prize-pool-keypair.json

# Fund with SOL (for fees)
solana transfer <prize-pool-pubkey> 5

# Create token account for $PARDON
spl-token create-account <PARDON_MINT> --owner prize-pool-keypair.json

# Fund prize pool with $PARDON tokens
spl-token transfer <PARDON_MINT> 100000 <prize-pool-token-account>
```

### Step 3: Update All Environment Variables

**Vercel** (Frontend):
- Update `SOLANA_RPC_URL` to mainnet Helius
- Update `PARDON_TOKEN_MINT` to actual mint
- Keep `CRON_SECRET` secure

**Agents** (VPS):
- Update all `.env` files with mainnet RPC
- Verify private keys are correct
- Update `BACKEND_URL` to production Vercel URL

**Restart all services**:
```bash
systemctl restart coral-server
systemctl restart agent-*
```

### Step 4: Verify Connections

```bash
# Check Coral Server
curl http://localhost:5555/health

# Check agents
systemctl status agent-donald-trump
journalctl -u agent-donald-trump -f

# Check frontend
curl https://your-app.vercel.app/api/leaderboard/current
```

---

## Phase 4.4: Monitoring & Launch

### Step 1: Setup Monitoring (Sentry)

**Time**: 15 minutes

```bash
cd website
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Configure in Vercel:
```
SENTRY_DSN=[your Sentry DSN]
NEXT_PUBLIC_SENTRY_DSN=[your Sentry DSN]
```

### Step 2: Setup Uptime Monitoring

Use one of:
- **UptimeRobot** (free): https://uptimerobot.com
- **Pingdom**: https://pingdom.com
- **Better Uptime**: https://betteruptime.com

Monitor:
- Frontend: `https://your-app.vercel.app`
- Coral Server: `http://your-vps-ip:5555/health`
- Database: Check Railway/Neon dashboard

### Step 3: Setup Log Aggregation

**Option A: Papertrail** (free tier)

```bash
# On VPS
wget -O - https://github.com/papertrail/remote_syslog2/releases/download/v0.21/remote_syslog_linux_amd64.tar.gz | tar xzv

# Configure
cat > /etc/log_files.yml << EOF
files:
  - /var/log/syslog
  - /var/log/messages
destination:
  host: logs.papertrailapp.com
  port: YOUR_PORT
  protocol: tls
EOF

# Start
./remote_syslog -c /etc/log_files.yml
```

**Option B: CloudWatch** (AWS)

Install CloudWatch agent on EC2 instances.

### Step 4: Launch Checklist

**Pre-Launch**:
- [ ] Database migration successful
- [ ] All agents responding
- [ ] Payments work end-to-end
- [ ] Scoring updates correctly
- [ ] Leaderboard displays
- [ ] Weekly reset tested manually
- [ ] Prize contract deployed
- [ ] Monitoring active
- [ ] Backups configured

**Soft Launch** (Week 1):
- [ ] Invite 50-100 beta users
- [ ] Small prize pool (1,000 $PARDON)
- [ ] Monitor for bugs
- [ ] Collect feedback
- [ ] Test full week cycle

**Public Launch** (Week 2+):
- [ ] Social media announcement
- [ ] Full prize pool (10,000+ $PARDON)
- [ ] Documentation published
- [ ] Support channels ready

### Step 5: Weekly Operations & Cron Jobs

**Vercel Cron Configuration** (`vercel.json`):

```json
{
  "crons": [{
    "path": "/api/cron/weekly-reset",
    "schedule": "0 0 * * 1"
  }]
}
```

**Schedule:** Every Monday at 00:00 UTC

**Automated Tasks:**
1. Weekly reset runs automatically
2. Leaderboard generated from previous week's scores
3. Rankings calculated
4. Prize eligibility marked (score >= 80)
5. New week begins

**Cron Endpoint:** `website/src/app/api/cron/weekly-reset/route.ts`

**Process:**
- Fetch all sessions from previous week
- Calculate final scores and ranks
- Create `LeaderboardEntry` for each user
- Archive old sessions
- Send notifications (future)

**Manual Verification**:
```bash
# Check last week's leaderboard
curl https://your-app.vercel.app/api/leaderboard/current

# Check prize distribution logs
Check Sentry or server logs for prize events

# Manually trigger (for testing)
curl -X POST https://your-app.vercel.app/api/cron/weekly-reset
```

**Monitoring:**
- Vercel Dashboard → Cron Logs
- Sentry for errors
- Database: Check `LeaderboardEntry` table weekly

### Step 6: Backup Strategy

**Database**:
- Railway: Automatic daily backups included
- Neon: Automatic backups included
- Manual: `pg_dump` weekly to S3

**Code**:
- Git repository (already backed up)
- `.env` files: Store securely in password manager

**Wallets**:
- **CRITICAL**: Backup all agent keypairs
- Store in multiple secure locations
- Never lose prize pool keypair

---

## Maintenance Tasks

### Daily
- [ ] Check uptime monitors
- [ ] Review error logs (Sentry)
- [ ] Verify agents are running

### Weekly
- [ ] Review leaderboard
- [ ] Verify prize distribution
- [ ] Check database size
- [ ] Review costs

### Monthly
- [ ] Update dependencies
- [ ] Security patches
- [ ] Performance review
- [ ] Cost optimization

---

## Rollback Procedure

If critical issues occur:

1. **Rollback Frontend** (Vercel):
   ```bash
   vercel rollback
   ```

2. **Rollback Database** (if needed):
   ```bash
   # Railway/Neon: Use dashboard to restore from backup
   ```

3. **Restart Agents**:
   ```bash
   systemctl restart agent-*
   ```

4. **Emergency Contacts**:
   - Helius support
   - Vercel support
   - Database provider support

---

## Cost Estimates

### Monthly Costs (Production)

| Service | Cost |
|---------|------|
| Vercel (Frontend) | $20 (Pro plan) |
| Railway/Neon (Database) | $5-25 |
| DigitalOcean VPS | $12-24 |
| Helius RPC | $50 (Growth plan) |
| LLM API (Agents) | $100-500 (usage-based) |
| Sentry | Free tier |
| Domain | $12/year |
| **Total** | **~$200-650/month** |

### Optimization Tips
- Use Helius free tier initially (limited requests)
- Start with smaller VPS, scale up
- Monitor LLM API usage, optimize prompts
- Use Vercel hobby plan for testing

---

## Troubleshooting

### Agents Not Connecting

```bash
# Check Coral Server
systemctl status coral-server
netstat -tulpn | grep 5555

# Check agent logs
journalctl -u agent-donald-trump -n 100

# Verify .env
cat agents/trump-donald/.env
```

### Database Connection Issues

```bash
# Test connection
psql "$DATABASE_URL"

# Check Prisma
npx prisma studio

# Verify migrations
npx prisma migrate status
```

### Payment Failures

```bash
# Check Helius RPC
curl "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Check agent wallet balance
solana balance <agent-pubkey>

# Check transaction
solana confirm <signature>
```

---

## Success Metrics

Track these KPIs:

1. **Uptime**: Target 99.9%
2. **Response Time**: < 2 seconds
3. **Error Rate**: < 1%
4. **Active Users**: Track weekly
5. **Completion Rate**: % who reach 80+ score
6. **Payment Success**: > 95%

---

## Next Steps After Launch

1. **Week 1**: Monitor closely, fix bugs
2. **Week 2**: Gather feedback, iterate
3. **Week 3**: Optimize performance
4. **Month 2**: Add features from roadmap
5. **Month 3**: Scale marketing

---

**You're ready for production! 🚀**

For questions, refer to:
- `SESSION_COMPLETION_REPORT.md` - Full implementation summary
- `NEXT_STEPS_GUIDE.md` - Quick integration steps
- `DATABASE_SETUP.md` - Database details


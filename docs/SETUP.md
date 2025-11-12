# Setup Guide

Complete setup instructions for the Pardon Simulator project.

---

## Prerequisites

- **Java 21** - For Coral Server
- **Python 3.10+** - For agents
- **Node.js 18+** - For frontend  
- **PostgreSQL** - For database
- **Helius Account** - Get your API key from [https://www.helius.dev/](https://www.helius.dev/)
- **Solana Wallet** - Phantom or Solflare

---

## Quick Start (5 Minutes)

### Step 1: Setup Environment Files

Copy and configure the agent session configuration:

```bash
# Copy example configuration
cp agents-session-configuration.example.json agents-session-configuration.json

# Edit with your API keys
nano agents-session-configuration.json
```

Add your API keys:
- OpenAI API key (or other LLM provider)
- Helius RPC URL
- Solana private keys for each agent

Then run the setup script:

```bash
# Create all environment files from configuration
./setup-local-env.sh
```

This automatically extracts and configures:
- OpenAI API key for all agents
- Helius RPC URL for blockchain access
- Solana private keys for each agent
- Coral Server URLs for communication

### Step 2: Start Services

**Terminal 1 - Coral Server:**
```bash
./start-server.sh
```

Wait for:
```
✅ Coral Server started successfully
📊 Endpoints:
   - SSE: http://localhost:5555/sse
   - HTTP: http://localhost:5555
```

**Terminal 2 - Frontend:**
```bash
cd website
npm install  # First time only

# Setup database (first time only)
npx prisma migrate dev   # Run migrations
npx prisma generate      # Generate Prisma client

# Start frontend
npm run dev
```

Wait for:
```
✓ Ready in Xms
○ Local: http://localhost:3000
```

### Step 3: Play the Game

1. Open **http://localhost:3000** in your browser
2. Connect your Solana wallet (Phantom or Solflare)
3. Start chatting with the Trump family agents!
4. Negotiate, pay, and try to secure that pardon!

---

## Detailed Setup

### Get Your Helius API Key

The public Solana RPC has severe rate limiting. This project **requires** Helius for reliable blockchain access.

1. Go to [https://www.helius.dev/](https://www.helius.dev/)
2. Sign up for a free account
3. Create a new API key
4. Copy your API key

**Free tier includes:**
- 100,000 credits/month
- Sufficient for development and testing

### Configure Agents

Edit `agents-session-configuration.json`:

```bash
nano agents-session-configuration.json
```

Find the `SOLANA_RPC_URL` sections for **each agent** and update:

```json
{
  "id": {"name": "donald-trump", "version": "1.0.0"},
  "options": {
    "SOLANA_RPC_URL": {
      "type": "string",
      "value": "https://mainnet.helius-rpc.com/?api-key=YOUR-HELIUS-API-KEY"
    }
  }
}
```

**Update for all 7 agents:**
- `donald-trump`
- `melania-trump`
- `eric-trump`
- `donjr-trump`
- `barron-trump`
- `cz`
- `sbf`

### Configure Frontend

```bash
cd website

# Copy the example file
cp env.example .env.local

# Edit with your API key
nano .env.local
```

Add your configuration:

```env
# Helius RPC URL (BACKEND ONLY - Not exposed to browser)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR-HELIUS-API-KEY

# PostgreSQL Database URL
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/pardon_simulator

# Coral Server URL (can be public)
NEXT_PUBLIC_CORAL_SERVER_URL=http://localhost:5555
```

**Security Warning:**
- DO NOT use `NEXT_PUBLIC_` prefix for `SOLANA_RPC_URL`
- The Helius API key must stay on the server
- Only API routes can access it
- Never expose your API key to the browser

---

## Wallet Configuration

All Solana wallet addresses are managed through **environment variables** instead of hardcoded values.

### Required Environment Variables

**Frontend (`website/.env.local`):**

```bash
# Agent Wallet Addresses (Backend Only)
WALLET_DONALD_TRUMP=YOUR-DONALD-TRUMP-WALLET-ADDRESS
WALLET_MELANIA_TRUMP=YOUR-MELANIA-TRUMP-WALLET-ADDRESS
WALLET_ERIC_TRUMP=YOUR-ERIC-TRUMP-WALLET-ADDRESS
WALLET_DONJR_TRUMP=YOUR-DONJR-TRUMP-WALLET-ADDRESS
WALLET_BARRON_TRUMP=YOUR-BARRON-TRUMP-WALLET-ADDRESS
WALLET_CZ=YOUR-CZ-WALLET-ADDRESS

# White House Treasury - Central Revenue Collection
WALLET_WHITE_HOUSE=YOUR-WHITE-HOUSE-TREASURY-ADDRESS
```

**Agent Files (`agents/*/`.env`):**

Each agent needs these variables:

```bash
# This agent's public address
SOLANA_PUBLIC_ADDRESS=YOUR-AGENT-WALLET-ADDRESS

# All agent wallet addresses (for cross-agent lookups)
WALLET_DONALD_TRUMP=YOUR-DONALD-TRUMP-WALLET-ADDRESS
WALLET_MELANIA_TRUMP=YOUR-MELANIA-TRUMP-WALLET-ADDRESS
WALLET_ERIC_TRUMP=YOUR-ERIC-TRUMP-WALLET-ADDRESS
WALLET_DONJR_TRUMP=YOUR-DONJR-TRUMP-WALLET-ADDRESS
WALLET_BARRON_TRUMP=YOUR-BARRON-TRUMP-WALLET-ADDRESS
WALLET_CZ=YOUR-CZ-WALLET-ADDRESS

# White House Treasury
WALLET_WHITE_HOUSE=YOUR-WHITE-HOUSE-TREASURY-ADDRESS
```

### Benefits of Environment Variables

- **Deployment Flexibility** - Different addresses for dev/staging/production
- **Security** - No hardcoded addresses in source code
- **Consistency** - Single source of truth across frontend and agents
- **Easy Updates** - Change addresses without code modifications

---

## White House Treasury Configuration

The White House Treasury is a **mandatory security measure** where all user payments are automatically forwarded to a central treasury wallet.

### Why This Exists

**Security Benefits:**
- All revenue centralized in one secure location
- Agent wallets only hold minimal transaction amounts
- Reduced attack surface (only treasury needs maximum security)
- Easy revenue tracking and reporting
- If agent key compromised, minimal funds at risk

### How It Works

```
1. User pays agent for service (e.g., 0.01 SOL)
   ↓
2. Agent verifies payment on-chain ✅
   ↓
3. Agent IMMEDIATELY forwards to White House Treasury
   ↓
4. Agent delivers service to user
   ↓
5. Agent wallet returns to baseline (~0.05 SOL for gas)
```

### Configuration

Set the `WALLET_WHITE_HOUSE` environment variable in:
- `website/.env.local`
- All agent `.env` files

**Development:**
```bash
# Treasury wallet configured by setup-local-env.sh
WALLET_WHITE_HOUSE=<TREASURY_WALLET_ADDRESS>
```

**Production:**
1. Generate a secure treasury wallet (hardware wallet recommended)
2. Use multi-signature if possible (Squads Protocol)
3. Update `WALLET_WHITE_HOUSE` in all environment files
4. Keep private key in cold storage

### Security Best Practices

**Treasury Wallet:**
- Generate with: `solana-keygen new --outfile white-house-treasury.json`
- Use multi-signature (2-of-3 or 3-of-5 recommended)
- Keep in cold storage (hardware wallet)
- Limit access to private key

**Monitoring:**
- Set up alerts for treasury balance changes
- Verify forwarding is occurring
- Check agent wallets don't accumulate funds
- Review transaction logs regularly

---

## Verification

### Check Agents Are Running

When Coral Server starts, you should see for each agent:

```
🚀 Donald Trump Agent Starting...
💰 Wallet Address: <ADDRESS_FROM_ENV>
💵 Balance: 50.0000 SOL
   RPC URL: https://mainnet.helius-rpc.com/?api-key=...
✅ DONALD TRUMP is ready!
```

### Check Frontend Connection

Open browser console at `http://localhost:3000` and verify:
- No errors in console
- Wallet connects successfully
- Can see agent list
- Agent balances display

### Test Payment Flow

1. Send a message requesting a service
2. Agent responds with payment request
3. Approve transaction in wallet
4. Agent should verify within 5-10 seconds
5. Check treasury received forwarded payment

---

## Troubleshooting

### "SOLANA_RPC_URL environment variable is required"

**For Agents:**
- Check `agents-session-configuration.json` has the URL for each agent
- Verify the API key is correct (no extra spaces)
- Restart Coral Server after changing configuration

**For Frontend:**
- Check `.env.local` exists in `website/`
- Verify `SOLANA_RPC_URL` is set (NOT `NEXT_PUBLIC_SOLANA_RPC_URL`)
- Restart `npm run dev` after changing `.env.local`

### "Missing wallet addresses in environment variables"

**Solution:**
1. Check all `WALLET_*` variables are set in `.env.local` and agent `.env` files
2. Run `./setup-local-env.sh` to regenerate if needed
3. Restart all services

### Rate Limiting / Timeout Errors

If you see rate limiting:
- Verify Helius URL is being used (check agent logs)
- Check Helius dashboard for remaining credits
- Consider upgrading your Helius plan

### Agent Won't Start

```bash
# Full system restart with cleanup
./complete-restart.sh
```

### Database Connection Issues

Check PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql

# Check connection
psql -U YOUR_USER -d pardon_simulator -c "SELECT 1;"
```

Verify `DATABASE_URL` in `website/.env.local` is correct.

---

## Security Best Practices

### Environment Variables Only
- Never hardcode API keys
- Use `.env.local` for frontend
- Use `agents-session-configuration.json` for agents
- All wallet addresses from environment variables

### Backend-Only Secrets
- Helius API key only in API routes
- No `NEXT_PUBLIC_` prefix for secrets
- Verify keys never appear in browser
- Wallet addresses stay server-side

### Regular Maintenance
- Rotate Helius API keys periodically
- Use different keys for dev/prod
- Monitor usage on Helius dashboard
- Review treasury and agent balances

### Backup Configuration
- Keep `env.example` files updated
- Document any new environment variables
- Share setup instructions with team
- Keep secure backups of treasury key

---

## What Gets Configured

The `./setup-local-env.sh` script creates:

**Frontend Configuration (`website/.env.local`):**
```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR-KEY
NEXT_PUBLIC_CORAL_SERVER_URL=http://localhost:5555
DATABASE_URL=postgresql://...
WALLET_DONALD_TRUMP=...
WALLET_MELANIA_TRUMP=...
# ... other wallet addresses
```

**Agent Configuration (7 files in `agents/*/`.env`):**
- `agents/trump-donald/.env`
- `agents/trump-melania/.env`
- `agents/trump-eric/.env`
- `agents/trump-donjr/.env`
- `agents/trump-barron/.env`
- `agents/cz/.env`
- `agents/sbf/.env`

Each contains:
```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<API_KEY>
SOLANA_PRIVATE_KEY=<AGENT_WALLET_PRIVATE_KEY>
SOLANA_PUBLIC_ADDRESS=<AGENT_WALLET_PUBLIC_ADDRESS>
MODEL_API_KEY=<LLM_API_KEY>
CORAL_SSE_URL=http://localhost:5555/sse
CORAL_AGENT_ID=<agent-name>
WALLET_DONALD_TRUMP=...
# ... all other wallet addresses
WALLET_WHITE_HOUSE=...
```

---

## Next Steps

- Read [OPERATIONS.md](./OPERATIONS.md) for available scripts and workflows
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
- Read [AGENTS.md](./AGENTS.md) for agent implementation details
- Read [SECURITY.md](./SECURITY.md) for security guidelines
- Read [AGENT_OVERVIEW.md](./AGENT_OVERVIEW.md) for agent personalities and roles
- Read [GAMEPLAY.md](./GAMEPLAY.md) for gameplay strategies

---

**Setup complete! You're ready to start negotiating for that pardon!**

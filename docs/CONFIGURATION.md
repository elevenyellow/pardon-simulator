# Configuration Files Reference

Complete guide to all configuration files in Pardon Simulator.

---

## Overview

Pardon Simulator uses multiple configuration files for different deployment scenarios. This guide explains what each file does, where it's used, and how to set them up properly.

**Security Note:** Files containing secrets (API keys, private keys) are listed in `.gitignore` and should NEVER be committed to the repository.

---

## Production Deployment

### ECS Fargate (Recommended for AWS)

#### `ecs-task-definition.json` (Root Directory)

**Purpose:** ECS task definition with container configurations and environment variables  
**Used by:** `scripts/deploy-ecs.sh` registers this with AWS ECS  
**Contains:** API keys, Solana private keys, AWS account info  
**Security:** ⚠️ **NEVER COMMIT** - Listed in `.gitignore`

**Setup:**
```bash
cp ecs-task-definition.example.json ecs-task-definition.json
nano ecs-task-definition.json  # Fill in your actual secrets
```

**Better Alternative:** Use AWS Secrets Manager instead of hardcoded secrets. See `docs/ECS_DEPLOYMENT.md` for details.

---

### Docker Compose (Alternative)

#### `.env.production` (Root Directory)

**Purpose:** Central configuration file for production deployment via Docker Compose  
**Used by:** `docker-compose.yml` passes these as environment variables to containers  
**Contains:** API keys, Solana private keys, wallet addresses, AWS credentials  
**Security:** ⚠️ **NEVER COMMIT** - Listed in `.gitignore`

**Setup:**
```bash
cp .env.production.example .env.production
nano .env.production  # Fill in your actual secrets
```

**Key Variables:**
- `MODEL_API_KEY` - OpenAI API key (shared by all agents)
- `SOLANA_PRIVATE_KEY_*` - Private keys for each agent
- `WALLET_*` - Public wallet addresses
- `SOLANA_RPC_URL` - Helius RPC endpoint
- `BACKEND_URL` - Your Vercel deployment URL
- AWS credentials for S3 config fetching

**File Structure:**
```
Root .env.production
├── Contains: All secrets for production
├── Used by: docker-compose.yml
├── Deployed to: Elastic Beanstalk via environment variables
└── Never commit: Listed in .gitignore
```

---

## Local Development

There are two methods for local development, depending on how you want to run the agents.

### Method 1: Website-Initiated Sessions (Recommended)

#### `agents-session-configuration.json` (Root Directory)

**Purpose:** Defines all agents and their configurations for Coral Server sessions  
**Used by:** `website/src/app/api/chat/session/route.ts`  
**Contains:** Agent IDs, API keys, private keys, RPC URLs  
**Security:** ⚠️ **NEVER COMMIT** - Listed in `.gitignore`

**Setup:**
```bash
cp agents-session-configuration.example.json agents-session-configuration.json
nano agents-session-configuration.json  # Fill in your secrets
```

**How it works:**
1. Website backend reads this file
2. Creates Coral Server session with all agents configured
3. Agents spawn automatically with credentials from JSON
4. All 7 agents run in a single session

**Use when:**
- Running full system via website interface
- Testing complete agent interactions
- Simulating production environment locally

---

### Method 2: Direct Agent Execution

#### `agents/[agent]/.env` (Per-Agent Directory)

**Purpose:** Individual environment file for each agent  
**Used by:** Agent's `main.py` via `load_dotenv()`  
**Contains:** Agent-specific API key, private key, RPC URL  
**Security:** ⚠️ **NEVER COMMIT** - Listed in `.gitignore`

**Setup:**
```bash
# Copy template to each agent directory
cp agents/.env.example agents/cz/.env
cp agents/.env.example agents/trump-donald/.env
# ... repeat for all agents

# Edit each one with agent-specific values
nano agents/cz/.env
```

**How it works:**
1. Run agent directly: `cd agents/cz && python main.py`
2. Agent loads `.env` file from its directory
3. Connects to Coral Server independently
4. Useful for debugging single agents

**Use when:**
- Debugging a specific agent
- Developing agent features
- Testing individual agent behavior
- Running agents manually

---

### Website Configuration

#### `website/.env` (Website Directory)

**Purpose:** Next.js environment variables (server-side only)  
**Used by:** Next.js backend API routes  
**Contains:** Database URL, RPC URLs, public addresses, facilitator key  
**Security:** ⚠️ **NEVER COMMIT** - Listed in `.gitignore`

**Setup:**
```bash
cd website
cp .env.example .env
nano .env  # Fill in your values
```

**Key Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `SOLANA_RPC_URL` - Helius RPC (backend only!)
- `CORAL_SERVER_URL` - Coral Server endpoint
- `FACILITATOR_SOLANA_PRIVATE_KEY` - For x402 payment processing
- `WALLET_*` - Public addresses (safe for backend)

**Security Notes:**
- All variables are server-side only
- No private keys exposed to browser
- Use `NEXT_PUBLIC_` prefix only for public data
- Users' wallets controlled via Phantom/Solflare browser extensions

---

## Template Files (Committed to Repository)

These example files are safe to commit and serve as templates:

| File | Location | Purpose |
|------|----------|---------|
| `.env.production.example` | Root | Production deployment template |
| `agents/.env.example` | agents/ | Agent development template |
| `website/.env.example` | website/ | Next.js configuration template |
| `agents-session-configuration.example.json` | Root | Session config template |

**All example files use placeholder values and contain no real secrets.**

---

## Configuration Matrix

| Scenario | Files Needed | Location |
|----------|--------------|----------|
| **Production (EB/Docker)** | `.env.production` | Root |
| **Local Dev (Full System)** | `agents-session-configuration.json`<br>`website/.env` | Root<br>website/ |
| **Local Dev (Single Agent)** | `agents/[agent]/.env`<br>`website/.env` | Per agent<br>website/ |
| **GitHub Actions** | GitHub Secrets | Repository settings |

---

## Environment Variable Reference

### Shared Across All Configs

```bash
# LLM Configuration
MODEL_API_KEY=sk-proj-...        # OpenAI API key
MODEL_NAME=gpt-5.1                # Model to use

# Solana Configuration
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
SOLANA_PRIVATE_KEY=...            # Agent's private key (Base58)

# Coral Server
CORAL_AGENT_ID=agent-name         # Agent identifier
CORAL_SSE_URL=http://localhost:5555/sse
```

### Agent Wallet Addresses (Public - Safe to Share)

```bash
WALLET_DONALD_TRUMP=8JpMyaZ...
WALLET_MELANIA_TRUMP=4Vf8jhK...
WALLET_ERIC_TRUMP=Dqii9r1...
WALLET_DONJR_TRUMP=3KxtMPL...
WALLET_BARRON_TRUMP=5mEGcmB...
WALLET_CZ=BSX3YtW...
WALLET_WHITE_HOUSE=Treasury...   # Central treasury
```

### Backend Configuration

```bash
BACKEND_URL=http://localhost:3000              # Local dev
BACKEND_URL=https://your-app.vercel.app        # Production
```

---

## Security Best Practices

### ✅ DO:
- Keep all `.env` files in `.gitignore`
- Use environment variables for all secrets
- Store private keys securely offline
- Use hardware wallets for production treasury
- Rotate API keys regularly
- Use separate keys for dev/production

### ❌ DON'T:
- Commit any file containing real secrets
- Hardcode API keys in source code
- Expose private keys to frontend/browser
- Share `.env` files via Slack/email
- Use production keys in development
- Store private keys in plain text long-term

---

## Troubleshooting

### "Environment variable not found"

**Check:**
1. File exists in correct location
2. Variable name spelled correctly
3. No extra spaces around `=`
4. File loaded before variable accessed

### "Agent wallet addresses not loaded"

**Solution:**
Agents now load wallet addresses from environment variables (set in `.env` or `.env.production`), not from `agent_wallets.json` files.

Ensure you have `WALLET_*` environment variables set.

### "Private key invalid"

**Check:**
1. Private key is Base58 encoded
2. No extra whitespace
3. Full key copied (not truncated)
4. Matches expected Solana key format

---

## Migration Notes

### Removed Files

The following files have been removed (they were redundant):

- `agent_wallets.json` (root) - Public addresses now in environment variables
- `agent_wallets.example.json` - Replaced with `.env` examples
- `agents/agent_wallets.json` - Duplicate file
- `agents-session-configuration-production.json` - Empty/unused

### Why the Change?

1. **Eliminates duplication** - Wallet addresses derivable from private keys
2. **Consistent with env pattern** - All secrets in environment variables
3. **Simpler setup** - Fewer files to manage
4. **Better security** - No separate wallet file to accidentally commit

---

## Quick Reference

```bash
# Production Setup
cp .env.production.example .env.production
# Edit .env.production, deploy via docker-compose

# Local Development (Full System)
cp agents-session-configuration.example.json agents-session-configuration.json
cd website && cp .env.example .env
# Edit both files, run ./start-server.sh and ./start-website.sh

# Local Development (Single Agent)
cp agents/.env.example agents/cz/.env
cd website && cp .env.example .env
# Edit files, cd agents/cz && python main.py
```

---

## Related Documentation

- **[SETUP.md](./SETUP.md)** - Complete setup instructions
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment
- **[SECURITY.md](./SECURITY.md)** - Security guidelines
- **[OPERATIONS.md](./OPERATIONS.md)** - Running and maintaining the system

---

**Remember:** Configuration files with secrets should NEVER be committed to version control. Always use the `.example` templates and fill in your own values locally.


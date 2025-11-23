# Operations Guide

Quick reference for running, managing, and troubleshooting the Pardon Simulator.

---

## Starting Services

### Start Coral Server

```bash
./start-server.sh
```

Starts the Coral multi-agent orchestration server on port 5555.
- Uses Java 21
- Loads `registry.toml` for agent registration
- Required before running agents or frontend

### Start Frontend

```bash
./start-website.sh
```

Starts the Next.js frontend on port 3000.
- Requires Coral Server to be running
- Navigate to `http://localhost:3000`

### Start Coral Studio

```bash
./start-studio.sh
```

Starts the Coral Studio UI for monitoring and debugging.
- Visual interface for sessions, threads, and messages
- Useful for development and debugging

---

## Setup & Maintenance

### Complete Restart

```bash
./complete-restart.sh
```

Full system restart with cleanup:
1. Stops all running processes (agents, server, studio)
2. Cleans virtual environments (all agents)
3. Stops Gradle daemons
4. Starts Coral Server fresh

**Use this when:**
- Agents aren't responding
- System is in a bad state
- After major code changes
- Python dependency issues

### Rebuild Agent Virtual Environments

```bash
./rebuild-agent-venvs.sh
```

Rebuilds all agent virtual environments with correct architecture.
- Detects system architecture (ARM64/x86_64)
- Creates fresh virtual environments
- Reinstalls all Python dependencies
- Useful after system updates or architecture changes

---

## Database Operations

### Quick Database Reset

**Method 1: NPM Script (Recommended)**
```bash
cd website
npm run db:reset
```

**Method 2: Direct Node Script**
```bash
cd website
node reset-database.js --force
```

**Method 3: Shell Script (Interactive)**
```bash
./reset-database.sh
# Will prompt for confirmation
```

### What Gets Deleted

The reset script clears ALL data from these tables:

1. **Score** - All point records
2. **Message** - All chat messages
3. **Payment** - All payment records
4. **Thread** - All conversation threads
5. **Session** - All user sessions
6. **LeaderboardEntry** - All leaderboard records
7. **User** - All user accounts

### What's NOT Deleted

- Database schema (tables, columns, indexes remain)
- Environment variables
- Agent configurations
- Solana blockchain transactions (those are permanent!)

### When to Reset

Use database reset when:
- Starting fresh testing after code changes
- Testing new features from scratch
- Clearing test data before demos
- Debugging scoring/session issues
- After major agent prompt changes

**DO NOT** use in production!

### After Reset

1. **Restart the website** (if running)
   ```bash
   cd website
   npm run dev
   ```

2. **Keep agents running** (no restart needed)
   - They'll create new sessions automatically
   - Wallet addresses unchanged
   - Operational state preserved

3. **Test from scratch**
   - Visit http://localhost:3000
   - Connect wallet (creates new user)
   - Start fresh conversations

### Prisma Studio

To inspect the database visually:

```bash
cd website
npm run db:studio
# or
npx prisma studio
```

Opens at: http://localhost:5555

---

## Common Workflows

### First Time Setup

```bash
# 1. Configure environment files (see SETUP.md)
# Copy and edit configuration files as needed

# 2. Start Coral Server (Terminal 1)
./start-server.sh

# 3. Start frontend (Terminal 2)
cd website
npm install  # First time only
npx prisma migrate dev  # Setup database
npm run dev
```

### Daily Development

```bash
# Start services in separate terminals
./start-server.sh        # Terminal 1
cd website && npm run dev  # Terminal 2
./start-studio.sh        # Terminal 3 (optional)
```

### After Updating API Keys

```bash
# 1. Edit configuration with new keys
nano agents-session-configuration.json

# 2. Update .env files as needed in each agent directory

# 3. Restart services
./complete-restart.sh
```

### After Code Changes

```bash
# If agent code changed
./complete-restart.sh

# If frontend code changed (auto-reloads)
# No action needed

# If both changed
./complete-restart.sh
cd website && npm run dev
```

### Troubleshooting Flow

```bash
# Step 1: Full system restart
./complete-restart.sh

# Step 2: If agents fail with import errors
# (script was removed in cleanup)
# Manually rebuild:
cd agents/trump-donald
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Step 3: Reset database if data issues
./reset-database.sh

# Step 4: Check logs
tail -f coral-server.log  # If it exists
```

---

## Available Scripts Summary

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `start-server.sh` | Start Coral Server | Every session |
| `start-website.sh` | Start UI | Every session |
| `start-studio.sh` | Start debug UI | Development |
| `start-prisma-studio.sh` | Open database UI | Database inspection |
| `complete-restart.sh` | Full system restart + clean | Troubleshooting |
| `reset-database.sh` | Reset all database data | Testing |
| `rebuild-agent-venvs.sh` | Rebuild Python environments | Architecture changes |

---

## Monitoring & Debugging

### Check Service Status

**Coral Server:**
```bash
curl http://localhost:5555
# Should return server info
```

**Frontend:**
```bash
curl http://localhost:3000
# Should return HTML
```

**Database:**
```bash
cd website
npx prisma studio
# Visual database browser
```

### View Logs

**Coral Server:**
- Outputs directly to terminal
- Shows agent startup messages
- Displays agent logs in real-time

**Frontend:**
- Check browser console for errors
- Check terminal for API route logs
- Use Network tab for API calls

**Agents:**
- Logs appear in Coral Server output
- Look for agent-specific prefixes
- Check for error messages

### Common Error Messages

**"Connection refused" (Frontend)**
- Coral Server not running
- Start with `./start-server.sh`

**"Cannot connect to database"**
- PostgreSQL not running
- Check `DATABASE_URL` in `.env.local`
- Run: `npm run db:studio` to test connection

**"Module not found" (Agents)**
- Virtual environment issue
- Run: `./complete-restart.sh`

**"Payment verification failed"**
- Helius API key issue
- Check credits at https://www.helius.dev/
- Verify RPC URL in configuration

---

## Database Maintenance

### Backup Database

```bash
cd website

# Export schema
npx prisma db pull

# Backup data (if needed)
pg_dump pardon_simulator > backup.sql
```

### Restore Database

```bash
# Restore from backup
psql pardon_simulator < backup.sql

# Regenerate Prisma client
npx prisma generate
```

### Run Migrations

```bash
cd website

# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations to production
npx prisma migrate deploy
```

---

## Performance Optimization

### Clear Old Data

```bash
# Reset database periodically in development
./reset-database.sh

# In production, implement data retention policy
# Keep last 30 days, archive older data
```

### Monitor Resource Usage

```bash
# Check Java processes (Coral Server)
ps aux | grep java

# Check Node processes (Frontend)
ps aux | grep node

# Check Python processes (Agents)
ps aux | grep python
```

### Optimize Database

```bash
cd website

# Analyze query performance
npx prisma studio
# Check slow queries

# Add indexes if needed
# Update schema.prisma
# Run: npx prisma migrate dev
```

---

## Security Operations

### Rotate API Keys

1. **Generate new keys:**
   - OpenAI/LLM provider
   - Helius RPC
   - CDP credentials

2. **Update configuration:**
   ```bash
   nano agents-session-configuration.json
   # Update all API keys
   ```

3. **Regenerate environment files:**
   ```bash
   ./setup-local-env.sh
   ```

4. **Restart services:**
   ```bash
   ./complete-restart.sh
   ```

### Check Treasury Balance

```bash
# Using Solana CLI
solana balance <WHITE_HOUSE_ADDRESS>

# Using frontend API
curl http://localhost:3000/api/agents/balances
```

### Audit Transactions

```bash
# Check recent transactions for an address
solana transaction-history <ADDRESS> --limit 100

# Check specific transaction
solana confirm <SIGNATURE>
```

---

## Tips & Tricks

### Running in Background

```bash
# Run server in background
./start-server.sh > server.log 2>&1 &

# Check if running
ps aux | grep gradle

# View logs
tail -f server.log
```

### Multiple Terminals with tmux

```bash
# Create session
tmux new-session -s pardon-simulator

# Split windows
tmux split-window -h
tmux split-window -v

# Terminal 1: ./start-server.sh
# Terminal 2: ./start-website.sh
# Terminal 3: ./start-studio.sh

# Detach: Ctrl+B, then D
# Reattach: tmux attach -t pardon-simulator
```

### Quick Restart Server Only

```bash
# Kill and restart server only
pkill -f gradle
./start-server.sh
```

### Check Port Usage

```bash
# Check what's using port 5555 (Coral)
lsof -i :5555

# Check what's using port 3000 (Frontend)
lsof -i :3000

# Kill process on port
kill $(lsof -t -i:5555)
```

---

## Related Documentation

- **[SETUP.md](./SETUP.md)** - Initial project setup
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment
- **[SECURITY.md](./SECURITY.md)** - Security best practices

---

**Keep your system running smoothly!**


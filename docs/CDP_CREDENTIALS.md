# CDP Credentials Verification Checklist

## REQUIRED: x402 Protocol Compliance

For full x402 compliance, all agents MUST have properly configured CDP credentials.

## Required Environment Variables

Each agent's `.env` file (`agents/*/. env`) must contain:

### 1. CDP_API_KEY_ID

**Format:**
```
CDP_API_KEY_ID=organizations/[org-uuid]/apiKeys/[key-uuid]
```

**Example:**
```
CDP_API_KEY_ID=organizations/3e2ce21a-841e-4c1f-a27a-59d2e431b87a/apiKeys/6c82d3cd-bb4b-464e-87d6-fdc293cfa884
```

**Checklist:**
- [ ] Starts with `organizations/`
- [ ] Contains two UUIDs separated by `/apiKeys/`
- [ ] No extra whitespace or quotes
- [ ] Present in ALL agent .env files

### 2. CDP_API_KEY_SECRET

**CRITICAL: Must use ECDSA (ES256) algorithm!**

**Format:**
```
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...base64-encoded-key-content...
-----END EC PRIVATE KEY-----
```

**Common Mistakes to Avoid:**
- ❌ Using Ed25519 algorithm (won't work with CDP!)
- ❌ Wrapping in quotes
- ❌ Adding extra newlines or spaces
- ❌ Using wrong BEGIN/END markers

**Checklist:**
- [ ] Starts with `-----BEGIN EC PRIVATE KEY-----`
- [ ] Ends with `-----END EC PRIVATE KEY-----`
- [ ] Contains base64-encoded content between markers
- [ ] NO quotes around the value
- [ ] Algorithm is ECDSA (ES256), NOT Ed25519
- [ ] Present in ALL agent .env files

## How to Verify Your Credentials

### Option 1: Visual Inspection

```bash
cd /Users/al/apps/pardon-simulator/agents

# Check each agent's .env file:
for dir in cz sbf trump-*; do
  echo "=== $dir ==="
  if [ -f "$dir/.env" ]; then
    grep -E "^CDP_API_KEY" "$dir/.env" | sed 's/=.*/=...[REDACTED]/'
  else
    echo "⚠️  No .env file found!"
  fi
  echo
done
```

### Option 2: Test CDP Initialization

Start any agent and look for these log messages:

**✅ SUCCESS:**
```
✅ CDP x402 Facilitator configured (Official CDP SDK)
   Pre-signed transactions will be submitted through CDP
   x402scan registration enabled via CDP
```

**❌ FAILURE (Missing Credentials):**
```
ℹ️  CDP credentials not configured (optional for x402 compliance)
   Transactions will use direct RPC
```

**❌ FAILURE (Wrong Algorithm):**
```
❌ CDP SDK initialization FAILED: Invalid key format
   Check credentials at: https://portal.cdp.coinbase.com/
   ⚠️ Falling back to direct RPC mode
```

## How to Fix Missing/Invalid Credentials

### Step 1: Get New CDP API Keys

1. Go to https://portal.cdp.coinbase.com/
2. Navigate to "API Keys" section
3. Click "Create API Key"
4. **CRITICAL:** Select "ECDSA (ES256)" as the algorithm
5. Download the JSON credentials file

### Step 2: Extract Credentials from JSON

The downloaded JSON contains:
```json
{
  "name": "organizations/.../apiKeys/...",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
}
```

### Step 3: Add to Each Agent's .env File

```bash
# For each agent directory (cz, sbf, trump-donald, trump-melania, etc.):
cd /Users/al/apps/pardon-simulator/agents/AGENT_NAME

# Edit .env file and add:
CDP_API_KEY_ID=organizations/.../apiKeys/...
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...
-----END EC PRIVATE KEY-----
```

**IMPORTANT:** The private key should be multi-line exactly as shown, with BEGIN/END markers on separate lines.

### Step 4: Restart Agents

After updating credentials:
```bash
# From project root:
./complete-restart.sh
```

## Verification After Setup

1. Start agents and check logs for CDP initialization success message
2. Test a payment transaction
3. Look for "✅ Transaction via CDP facilitator (x402 compliant)" in logs
4. Verify transaction appears on x402scan.com

## Troubleshooting

### "Wallet Secret not configured" Error

**THIS IS NORMAL!** You DON'T need `CDP_WALLET_SECRET`.

The system uses your existing `SOLANA_PRIVATE_KEY` for signing. CDP only needs the API credentials for submission routing.

### "CDP submission failed, using direct RPC"

Check:
1. API keys are correctly formatted (no extra spaces/quotes)
2. API key algorithm is ECDSA (ES256), NOT Ed25519
3. API keys are valid and not revoked in CDP portal
4. Network connectivity to CDP API

### "CDP SDK NOT INSTALLED"

```bash
# Install CDP SDK in each agent's venv:
cd /Users/al/apps/pardon-simulator/agents/AGENT_NAME
source .venv/bin/activate
pip install cdp-sdk
```

Or run the rebuild script:
```bash
./rebuild-agent-venvs.sh
```

## Success Criteria

- [ ] All agents have CDP_API_KEY_ID in .env
- [ ] All agents have CDP_API_KEY_SECRET in .env (ECDSA/ES256)
- [ ] All agents start with "✅ CDP x402 Facilitator configured" message
- [ ] Test transaction shows "✅ Transaction via CDP facilitator (x402 compliant)"
- [ ] Transaction appears on x402scan.com with proper metadata

## References

- CDP Setup Guide: `docs/CDP_SETUP.md`
- CDP Portal: https://portal.cdp.coinbase.com/
- x402 Protocol Documentation: https://docs.cdp.coinbase.com/x402/


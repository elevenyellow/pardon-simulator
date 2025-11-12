# CDP SDK Setup Guide

This guide covers the integration of Coinbase Developer Platform (CDP) SDK with the Pardon Simulator's x402 payment protocol.

---

## 🚀 Quick Start (No Extra Configuration Needed!)

**Good news!** CDP automatically uses your existing agent wallets - **no `CDP_WALLET_SECRET` configuration required!**

**You only need 2 things:**
1. ✅ `CDP_API_KEY_ID` - From CDP Portal
2. ✅ `CDP_API_KEY_SECRET` - From CDP Portal (use **ECDSA/ES256** algorithm!)

That's it! Your agents will automatically:
- ✅ Use their existing `SOLANA_PRIVATE_KEY` for signing
- ✅ Route transactions through CDP for x402 compliance  
- ✅ Fall back to direct RPC if CDP unavailable

**Setup:**
```bash
# In each agent's .env file (e.g., agents/trump-melania/.env)
CDP_API_KEY_ID=organizations/your-org-id/apiKeys/your-key-id
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...
-----END EC PRIVATE KEY-----

# That's all! CDP will use your existing SOLANA_PRIVATE_KEY automatically
```

Restart your agents and transactions will route through CDP! 🎉

---

## Overview

The CDP SDK provides enterprise-grade tools for blockchain interactions, including:
- Wallet management and key storage
- Transaction signing and submission
- Multi-chain support (Solana, Ethereum, Base, etc.)
- Production-ready security features

Our implementation integrates CDP SDK with the x402 payment protocol to enable:
- Agent wallet management
- Automated payment processing
- Transaction verification
- Protocol compliance

---

## Architecture

### Integration Points

```
┌─────────────────────────────────────────┐
│  Agents (Python)                        │
│  - x402 payment tools                   │
│  - CDP SDK for wallet operations        │
│  - Solana blockchain interactions       │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  CDP SDK                                │
│  - Wallet creation & management         │
│  - Transaction signing                  │
│  - Network abstraction                  │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  Solana Blockchain                      │
│  - Transaction processing               │
│  - Payment verification                 │
│  - On-chain state                       │
└─────────────────────────────────────────┘
```

---

## Setup Instructions

### 1. Install CDP SDK

For Python agents:

```bash
pip install cdp-sdk
```

### 2. Obtain CDP API Credentials

**CRITICAL: Follow these steps exactly to avoid authentication errors!**

#### Step-by-Step: Get Your CDP API Key

1. **Go to Coinbase Developer Platform:**
   - Navigate to: [https://portal.cdp.coinbase.com/](https://portal.cdp.coinbase.com/)
   - Sign in with your Coinbase account

2. **Create or Select a Project:**
   - Click "Create Project" (or select existing project)
   - Give it a name (e.g., "Pardon Simulator")

3. **Create API Key:**
   - Click: **"API Keys"** → **"Create API Key"**
   - Give the key a name (e.g., "Melania Agent")

4. **🚨 CRITICAL: Set Algorithm to ECDSA (ES256) 🚨**
   - **Algorithm dropdown:** Select **"ECDSA (ES256)"**
   - ❌ **DO NOT select "Ed25519"** - This will cause the error you saw!
   - The CDP Python SDK requires ECDSA for JWT generation

5. **Create and Save:**
   - Click: **"Create API key"**
   - **⚠️ SAVE IMMEDIATELY** - These credentials are shown **only once**!
   - You will receive TWO values:
     - `CDP_API_KEY_ID` (looks like: `organizations/abc-123-def/apiKeys/xyz-456`)
     - `CDP_API_KEY_SECRET` (looks like: `-----BEGIN EC PRIVATE KEY-----\nMHc...`)

6. **Copy Both Values:**
   - Copy the entire `API Key ID` string
   - Copy the entire `API Key Secret` (including `-----BEGIN EC PRIVATE KEY-----` and `-----END EC PRIVATE KEY-----`)

#### What You'll Receive

After creating the API key, you'll get:

```
CDP_API_KEY_ID=organizations/YOUR-ORG-ID/apiKeys/YOUR-KEY-ID

CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
YOUR-PRIVATE-KEY-CONTENT-GOES-HERE
-----END EC PRIVATE KEY-----
```

**Key Format Requirements:**
- `CDP_API_KEY_ID`: Plain text string (starts with `organizations/`)
- `CDP_API_KEY_SECRET`: **Must be PEM-encoded EC private key** (starts with `-----BEGIN EC PRIVATE KEY-----`)
- Algorithm: **ECDSA (ES256)** only - Ed25519 will NOT work with Python SDK!

### 3. Configure API Credentials

Add the credentials to your agent's environment file:

```bash
# In agents/trump-melania/.env (or your agent's .env file)
# IMPORTANT: CDP SDK requires these specific variable names

# From CDP Portal: organizations/abc.../apiKeys/xyz...
CDP_API_KEY_ID=organizations/your-org-id/apiKeys/your-key-id

# From CDP Portal: Full PEM-encoded private key (keep newlines!)
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIAbC...
...
-----END EC PRIVATE KEY-----

# ===================================================================
# CDP Transaction Sending Mode (OPTIONAL - Default: OFF)
# ===================================================================
# By default, agents use their own wallets (SOLANA_PRIVATE_KEY) to send transactions via direct RPC.
# CDP is used only for x402scan registration.
#
# If you want CDP to manage wallet operations and send transactions:
# CDP_ENABLE_TRANSACTION_SENDING=true
# CDP_WALLET_SECRET=<your-wallet-secret>  # Required if enabled
#
# Most users should leave this disabled (default) and use direct RPC with their own wallets.
# ===================================================================
```

**Two Modes of Operation:**

| Mode | Configuration | Use Case |
|------|---------------|----------|
| **Direct RPC (Default)** | `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` only | Agents manage their own wallets via `SOLANA_PRIVATE_KEY`. CDP is used for x402scan registration only. **Recommended for most users.** |
| **CDP-Managed Wallets** | Add: `CDP_ENABLE_TRANSACTION_SENDING=true` + `CDP_WALLET_SECRET` | CDP manages wallet operations and sends transactions. Requires additional wallet secret. |

**For the Pardon Simulator, use Direct RPC mode (default).** You already have agent wallets configured with `SOLANA_PRIVATE_KEY`, so you don't need CDP to send transactions.

**⚠️ Common Mistakes to Avoid:**

1. ❌ **Wrong Algorithm:** Selecting Ed25519 instead of ECDSA (ES256)
   - **Error:** "ValueError: Key must be either PEM EC key or base64 Ed25519 key"
   - **Solution:** Delete key, create new one with ECDSA (ES256)

2. ❌ **Malformed Private Key:** Missing or altered PEM format
   - **Error:** "Failed to generate JWT: Key must be either PEM EC key..."
   - **Solution:** Copy ENTIRE key including `-----BEGIN...-----` and `-----END...-----`

3. ❌ **Line Breaks Removed:** Private key should preserve newlines
   - **Solution:** In `.env` files, the key can span multiple lines

4. ❌ **Wrong Environment Variable Names:** Using custom names instead of CDP_API_KEY_*
   - **Solution:** Must use exact names: `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`

### 4. Initialize CDP Client

In your agent code:

```python
from cdp import CdpClient

# Initialize with credentials from environment variables
# CDP SDK will automatically read CDP_API_KEY_ID and CDP_API_KEY_SECRET
os.environ['CDP_API_KEY_ID'] = os.getenv("CDP_API_KEY_ID")
os.environ['CDP_API_KEY_SECRET'] = os.getenv("CDP_API_KEY_SECRET")

# Optional: for write operations
if os.getenv("CDP_WALLET_SECRET"):
    os.environ['CDP_WALLET_SECRET'] = os.getenv("CDP_WALLET_SECRET")

# Initialize CDP client
cdp_client = CdpClient()
```

### 5. Create or Import Wallets

```python
# Create new wallet
wallet = Cdp.create_wallet(network_id="solana-mainnet")

# Or import existing wallet
wallet = Cdp.import_wallet(
    network_id="solana-mainnet",
    private_key=os.getenv("AGENT_WALLET_PRIVATE_KEY")
)
```

---

## Integration with x402 Protocol

### Payment Request Flow

When an agent needs to charge for a service:

```python
from x402_payment_tools import request_premium_service

# Agent decides to charge for service
payment_request = await request_premium_service(
    service_type="strategy_advice",
    recipient_name="donald-trump",
    recipient_address=wallet.default_address.address_id,
    amount_sol=0.1
)

# Returns x402-compliant payment request
# Frontend receives HTTP 402 with payment details
```

### Payment Verification

After receiving payment:

```python
from x402_payment_tools import provide_premium_service_with_payment

# Verify payment on-chain and deliver service
result = await provide_premium_service_with_payment(
    payment_signature="<transaction-signature>",
    expected_amount=0.1
)

if result["success"]:
    # Deliver premium service
    return "Here's your strategic advice..."
```

---

## Configuration Examples

### Agent Environment Variables

Each agent needs these environment variables:

```bash
# CDP Configuration (IMPORTANT: use exact variable names)
CDP_API_KEY_ID=<your-api-key-id>
CDP_API_KEY_SECRET=<your-api-key-secret>
CDP_WALLET_SECRET=<your-wallet-secret>  # Optional

# Agent Wallet
SOLANA_PRIVATE_KEY=<agent-wallet-private-key>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# LLM Configuration
MODEL_API_KEY=<your-llm-api-key>
MODEL_NAME=gpt-4o
MODEL_PROVIDER=openai

# Coral Server
CORAL_SSE_URL=http://localhost:5555/sse
CORAL_AGENT_ID=<agent-id>
```

### Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate API keys** regularly
4. **Monitor wallet balances** for unauthorized transactions
5. **Use separate wallets** for each agent (blast radius containment)

---

## Troubleshooting

### JWT Generation Error: "Key must be either PEM EC key or base64 Ed25519 key"

**Problem:** Agent logs show:
```
ValueError: Failed to generate JWT: Key must be either PEM EC key or base64 Ed25519 key
```

**Root Causes & Solutions:**

1. **Wrong Algorithm Selected (Most Common)**
   - **Cause:** You created the CDP API key with Ed25519 algorithm instead of ECDSA (ES256)
   - **Solution:** 
     - Go back to [CDP Portal](https://portal.cdp.coinbase.com/)
     - Delete the existing API key
     - Create a NEW API key
     - **Select "ECDSA (ES256)" in the algorithm dropdown**
     - Copy the new credentials to your `.env` file

2. **Malformed Private Key**
   - **Cause:** The `CDP_API_KEY_SECRET` is missing PEM headers or has been altered
   - **Solution:** Ensure your `.env` file contains the COMPLETE key:
     ```bash
     CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
     MHcCAQEEIAbC...
     ...all the base64 content...
     -----END EC PRIVATE KEY-----
     ```
   - Must include `-----BEGIN EC PRIVATE KEY-----` and `-----END EC PRIVATE KEY-----`

3. **Line Break Issues**
   - **Cause:** The private key was pasted as a single line or with escaped newlines
   - **Solution:** In `.env` files, you can use multi-line format:
     ```bash
     CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
     MHcCAQEEIAbC...
     -----END EC PRIVATE KEY-----
     ```
   - Alternatively, use escaped newlines: `CDP_API_KEY_SECRET="-----BEGIN EC PRIVATE KEY-----\nMHc...\n-----END EC PRIVATE KEY-----"`

4. **API Key Not Saved Immediately**
   - **Cause:** CDP only shows the API key secret ONCE when created
   - **Solution:** If you didn't save it, you must delete and create a new API key

**Quick Check:**
```bash
# Verify your CDP_API_KEY_SECRET starts with this exact text:
cat agents/trump-melania/.env | grep CDP_API_KEY_SECRET

# Should show:
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
```

### "Wallet Secret not configured" Error

**Problem:** Agent logs show:
```
ValueError: Wallet Secret not configured. Please set the CDP_WALLET_SECRET environment variable
```

**This is NORMAL and expected behavior!**

**Explanation:**
- By default, agents use **Direct RPC mode** (their own wallets via `SOLANA_PRIVATE_KEY`)
- CDP is used ONLY for x402scan registration, not for sending transactions
- You will see this warning, but transactions will succeed via direct RPC fallback
- The transaction will still be sent successfully - just via direct RPC instead of CDP

**What's Happening:**
```
⚠️ CDP submission failed, using direct RPC: Wallet Secret not configured...
✅ Transaction sent via direct RPC
   Signature: abc123...
```

This is the **correct behavior** for the Pardon Simulator! No action needed.

**If you want to use CDP for transaction sending (optional):**

1. Add to your `.env`:
   ```bash
   CDP_ENABLE_TRANSACTION_SENDING=true
   CDP_WALLET_SECRET=<your-wallet-secret>
   ```

2. The `CDP_WALLET_SECRET` is different from `CDP_API_KEY_SECRET`:
   - `CDP_API_KEY_SECRET`: API credentials for CDP platform
   - `CDP_WALLET_SECRET`: The actual wallet seed/private key that CDP manages

3. **Note:** This is generally NOT recommended for Pardon Simulator since you're already managing wallets with `SOLANA_PRIVATE_KEY`.

### CDP SDK Connection Issues

**Problem:** Unable to initialize CDP client

**Solutions:**
- Verify API credentials are correct (see JWT error above)
- Check network connectivity
- Ensure CDP SDK is up to date: `pip install --upgrade cdp-sdk`
- Review CDP service status

### Transaction Failures

**Problem:** Payments not going through

**Solutions:**
- Check wallet balance has sufficient SOL
- Verify recipient address is correct
- Check Solana RPC endpoint status
- Review transaction logs for errors

### x402 Protocol Errors

**Problem:** Payment requests not being detected

**Solutions:**
- Verify HTTP 402 status code is returned
- Check x402 headers are included
- Review payment request format
- See [X402_PROTOCOL_COMPLIANCE.md](./X402_PROTOCOL_COMPLIANCE.md) for details

---

## Testing

### Verify CDP Integration

```python
# Test CDP initialization
from cdp import CdpClient
import os

# Set environment variables (CDP SDK reads these automatically)
os.environ['CDP_API_KEY_ID'] = os.getenv("CDP_API_KEY_ID")
os.environ['CDP_API_KEY_SECRET'] = os.getenv("CDP_API_KEY_SECRET")

# Initialize
cdp_client = CdpClient()

print("✅ CDP SDK initialized successfully")
```

### Test Payment Flow

```python
# Test payment request creation
payment_req = await request_premium_service(
    service_type="test_service",
    recipient_name="test-agent",
    recipient_address="<test-wallet-address>",
    amount_sol=0.01
)

print(f"✅ Payment request created: {payment_req}")
```

---

## Additional Resources

- **CDP SDK Documentation**: [Coinbase Developer Platform](https://docs.cdp.coinbase.com/)
- **x402 Protocol**: [X402_PROTOCOL_COMPLIANCE.md](./X402_PROTOCOL_COMPLIANCE.md)
- **Agent Setup**: [AGENTS.md](./AGENTS.md)
- **Agent Overview**: [AGENT_OVERVIEW.md](./AGENT_OVERVIEW.md)

---

## Support

For issues related to:
- **CDP SDK**: Refer to Coinbase Developer Platform documentation
- **x402 Protocol**: See X402_PROTOCOL_COMPLIANCE.md
- **Agent Implementation**: See AGENTS.md
- **General Setup**: See SETUP.md


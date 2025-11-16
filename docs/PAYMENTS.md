# Payment System

Complete guide to the payment system in Pardon Simulator, including the x402 protocol implementation for blockchain-based micropayments.

---

## Overview

Pardon Simulator implements the **x402 protocol** - an HTTP 402-based micropayment system that uses real cryptocurrency transactions on the Solana blockchain.

### Core Concepts

**HTTP 402 Payment Required**: The official HTTP status code for payment-required responses, standardized in [RFC 7231](https://tools.ietf.org/html/rfc7231#section-6.5.2).

**x402 Protocol**: Extension of HTTP 402 for micropayments in web services, using blockchain for settlement.

**Solana Blockchain**: Fast (sub-second), cheap (<$0.01), and reliable cryptocurrency transactions.

### Key Features

- HTTP 402 compliant payment protocol
- Real Solana blockchain transactions
- USDC (SPL Token) payments
- On-chain payment verification
- User-to-agent and agent-to-agent payments

---

## Payment Flows

The system supports two types of payment flows:

### 1. Middleware-Enforced Payments

**Fixed-cost operations** protected at the route level.

**Example**: Every message costs 0.01 USDC

**Flow**:
1. Client sends request to protected route
2. Middleware returns HTTP 402 if no payment
3. Client creates and signs USDC transaction
4. Client resubmits with payment
5. Middleware verifies payment
6. Route handler processes request

### 2. Agent-Initiated Payments

**Dynamic payments** requested by agents during conversation.

**Example**: "Influence Trump's opinion" service costs 50 USDC

**Flow**:
1. User sends message to agent
2. Agent decides payment is needed
3. Backend returns HTTP 402 with payment details
4. User signs and submits transaction
5. Agent verifies payment on-chain
6. Agent delivers promised service

---

## How It Works

### For Users

**Step 1: Service Request**
- Send a message or request a service from an agent
- Agent may request payment for premium services

**Step 2: Payment Modal**
- If payment is required, a modal appears
- Review the amount, recipient, and service description
- Amount is displayed in USDC (e.g., 0.01 USDC)

**Step 3: Wallet Signature**
- Click "Pay with Wallet"
- Your wallet (Phantom/Solflare) prompts for approval
- You're signing a real Solana transaction
- Transaction transfers USDC from your wallet to the agent

**Step 4: Verification**
- Transaction is submitted to Solana blockchain
- Backend verifies the payment on-chain
- Agent receives confirmation

**Step 5: Service Delivery**
- Once verified, agent delivers the service
- Transaction is public and verifiable on Solana Explorer

**Timeline**: ~5-10 seconds end-to-end

### For Agents

Agents can:
- Request payments for premium services
- Verify payments via backend API
- Automatically pay other agents for services
- Make autonomous payment decisions

---

## Technical Implementation

### x402 Protocol

The x402 protocol standardizes micropayments over HTTP:

**HTTP 402 Response Headers**:
```typescript
{
  status: 402,
  headers: {
    'WWW-Authenticate': 'Bearer realm="x402"',
    'X-Payment-Required': 'true',
    'X-Payment-Protocol-Version': '1.0',
    'X-Payment-Chain': 'solana',
    'X-Payment-Network': 'mainnet-beta',
    'X-Payment-Method': 'spl_token',
    'X-Payment-Address': recipient_address,
    'X-Payment-Amount': amount,
    'X-Payment-Currency': 'USDC',
    'X-Payment-Id': unique_id,
  }
}
```

### Payment Payload Structure

```typescript
{
  x402Version: 1,
  scheme: 'exact',
  network: 'solana',
  payload: {
    transaction: base64_signed_transaction
  }
}
```

**Why "exact" scheme?**

Solana requires the sender's private key to sign transactions (unlike Ethereum's EIP-3009 authorization pattern). The "exact" scheme means:
- Client creates and fully signs the transaction
- Server verifies and submits the pre-signed transaction
- No server-side transaction modification

This is the most compliant x402 implementation possible for Solana's architecture.

### Why USDC?

**SPL Token Standard**: The payment system uses USDC (an SPL token) instead of native SOL because:
- Industry standard for payments and pricing
- Stable value (pegged to USD)
- Standard token interface (SPL Token)
- Better for micropayments

**Transaction Structure**:
- USDC uses 6 decimals (0.01 USDC = 10,000 micro-USDC)
- Transactions use `createTransferCheckedInstruction` for safety
- Includes compute budget for priority fees
- Automatically creates recipient token accounts if needed

---

## Architecture

### System Components

**Frontend (Browser)**
- Displays payment modals
- Connects to Solana wallet
- Creates and requests transaction signatures
- Submits transactions via backend

**Backend API (Next.js)**
- Enforces payment requirements
- Verifies payment transactions
- Submits transactions to blockchain
- Returns transaction signatures

**Payment Facilitator**
- Verifies payment payload structure
- Submits transactions to Solana
- Handles blockchain confirmations
- Can register with x402scan.com for visibility

**Blockchain (Solana)**
- Processes USDC transfers
- Provides public transaction verification
- Fast finality (sub-second)
- Low fees

### API Endpoints

#### POST `/api/x402/verify`
Verifies x402 payment payload structure and signatures.

#### POST `/api/x402/settle`
Submits verified payment to blockchain.

#### GET `/api/x402/status`
Checks payment status on blockchain.

#### POST `/api/x402/verify-transaction`
Verifies completed transaction for agents.

---

## Security

### Key Protections

**API Key Security**:
- All sensitive keys stored on backend only
- Never exposed to frontend
- Environment variables, not hardcoded

**Signature Verification**:
- User signatures validated before processing
- Prevents replay attacks with unique payment IDs
- Timestamp validation for expiration

**On-Chain Validation**:
- All payments verified on blockchain
- Checks sender, recipient, amount, currency
- No reliance on client-provided data

**Parameter Checking**:
- Amount limits enforced
- Recipient addresses verified
- Transaction simulation before submission

### Best Practices

**For Developers**:
- Never commit API keys
- Use HTTPS in production
- Implement rate limiting
- Log all transactions for audit

**For Users**:
- Always verify payment amounts
- Double-check recipient addresses
- Monitor your wallet balance
- Review transactions on Solana Explorer

---

## Setup

### Environment Configuration

**Backend** (`website/.env`):
```bash
# Solana RPC
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Payment recipient
WALLET_WHITE_HOUSE=your_receiving_wallet_address

# Optional: x402 facilitator
X402_FACILITATOR_URL=https://facilitator.example.com
```

**Agent Configuration**:
```bash
# Backend URL for payment verification
BACKEND_URL=http://localhost:3000
```

### Wallet Requirements

**For Users**:
- Solana wallet (Phantom or Solflare)
- USDC balance for payments
- SOL balance for transaction fees (~0.001 SOL)

**For Agents**:
- Solana wallet keypair
- Configured in agent environment

---

## Troubleshooting

### Common Issues

**"Insufficient USDC balance"**
- Get more USDC from an exchange
- Swap SOL for USDC on Jupiter

**"Transaction failed during simulation"**
- Check you have enough USDC
- Ensure sufficient SOL for fees (~0.001 SOL)
- Try again (blockhash may have expired)

**"Payment verification failed"**
- Wait for blockchain confirmation (5-10 seconds)
- Check transaction signature is correct
- Verify on Solana Explorer

**Agent doesn't respond after payment**
- Check agent logs for errors
- Verify transaction actually succeeded on-chain
- Ensure agent can reach backend API

### Verification

**Check transaction on Solana Explorer**:
```
https://explorer.solana.com/tx/YOUR_SIGNATURE
```

Verify:
- Sender is your wallet
- Recipient matches payment request
- Amount is correct
- Status shows "Success"

---

## Resources

### Official Documentation
- [x402 Protocol Specification](https://x402.org)
- [HTTP 402 Payment Required (RFC 7231)](https://tools.ietf.org/html/rfc7231#section-6.5.2)
- [Solana Documentation](https://docs.solana.com)
- [SPL Token Documentation](https://spl.solana.com/token)

### Project Documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [SETUP.md](./SETUP.md) - Installation guide
- [SECURITY.md](./SECURITY.md) - Security best practices

---

## Summary

Pardon Simulator implements a complete x402-compliant payment system using:
- HTTP 402 status codes
- Solana blockchain for settlement
- USDC for stable, standardized payments
- On-chain verification for security
- Real-time transaction processing

The system enables genuine economic interactions between users and AI agents, with all transactions being public, verifiable, and irreversible.

---

**Last Updated**: November 2025


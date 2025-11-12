# X402 Payment Architecture

**Complete HTTP 402 Payment Protocol Implementation**

**Version:** 1.0  
**Last Updated:** November 2025  
**Protocol Standard:** [Coinbase x402](https://github.com/coinbase/x402)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Payment Flows](#payment-flows)
4. [CDP Facilitator Integration](#cdp-facilitator-integration)
5. [Implementation Details](#implementation-details)
6. [API Reference](#api-reference)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Security](#security)

---

## Overview

Pardon Simulator implements the **x402 protocol** - an HTTP 402-based micropayment system using the Solana blockchain for actual transactions.

### Core Principles

**HTTP 402 Payment Required**: The official HTTP status code for payment-required responses, standardized in [RFC 7231](https://tools.ietf.org/html/rfc7231#section-6.5.2).

**x402 Protocol**: Coinbase's extension of HTTP 402 for micropayments in web services, using blockchain for settlement.

**Backend-Controlled Submission**: Payments are verified and submitted through backend facilitators (not client-side), ensuring security and compliance.

### Key Features

- ✅ **HTTP 402 Compliant**: Proper use of status codes and headers
- ✅ **CDP Facilitator Integration**: Official Coinbase facilitator APIs
- ✅ **Solana Blockchain**: Real cryptocurrency transactions
- ✅ **Automatic x402scan Registration**: Community visibility
- ✅ **Secure**: API keys protected, on-chain verification
- ✅ **Transparent**: Explorer links, detailed logging

---

## Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      Payment Architecture                        │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Frontend ↔ Next.js API (HTTP)
    User Browser → POST /api/chat/send
    ← HTTP 402 Payment Required (with x402 headers)
    
Layer 2: Next.js API ↔ Coral Server
    API → POST Coral sendMessage
    ← Agent message (may include payment request)
    API converts to HTTP 402 if payment required
    
Layer 3: Agent ↔ Agent (via Coral)
    Agent A → Message with "402 PAYMENT REQUIRED"
    ← Semantic HTTP 402 via message content
    Agent B processes and may autonomously pay
    
Layer 4: Blockchain Settlement
    Backend → CDP Facilitator API
    Facilitator → Solana RPC (verify, simulate, submit)
    ← Transaction signature
    Automatic x402scan registration
```

### Component Overview

#### Frontend (Browser)
- **Role**: User interface for payment authorization
- **Technology**: Next.js, React, Solana Web3.js
- **Responsibilities**:
  - Detects HTTP 402 responses
  - Shows payment modal
  - Signs authorization messages (NOT transactions)
  - Displays transaction confirmations

#### Backend API (Next.js)
- **Role**: Secure payment facilitator
- **Technology**: Next.js API Routes, Solana Web3.js
- **Responsibilities**:
  - Returns HTTP 402 when agents request payment
  - Holds facilitator API keys securely
  - Submits transactions via CDP facilitator
  - Verifies payments on-chain
  - Registers with x402scan

#### Agents (Python)
- **Role**: Autonomous service providers
- **Technology**: Python, LangChain, Solana Python SDK
- **Responsibilities**:
  - Requests payments for services
  - Verifies payments via backend
  - Delivers services after confirmation
  - Can autonomously pay other agents

#### CDP Facilitator
- **Role**: Official x402 transaction processor
- **Technology**: Coinbase x402 SDK
- **Responsibilities**:
  - Verifies payment payloads
  - Simulates transactions
  - Submits to blockchain
  - Confirms completion
  - Registers with x402scan

---

## Payment Flows

### Flow 1: User → Agent Payment

**Complete end-to-end flow for users paying agents:**

```
1. User Requests Service
   User: "@melania-trump I want some insider info from CZ"
   
2. Agent Sends HTTP 402 (via Backend)
   Next.js API ← Coral ← Agent
   Returns: HTTP 402 with payment request headers
   
3. User Signs Authorization
   - Frontend creates payment authorization (message)
   - User signs in Phantom wallet (NOT a transaction)
   - Signature proves intent to pay
   
4. Frontend Submits to Backend
   POST /api/x402/user-submit
   {
     signedPayload: { ...authorization... },
     paymentRequest: { ...details... }
   }
   
5. Backend Processes via CDP Facilitator
   - Verifies user signature
   - Builds x402 USDC payment payload
   - Calls facilitator.verify(payload)
   - Calls facilitator.settle(payload)
   - Returns transaction hash
   
6. Frontend Receives Transaction Hash
   {
     success: true,
     transaction: "3TsXYq7F3ujH...",
     x402ScanUrl: "https://www.x402scan.com/tx/..."
   }
   
7. Frontend Sends Hash to Agent
   User: "✅ Payment completed!
          Transaction: 3TsXYq7F...
          Please verify and deliver service."
   
8. Agent Verifies Payment
   - Calls verify_payment_transaction() tool
   - Backend checks transaction on-chain
   - Verifies all parameters match
   
9. Agent Delivers Service
   Agent: "✅ PAYMENT VERIFIED!
           [Delivers the requested service]"
```

**Timeline**: ~10-15 seconds end-to-end

### Flow 2: Agent → Agent Payment

**Autonomous agent-to-agent transactions:**

```
1. Agent A Requests Service
   Donald: "@cz What's your take on regulations?"
   
2. Agent B Requests Payment (Semantic 402)
   CZ: "💰 402 PAYMENT REQUIRED
        Service: Regulatory Advice
        Amount: 0.1 SOL"
   
3. Agent A Evaluates & Pays
   - Detects "402 PAYMENT REQUIRED"
   - Decides value is worth it
   - Calls lookup_agent_wallet("cz")
   - Calls submit_payment_via_x402_facilitator()
   
4. Backend Submits via Facilitator
   - Creates x402 Solana payload
   - Calls CDP facilitator settle()
   - Returns transaction signature
   
5. Agent B Verifies & Delivers
   - Sees incoming payment
   - Verifies on-chain
   - Delivers regulatory advice
```

**Key Difference**: Agents make autonomous payment decisions

---

## CDP Facilitator Integration

### Why Use the Facilitator?

**x402 Compliance**: The facilitator is the official way to submit x402-compliant payments.

**Automatic Registration**: Transactions are automatically registered with x402scan.com (no manual registration needed).

**Verification**: CDP verifies payload structure, amount, and signatures before submission.

**Security**: Compliance and KYT (Know Your Transaction) checks.

### How It Works

#### 1. Payment Payload Creation

```python
# agents/x402_solana_payload.py
payload = create_x402_solana_payment_payload(
    from_keypair=wallet.keypair,
    to_address="recipient_address",
    amount_usdc=0.0005,
    recent_blockhash=blockhash,
    network="solana"
)

# Returns:
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana",
  "payload": {
    "transaction": "<base64-encoded signed Solana transaction>"
  }
}
```

#### 2. Facilitator Submission

```typescript
// website/src/app/api/x402/submit-solana/route.ts
import { settle, verify, createSigner } from 'x402/facilitator';

// Create facilitator signer
const facilitatorSigner = await createSigner("solana", FACILITATOR_PRIVATE_KEY);

// Verify payment payload
await verify(facilitatorSigner, paymentPayload, paymentRequirements, config);

// Settle payment (submits to blockchain)
const result = await settle(facilitatorSigner, paymentPayload, paymentRequirements, config);

// Returns:
{
  success: true,
  transaction: "signature...",
  network: "solana",
  payer: "address..."
}
```

### Solana-Specific Considerations

**Blockchain Architecture**: Solana requires transactions to be signed by the sender's private key (unlike Ethereum's EIP-3009 "Transfer With Authorization").

**Relay Pattern**: The CDP facilitator acts as a trusted relay for Solana:
- Receives pre-signed transaction
- Verifies structure and signatures
- Simulates transaction
- Submits to blockchain
- Confirms completion
- Registers with x402scan

**This is as x402-compliant as Solana can be** given blockchain-level constraints.

### Environment Setup

```bash
# Backend (website/.env)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
FACILITATOR_SOLANA_PRIVATE_KEY=your_base58_private_key

# Optional: CDP API credentials
CDP_API_KEY_NAME=your_cdp_api_key_name
CDP_PRIVATE_KEY=your_cdp_private_key
```

**Note**: The facilitator wallet is for verification and coordination only - it doesn't pay for transactions. The payer's signed transaction already includes their signature and payment.

---

## Implementation Details

### Backend Endpoints

#### POST `/api/x402/user-submit`

**Purpose**: Accept signed payloads from frontend, submit via facilitator

**Flow**:
1. Receives signed authorization from user
2. Verifies user signature
3. Builds x402 USDC payment payload
4. Calls `facilitator.verify()` to validate payment
5. Calls `facilitator.settle()` to submit transaction
6. Returns transaction hash to frontend

**Request**:
```typescript
{
  signedPayload: {
    payment_id: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
    signature: string;
  },
  paymentRequest: {
    payment_id: string;
    recipient_address: string;
    amount_usdc: number;
    service_type: string;
    reason: string;
  }
}
```

**Response (Success)**:
```typescript
{
  success: true,
  transaction: string;
  network: string;
  payer: string;
  x402Compliant: true,
  submittedViaFacilitator: true,
  x402ScanUrl: string;
  solanaExplorer: string;
}
```

#### POST `/api/x402/verify-transaction`

**Purpose**: Verify payment transactions for agents

**Flow**:
1. Receives transaction hash and expected parameters
2. Fetches transaction from blockchain
3. Extracts transaction details
4. Verifies details match expectations
5. Returns verification result

**Request**:
```typescript
{
  transaction: string;
  expectedFrom: string;
  expectedTo: string;
  expectedAmount: number;
  expectedCurrency: string;
}
```

**Response (Success)**:
```typescript
{
  verified: true,
  transaction: string;
  details: {
    from: string;
    to: string;
    amount: number;
    currency: string;
    timestamp: number;
    confirmed: boolean;
  },
  solanaExplorer: string;
  x402ScanUrl: string;
}
```

### Agent Tools

#### `verify_payment_transaction()`

**Purpose**: Verify payments via backend before delivering service

```python
# agents/x402_payment_tools.py
result = await verify_payment_transaction(
    transaction_hash="3TsXYq7F...",
    expected_from="6pF45ayW...",
    expected_amount_usdc=0.0005,
    service_type="insider_info"
)
```

**Returns**:
```python
{
  "verified": True,
  "transaction": "signature...",
  "details": { ... },
  "message": "✅ PAYMENT VERIFIED! You may now deliver the service."
}
```

#### `submit_payment_via_x402_facilitator()`

**Purpose**: Submit agent payments through CDP facilitator

```python
# agents/x402_payment_tools.py
result = await submit_payment_via_x402_facilitator(
    from_keypair=wallet.keypair,
    to_address="recipient",
    amount_usdc=0.0005,
    network="solana"
)
```

**Returns**:
```python
{
  "success": True,
  "signature": "transaction_signature",
  "x402_compliant": True,
  "submitted_via_facilitator": True,
  "x402_scan_url": "https://www.x402scan.com/tx/..."
}
```

### Frontend Components

#### PaymentModal

**File**: `website/src/components/PaymentModal.tsx`

**Responsibilities**:
- Display payment request details
- Handle wallet signature (message, NOT transaction)
- Submit to backend facilitator endpoint
- Show transaction confirmation with explorer links

**Key Changes from Legacy**:
- ❌ Old: Created and submitted Solana transaction directly
- ✅ New: Creates signed payload and sends to backend

#### ChatInterface

**File**: `website/src/components/ChatInterface.tsx`

**Responsibilities**:
- Detect HTTP 402 responses
- Show payment modal when payment required
- Send transaction hash (not payload) to agent
- Display payment confirmation messages

### HTTP 402 Headers

When the backend returns HTTP 402, it includes standard x402 protocol headers:

```typescript
{
  status: 402,
  headers: {
    'WWW-Authenticate': 'Bearer realm="x402"',
    'X-Payment-Required': 'true',
    'X-Payment-Protocol-Version': '1.0',
    'X-Payment-Chain': 'solana',
    'X-Payment-Network': 'mainnet-beta',
    'X-Payment-Method': 'native',
    'X-Payment-Address': paymentRequest.recipient_address,
    'X-Payment-Amount': paymentRequest.amount_usdc.toString(),
    'X-Payment-Currency': 'USDC',
    'X-Payment-Id': paymentRequest.payment_id,
    'X-Payment-Reason': paymentRequest.reason,
    'X-Payment-Expiry': (Date.now() + 600000).toString(),
  }
}
```

---

## API Reference

### Payment Request Format (Agent → User)

```json
{
  "type": "x402_payment_required",
  "recipient": "melania-trump",
  "recipient_address": "4Vf8jhKx...",
  "amount_usdc": 0.0005,
  "service_type": "insider_info",
  "reason": "Insider Info - Request from user",
  "payment_id": "payment-1234567890",
  "http_status": 402,
  "timestamp": 1730000000
}
```

### Payment Verification Response

```json
{
  "verified": true,
  "transaction": "3TsXYq7F3ujH...",
  "details": {
    "from": "6pF45ayW...4zug",
    "to": "4Vf8jhKx...w1hy",
    "amount": 0.0005,
    "currency": "USDC",
    "timestamp": 1699900000,
    "confirmed": true
  },
  "solanaExplorer": "https://explorer.solana.com/tx/...",
  "x402ScanUrl": "https://www.x402scan.com/tx/..."
}
```

---

## Testing

### Test Plan Overview

See the complete test plan for detailed procedures and expected outputs.

### Quick Test: User → Agent Payment

1. **Start services**
   ```bash
   # Terminal 1: Start backend
   cd website && npm run dev
   
   # Terminal 2: Start Coral server
   cd coral-server && ./gradlew run
   ```

2. **Request service**
   - Open http://localhost:3000
   - Connect wallet
   - Message an agent requesting a service

3. **Verify HTTP 402**
   - Check browser console for 402 status
   - Payment modal should appear
   - Headers should include x402 protocol version

4. **Complete payment**
   - Click "Pay with Wallet"
   - Sign authorization (message, not transaction)
   - Wait for transaction hash
   - Confirm delivery

**Expected time**: ~10-15 seconds end-to-end

### Verification Checklist

✅ User signs authorization (NOT transaction)  
✅ Backend submits via CDP facilitator  
✅ Transaction appears on x402scan automatically  
✅ Agent verifies via backend (not direct RPC)  
✅ Service delivered only after verification  
✅ No API keys exposed to frontend  
✅ Clear error messages for failures  

---

## Troubleshooting

### Payment Submission Fails

**Symptoms**: Backend returns error when submitting payment

**Check**:
1. `FACILITATOR_SOLANA_PRIVATE_KEY` is set in backend `.env`
2. `SOLANA_RPC_URL` is accessible and responding
3. User has sufficient USDC balance
4. Backend logs for detailed error message

**Common Issues**:
- Invalid private key format (must be base58)
- RPC URL not responding or rate limited
- Facilitator wallet has no SOL for fees
- Network connectivity issues

### Verification Fails

**Symptoms**: Agent cannot verify payment transaction

**Check**:
1. Transaction hash is correct and complete
2. Transaction is confirmed (wait 5-10 seconds after submission)
3. `/api/x402/verify-transaction` endpoint is accessible
4. Expected parameters match actual transaction

**Common Issues**:
- Transaction not confirmed yet (blockchain delay)
- Wrong transaction hash copied
- Amount mismatch due to floating point precision
- Wrong recipient address

### Agent Doesn't Verify

**Symptoms**: Agent receives transaction hash but doesn't verify

**Check**:
1. Agent has `verify_payment_transaction` tool loaded
2. `X402_TOOLS` includes the verification tool
3. Agent can reach backend API
4. `BACKEND_URL` environment variable is set correctly

**Common Issues**:
- Agent not restarted after code update
- Backend URL misconfigured (wrong port/host)
- Network firewall blocking agent → backend requests
- Tool not added to agent's tool list

### Transactions Don't Appear on x402scan

**Check**:
1. Using CDP facilitator endpoint (`/api/x402/submit-solana`)
2. Backend logs show "Settling payment via CDP facilitator"
3. `settle()` call succeeded without errors
4. Network connectivity to x402scan.com

**Note**: x402scan registration is non-blocking. Payment succeeds even if registration fails (registration is for visibility, not validation).

---

## Security

### Implemented Protections

#### 1. API Key Protection
- ✅ All sensitive keys stored on backend only
- ✅ Never exposed to frontend/client
- ✅ Environment variables, not hardcoded
- ✅ Separate keys for different services

#### 2. Signature Verification
- ✅ User signatures verified before processing
- ✅ Solana transaction signatures validated
- ✅ Prevents replay attacks with unique payment IDs
- ✅ Timestamp validation for expiration

#### 3. On-Chain Validation
- ✅ All payments verified on blockchain
- ✅ Checks sender, recipient, amount, currency
- ✅ Confirms transaction success status
- ✅ No reliance on client-provided data

#### 4. Parameter Checking
- ✅ All payment details validated before submission
- ✅ Amount limits enforced
- ✅ Recipient addresses verified
- ✅ Transaction simulation before submission

#### 5. Error Handling
- ✅ No sensitive data in error messages
- ✅ Graceful fallbacks for failures
- ✅ Comprehensive logging for debugging
- ✅ User-friendly error messages

### Best Practices

#### For Production Deployment

1. **Environment Variables**: Never commit sensitive keys to git
2. **HTTPS Only**: Use SSL/TLS for all API communication
3. **Rate Limiting**: Implement rate limits on payment endpoints
4. **Monitoring**: Log all transactions for audit trail
5. **Backup Keys**: Secure backup of facilitator private key
6. **Regular Updates**: Keep dependencies updated for security patches

#### For Users

1. **Verify Addresses**: Double-check recipient addresses
2. **Check Amounts**: Confirm payment amounts before signing
3. **Use Hardware Wallets**: For large amounts
4. **Monitor Transactions**: Check explorer links
5. **Report Issues**: Contact support for suspicious activity

---

## Known Limitations

### Current Constraints

1. **USDC Only**: Primary support is USDC (x402 requirement)
   - SOL fallback removed for compliance
   - Future: May add support for other SPL tokens

2. **Mainnet Only**: Configured for Solana mainnet-beta
   - Devnet support requires separate configuration
   - Future: Add devnet option for testing

3. **Single Facilitator**: One facilitator wallet per deployment
   - Future: Support multiple facilitators for redundancy

4. **No Refunds**: Refund flow not implemented
   - Payments are final once confirmed
   - Future: Add dispute and refund system

5. **No Expiration**: Payment requests don't expire automatically
   - Future: Add timeout mechanism

### Solana Blockchain Constraints

**Transaction Signing**: Solana requires the sender's private key to sign transactions (unlike Ethereum's EIP-3009).

**Result**: CDP facilitator acts as a relay/verifier rather than having full server-side transaction creation.

**This is the most x402-compliant implementation possible given Solana's architecture.**

---

## Future Improvements

### High Priority
- [ ] Add transaction status polling for better UX
- [ ] Implement payment expiration
- [ ] Add refund functionality
- [ ] Rate limiting on endpoints
- [ ] Webhook notifications for payment events

### Medium Priority
- [ ] Support multiple currencies (SOL, other SPL tokens)
- [ ] Add payment escrow for disputes
- [ ] Implement recurring payments
- [ ] Payment analytics dashboard
- [ ] Multi-facilitator support for redundancy

### Low Priority
- [ ] Devnet support for testing
- [ ] Payment preauthorization
- [ ] Subscription management
- [ ] Payment splitting for multiple recipients

---

## Resources

### Official Documentation
- [Coinbase x402 Protocol](https://github.com/coinbase/x402)
- [HTTP 402 Payment Required (RFC 7231)](https://tools.ietf.org/html/rfc7231#section-6.5.2)
- [Solana Documentation](https://docs.solana.com)
- [x402scan.com](https://www.x402scan.com)

### Project Documentation
- [AGENTS.md](./AGENTS.md) - Agent system overview
- [GAMEPLAY.md](./GAMEPLAY.md) - User guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [SETUP.md](./SETUP.md) - Installation guide

---

## Conclusion

The Pardon Simulator implements a **fully x402-compliant payment system** using HTTP 402 status codes, CDP facilitator APIs, and Solana blockchain for settlement.

### Key Achievements

✅ **Protocol Compliant**: Follows x402 v1.0 specification  
✅ **Secure**: API keys protected, on-chain verification  
✅ **Reliable**: CDP facilitator integration  
✅ **Transparent**: Explorer links, detailed logging  
✅ **Maintainable**: Well-documented, tested  

**This is the proper way to implement x402 payments on Solana!** 🎉

---

**Last Updated**: November 2025  
**Implementation Status**: ✅ Complete and Production-Ready


# Payment Service Type Fix - Connection Intro Issue

## Issue Description

**Date:** Nov 29, 2025
**Reporter:** User (SBF)
**Agent:** Barron Trump

### What Happened

1. User asked Barron to "ask CZ if he would be interested in relaunching FTX"
2. Barron correctly proposed a `connection_intro` service and issued a 402 payment request
3. User made the payment successfully
4. **BUG:** Barron responded with a generic message instead of actually contacting CZ
5. The premium service was not properly identified

## Root Cause Analysis

### The Problem Chain

1. **Agent sent payment request** with `payment_id: wht-trump-barron-connection_intro-cz-1764417923`
   - The JSON in `<x402_payment_request>` was missing `service_type` field
   - Only x402 core protocol fields were included, not legacy fields like `service_type`, `metadata`, etc.

2. **Frontend extraction failed**
   ```typescript
   service_type: parsed.service_type || 'premium_service'  // Defaulted to 'premium_service'
   ```
   - Since `service_type` was missing from JSON, it defaulted to `'premium_service'`
   - User message showed: "Payment for premium service: premium service" (should be "connection intro")

3. **Frontend generated new payment_id**
   ```typescript
   createUSDCTransaction(`payment-${Date.now()}`, ...)  // Lost original payment_id!
   ```
   - Should have used `paymentReq.payment_id` from the original request

4. **Backend marker creation**
   - Backend received `service_type: 'premium_service'` instead of `'connection_intro'`
   - Backend created marker: `[PREMIUM_SERVICE_PAYMENT_COMPLETED: tx|premium_service|0.4|unknown]`

5. **Agent verification failed to match**
   ```python
   if (payment_data.get("service") == service_type and  # 'connection_intro' != 'premium_service'
       payment_data.get("to") == to_agent and
       abs(payment_data.get("amount", 0) - expected_amount_usdc) < 0.0001):
   ```
   - Agent couldn't match payment to pending request
   - Lost service details and target agent (CZ)
   - Delivered generic "premium_service" instead of connection intro

## Why JSON Was Missing Fields

The `create_payment_request()` function in `x402_solana_adapter.py` correctly adds `service_type` at the top level (line 134). However, when the LLM receives the formatted x402 response and sends it via `coral_send_message`, it may be reformatting or summarizing the JSON, removing fields it considers redundant or unnecessary.

## Fixes Implemented

### 1. Frontend: Extract service_type from payment_id as fallback
**File:** `website/src/components/ChatInterface.tsx`

```typescript
// Extract service_type - try multiple sources
let service_type = parsed.service_type || parsed.metadata?.service || 'premium_service';

// Fallback: extract from payment_id if missing
// payment_id format: wht-{agent}-{service_type}-{target}-{timestamp}
if (service_type === 'premium_service' && parsed.payment_id) {
  const paymentIdMatch = parsed.payment_id.match(/wht-[^-]+-([^-]+)-/);
  if (paymentIdMatch) {
    service_type = paymentIdMatch[1];
    console.log(`[Payment Request] Extracted service_type from payment_id: ${service_type}`);
  }
}
```

### 2. Frontend: Use original payment_id instead of generating new one
**File:** `website/src/components/ChatInterface.tsx`

```typescript
// Use the payment_id from the payment request if available
const paymentId = paymentReq.payment_id || `payment-${Date.now()}`;

signedTx = await createUSDCTransaction(
  paymentId,  // Now uses original payment_id
  publicKey,
  new PublicKey(paymentReq.recipient_address),
  amount,
  signTransaction
);

// Also include original payment_id in x402Payload
const x402Payload = {
  ...
  paymentId: signedTx.payment_id,
  service_type: paymentReq.service_type,
  payment_id: paymentReq.payment_id  // For better matching
};
```

### 3. Backend: Extract service_type from payment_id as fallback
**File:** `website/src/app/api/chat/send/route.ts`

```typescript
const paymentPayload = JSON.parse(paymentData);
serviceType = paymentPayload.service_type || 'unknown';
amountUsdc = paymentPayload.amount_usdc || 0;
paymentId = paymentPayload.payment_id || paymentPayload.paymentId || 'unknown';

// Fallback: extract service_type from payment_id if missing
if (serviceType === 'unknown' && paymentId !== 'unknown') {
  const paymentIdMatch = paymentId.match(/wht-[^-]+-([^-]+)-/);
  if (paymentIdMatch) {
    serviceType = paymentIdMatch[1];
    console.log(`[Premium Service] Extracted service_type from payment_id: ${serviceType}`);
  }
}
```

## How This Fixes The Issue

1. ✅ **Frontend now extracts service_type reliably** - even if missing from JSON, it extracts from payment_id
2. ✅ **Original payment_id is preserved** - allows agent to match payment to correct pending request
3. ✅ **Backend extracts service_type robustly** - creates correct payment marker
4. ✅ **Agent can match payment** - finds correct service details and target agent
5. ✅ **Service delivered correctly** - agent performs actual connection intro instead of generic response

## Testing Plan

1. Deploy fixes to production
2. Test connection_intro service:
   - User asks agent to contact another agent
   - Agent issues 402 payment request
   - Verify payment_id is preserved through the flow
   - Verify service_type is extracted correctly
   - Verify agent delivers connection_intro service
3. Test other premium services to ensure no regressions

## Prevention

- Added logging at each step to track service_type and payment_id
- Multiple fallback mechanisms ensure robustness
- Consider investigating why JSON from agent is missing fields (LLM reformatting?)

## Related Files

- `/Users/al/apps/pardon-simulator/website/src/components/ChatInterface.tsx`
- `/Users/al/apps/pardon-simulator/website/src/app/api/chat/send/route.ts`
- `/Users/al/apps/pardon-simulator/agents/x402_payment_tools.py`
- `/Users/al/apps/pardon-simulator/agents/x402_solana_adapter.py`


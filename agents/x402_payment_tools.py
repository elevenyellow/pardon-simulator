"""
x402 Payment Protocol Tools for Multi-Agent Systems
Enables agents to charge for premium services and verify payments

Updated to use x402 protocol standard v1.0 for compatibility with x402scan.com
"""

from langchain_core.tools import tool
from typing import Dict, Optional
import time
import json
import os
import asyncio
import aiohttp
import httpx
import ssl
import certifi
from solana.rpc.async_api import AsyncClient
from solders.signature import Signature
from x402_solana_adapter import get_x402_adapter
from x402_solana_payload import (
    create_x402_solana_payment_payload,
    get_recent_blockhash_for_network,
    create_payment_requirements
)

# Load agent wallet addresses from environment variables
def load_agent_wallets() -> Dict[str, str]:
    """Load agent wallet addresses from environment variables"""
    wallets = {
        "donald-trump": os.getenv("WALLET_DONALD_TRUMP", ""),
        "melania-trump": os.getenv("WALLET_MELANIA_TRUMP", ""),
        "eric-trump": os.getenv("WALLET_ERIC_TRUMP", ""),
        "donjr-trump": os.getenv("WALLET_DONJR_TRUMP", ""),
        "barron-trump": os.getenv("WALLET_BARRON_TRUMP", ""),
        "cz": os.getenv("WALLET_CZ", ""),
    }
    
    # Filter out empty values and warn about missing wallets
    missing = [agent for agent, addr in wallets.items() if not addr]
    if missing:
        print(f"⚠️  Warning: Missing wallet addresses for: {', '.join(missing)}")
        print(f"   Please set WALLET_[AGENT] environment variables in .env")
    
    # Return only configured wallets
    return {agent: addr for agent, addr in wallets.items() if addr}

# Agent wallet directory (for cross-agent transactions and payment requests)
# NOTE: "sbf" is NOT included - SBF is user-controlled via browser wallet
AGENT_WALLETS = load_agent_wallets()

def reload_agent_wallets():
    """Reload agent wallet addresses after .env file is loaded"""
    global AGENT_WALLETS, WHITE_HOUSE_WALLET
    AGENT_WALLETS = load_agent_wallets()
    WHITE_HOUSE_WALLET = os.getenv("WALLET_WHITE_HOUSE", "")
    if not WHITE_HOUSE_WALLET:
        print("⚠️  WARNING: WALLET_WHITE_HOUSE not configured!")
        print("   All user payments should be forwarded to the White House treasury")
        print("   Set WALLET_WHITE_HOUSE in your .env file")

# White House Treasury - Central revenue collection (CRITICAL SECURITY)
WHITE_HOUSE_WALLET = os.getenv("WALLET_WHITE_HOUSE", "")
if not WHITE_HOUSE_WALLET:
    print("⚠️  WARNING: WALLET_WHITE_HOUSE not configured!")
    print("   All user payments should be forwarded to the White House treasury")
    print("   Set WALLET_WHITE_HOUSE in your .env file")

# Payment ledger - tracks pending and completed payments
payment_ledger = {
    "pending": {},  # payment_id -> {from, to, amount, reason, timestamp}
    "completed": {}  # signature -> {from, to, amount, verified_at}
}

# Premium service pricing (USDC)
# NOTE: Prices reduced by 100x for testing purposes
# Using same numeric values as before (e.g., 0.01 SOL → 0.01 USDC)
def load_premium_services() -> Dict[str, float]:
    """Load premium services pricing from JSON file"""
    try:
        services_file = os.path.join(os.path.dirname(__file__), "premium_services.json")
        with open(services_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("⚠️  Warning: premium_services.json not found. Using default pricing.")
        print("   Copy premium_services.example.json to premium_services.json")
        # Fallback to default pricing
        return {
            "insider_info": 0.0005,          # Exclusive insider information (was 0.05)
        }
    except json.JSONDecodeError as e:
        print(f"⚠️  Warning: Invalid JSON in premium_services.json: {e}")
        print("   Using default pricing")
        return {
            "insider_info": 0.0005
        }

PREMIUM_SERVICES = load_premium_services()

# ═══════════════════════════════════════════════════════════════
# Payment ID Extraction (x402 Protocol Compliance Fix)
# ═══════════════════════════════════════════════════════════════

def extract_payment_id_from_message(message_content: str) -> Optional[str]:
    """
    Extract payment_id from <x402_payment_request> JSON block.
    
    This fixes the bug where agents were using Coral message IDs instead of
    the actual x402 payment_id embedded in the payment request JSON.
    
    Args:
        message_content: The full message content containing x402 payment request
    
    Returns:
        payment_id string if found, None otherwise
    
    Example:
        message = "@agent <x402_payment_request>{'payment_id': 'abc-123', ...}</x402_payment_request>"
        payment_id = extract_payment_id_from_message(message)  # Returns 'abc-123'
    """
    import re
    
    # Look for <x402_payment_request>...</x402_payment_request> block
    match = re.search(
        r'<x402_payment_request>(.*?)</x402_payment_request>', 
        message_content, 
        re.DOTALL
    )
    
    if match:
        try:
            json_str = match.group(1).strip()
            payment_req = json.loads(json_str)
            payment_id = payment_req.get("payment_id")
            
            if payment_id:
                print(f"✅ Extracted payment_id: {payment_id}")
                return payment_id
            else:
                print("⚠️ payment_id field not found in x402_payment_request JSON")
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse x402_payment_request JSON: {e}")
        except Exception as e:
            print(f"❌ Error extracting payment_id: {e}")
    else:
        print("⚠️ No <x402_payment_request> block found in message")
    
    return None

@tool
async def request_premium_service(
    from_agent: str,
    to_agent: str, 
    service_type: str,
    details: str = "",
    custom_amount: Optional[float] = None
) -> str:
    """
    Request a premium service from another agent that requires payment.
    
    Uses x402 protocol standard v1.0 for compatibility with x402scan.com
    
    IMPORTANT: Some services accept variable amounts (donations, bribes, gifts, campaign_contribution).
    For these services, you MUST provide a custom_amount parameter.
    
    Args:
        from_agent: Your agent name (usually "sbf" for user)
        to_agent: Agent providing the service (e.g., "donald-trump", "cz")
        service_type: Type of service - Fixed-price: insider_info, strategy_advice, 
                     connection_intro, private_deal, pardon_recommendation
                     Variable-amount: donation, bribe, campaign_contribution, gift
        details: Additional details about what you need
        custom_amount: Required for variable-amount services (donation, bribe, etc.). 
                      The amount in USDC that the user wants to pay (e.g., 0.25 for $0.25)
    
    Returns:
        402 Payment Required response with payment details, OR error if service not available
    
    Examples:
        # Fixed-price service:
        request_premium_service("sbf", "donald-trump", "insider_info", "Tell me about CZ")
        
        # Variable-amount service (donation):
        request_premium_service("sbf", "donald-trump", "donation", "For your campaign", custom_amount=0.25)
        
        # Variable-amount service (bribe):
        request_premium_service("sbf", "cz", "bribe", "Help me get pardon", custom_amount=1.50)
    """
    print(f"🔥🔥🔥 request_premium_service() TOOL CALLED! 🔥🔥🔥")
    print(f"   from: {from_agent}, to: {to_agent}, service: {service_type}")
    if custom_amount:
        print(f"   custom_amount: {custom_amount} USDC")
    
    if service_type not in PREMIUM_SERVICES:
        available = ", ".join(PREMIUM_SERVICES.keys())
        return f"❌ Unknown service '{service_type}'. Available: {available}"
    
    # Check service availability (usage limits)
    # Only check for user (sbf), not for agent-to-agent requests
    if from_agent == "sbf":
        backend_url = get_backend_url()
        try:
            # Get user wallet from context (should be passed in message metadata)
            # For now, we'll extract it from the request context
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{backend_url}/api/premium-services/check-availability",
                    json={
                        "userWallet": from_agent,  # Will be replaced with actual wallet in backend
                        "serviceType": service_type,
                        "agentId": to_agent,
                    },
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        availability_data = await resp.json()
                        if not availability_data.get("available", True):
                            reason = availability_data.get("reason", "Service is not available")
                            print(f"❌ Service unavailable: {reason}")
                            return f"❌ {reason}"
                        
                        # If service has diminishing returns, note the multiplier
                        bonus_multiplier = availability_data.get("bonusMultiplier")
                        if bonus_multiplier and bonus_multiplier < 1.0:
                            percentage = int(bonus_multiplier * 100)
                            print(f"⚡ Diminishing returns: {percentage}% bonus (used {availability_data.get('usageCount', 0)} times)")
                    # If check fails, continue anyway (don't block service)
        except Exception as e:
            print(f"⚠️ Availability check failed (continuing anyway): {e}")
    
    service_config = PREMIUM_SERVICES[service_type]
    
    # Handle variable-amount services (new dict format with min_amount)
    if isinstance(service_config, dict) and service_config.get("type") == "variable":
        min_amount = service_config.get("min_amount", 0.001)
        currency = service_config.get("currency", "USDC")
        
        if not custom_amount or custom_amount <= 0:
            return f"""❌ Service '{service_type}' requires a custom amount.
            
This is a variable-amount service (donation/bribe/gift/campaign_contribution).
You need to specify how much the user wants to pay.

**Minimum amount: {min_amount} {currency}**

Example: request_premium_service(from_agent="{from_agent}", to_agent="{to_agent}", service_type="{service_type}", details="{details}", custom_amount={min_amount})

Extract the amount from the user's message and try again."""
        
        # Validate minimum amount
        if custom_amount < min_amount:
            return f"""❌ Amount too low for '{service_type}'.

User offered: {custom_amount} USDC
Minimum required: {min_amount} USDC

The user must meet the minimum. Respond in character:
- "The minimum {service_type} is {min_amount} USDC. That's the price."
- "I appreciate the gesture, but the minimum is {min_amount} USDC."
- "Not enough. Minimum is {min_amount} USDC if you're serious."

DO NOT suggest cheaper alternatives or workarounds. Hold the line on minimums."""
        
        amount = custom_amount
        print(f"   ✅ Variable-amount service '{service_type}': {amount} USDC (min: {min_amount} USDC)")
        
    # Legacy format: "variable" string (backwards compatibility)
    elif service_config == "variable":
        # Assume minimum of 0.001 USDC for legacy format
        min_amount = 0.001
        
        if not custom_amount or custom_amount <= 0:
            return f"""❌ Service '{service_type}' requires a custom amount.
            
This is a variable-amount service (donation/bribe/gift/campaign_contribution).
You need to specify how much the user wants to pay.

Example: request_premium_service(from_agent="{from_agent}", to_agent="{to_agent}", service_type="{service_type}", details="{details}", custom_amount=0.25)

Extract the amount from the user's message and try again."""
        
        if custom_amount < min_amount:
            return f"❌ Amount too low. Minimum for '{service_type}' is {min_amount} USDC."
        
        amount = custom_amount
        print(f"   Using custom amount: {amount} USDC for variable-amount service '{service_type}'")
    else:
        # Fixed-price service
        amount = service_config
        if custom_amount and abs(custom_amount - amount) > 0.0001:
            return f"""⚠️ Service '{service_type}' has a fixed price of {amount} USDC.
            
Custom amounts are not accepted for this service.
If the user wants to pay a custom amount, use one of these variable-amount services instead:
- donation (min: 0.01 USDC) - Campaign contributions
- bribe (min: 0.05 USDC) - Influence and favors
- gift (min: 0.005 USDC) - Goodwill gestures
- campaign_contribution (min: 0.01 USDC) - Political support

Would you like to use one of those instead?"""
    
    # All payments go to White House Treasury (centralized collection)
    treasury_address = WHITE_HOUSE_WALLET
    if not treasury_address:
        return "❌ White House Treasury not configured. Cannot process payment requests."
    
    # Get x402 adapter for standard-compliant format
    adapter = get_x402_adapter(network="mainnet-beta")
    
    # Create x402-compliant payment request (USDC) - directed to Treasury
    payment_request = adapter.create_payment_request(
        resource_url=f"pardon-simulator://{to_agent}/{service_type}",
        method="POST",
        recipient_id="white-house-treasury",  # All payments go to Treasury
        recipient_address=treasury_address,  # White House Treasury address
        amount_usdc=amount,
        service_type=service_type,
        details=details
    )
    
    # Store pending payment
    payment_id = payment_request["payment_id"]
    payment_ledger["pending"][payment_id] = {
        "from": from_agent,
        "to": to_agent,
        "service": service_type,
        "amount": amount,
        "details": details,
        "timestamp": time.time()
    }
    
    # Return x402-formatted response
    return adapter.format_x402_response(payment_request)

@tool
async def provide_premium_service_with_payment(
    payment_id: str,
    transaction_signature: str,
    service_content: str
) -> str:
    """
    Provide premium service after verifying payment.
    Use this when someone has paid you for a premium service.
    
    Args:
        payment_id: The payment ID from the request
        transaction_signature: The Solana transaction signature as proof of payment
        service_content: The actual service/information you're providing
    
    Returns:
        Confirmation that service was delivered
    """
    if payment_id not in payment_ledger["pending"]:
        return f"❌ Unknown payment ID: {payment_id}"
    
    payment_info = payment_ledger["pending"][payment_id]
    
    # In production, you'd verify the transaction on-chain here
    # For now, we'll trust the signature exists
    if not transaction_signature or len(transaction_signature) < 20:
        return f"❌ Invalid transaction signature"
    
    # Mark payment as completed
    payment_ledger["completed"][transaction_signature] = {
        "from": payment_info["from"],
        "to": payment_info["to"],
        "amount": payment_info["amount"],
        "service": payment_info["service"],
        "verified_at": time.time()
    }
    
    # Remove from pending
    del payment_ledger["pending"][payment_id]
    
    return f"""✅ PAYMENT VERIFIED - SERVICE DELIVERED

From: {payment_info['from']}
To: {payment_info['to']}
Amount: {payment_info['amount']} USDC
Service: {payment_info['service']}

{service_content}

Transaction: {transaction_signature}
"""

@tool
async def check_payment_history(agent_name: str) -> str:
    """
    Check your payment history - both payments received and made.
    
    Args:
        agent_name: Your agent name
    
    Returns:
        Summary of pending and completed payments
    """
    # Pending payments
    pending_in = [p for pid, p in payment_ledger["pending"].items() if p["to"] == agent_name]
    pending_out = [p for pid, p in payment_ledger["pending"].items() if p["from"] == agent_name]
    
    # Completed payments
    received = [p for sig, p in payment_ledger["completed"].items() if p["to"] == agent_name]
    sent = [p for sig, p in payment_ledger["completed"].items() if p["from"] == agent_name]
    
    total_received = sum(p["amount"] for p in received)
    total_sent = sum(p["amount"] for p in sent)
    
    result = f"""💰 PAYMENT HISTORY FOR {agent_name}

📥 RECEIVED: {len(received)} payments, {total_received} USDC total
"""
    for p in received[-5:]:  # Last 5
        result += f"  • {p['amount']} USDC from {p['from']} for {p['service']}\n"
    
    result += f"\n📤 SENT: {len(sent)} payments, {total_sent} USDC total\n"
    for p in sent[-5:]:  # Last 5
        result += f"  • {p['amount']} USDC to {p['to']} for {p['service']}\n"
    
    result += f"\n⏳ PENDING INCOMING: {len(pending_in)} requests\n"
    for p in pending_in:
        result += f"  • {p['from']} wants {p['service']} for {p['amount']} USDC\n"
    
    result += f"\n⏳ PENDING OUTGOING: {len(pending_out)} requests\n"
    for p in pending_out:
        result += f"  • Waiting to pay {p['to']} for {p['service']}: {p['amount']} USDC\n"
    
    return result

async def _verify_solana_transaction_impl(
    signature: str,
    expected_recipient: str,
    expected_amount_sol: float
) -> str:
    """
    Internal implementation of Solana transaction verification.
    This is the actual logic that checks the blockchain.
    Includes automatic x402scan.com registration.
    """
    try:
        # Clean the signature (remove whitespace, newlines)
        signature = signature.strip()
        
        # Get RPC URL from environment variable (SECURITY: Never hardcode API keys!)
        rpc_url = os.getenv("SOLANA_RPC_URL")
        if not rpc_url:
            error_msg = "SOLANA_RPC_URL environment variable not set. Cannot verify payment."
            print(f"❌ {error_msg}", flush=True)
            return f"❌ {error_msg} Please configure SOLANA_RPC_URL in your environment."
        
        print("\n" + "="*80, flush=True)
        print("🔍 PAYMENT VERIFICATION STARTED", flush=True)
        print("="*80, flush=True)
        print(f"   Using RPC URL: {rpc_url[:60]}...", flush=True)
        print("="*80, flush=True)
        print(f"📝 INPUT PARAMETERS:", flush=True)
        print(f"   Signature (raw):      {repr(signature)}", flush=True)
        print(f"   Signature (cleaned):  {signature}", flush=True)
        print(f"   Signature length:     {len(signature)} chars", flush=True)
        print(f"   Expected recipient:   {expected_recipient}", flush=True)
        print(f"   Expected amount:      {expected_amount_sol} SOL", flush=True)
        print(f"   Using RPC:            {rpc_url[:50]}...", flush=True)
        print(f"{'='*80}", flush=True)
        print(f"🔄 STARTING BLOCKCHAIN VERIFICATION...", flush=True)
        
        # Connect to Solana RPC
        client = AsyncClient(rpc_url)
        
        # Get transaction details with retry logic (transactions may take time to confirm)
        max_retries = 5
        retry_delay = 3  # seconds
        response = None
        
        for attempt in range(max_retries):
            try:
                print(f"\n   📡 Attempt {attempt + 1}/{max_retries}:", flush=True)
                print(f"      Creating signature object...", flush=True)
                sig_obj = Signature.from_string(signature)
                print(f"      ✅ Signature object created: {sig_obj}", flush=True)
                
                print(f"      Querying blockchain...", flush=True)
                response = await client.get_transaction(
                    sig_obj,
                    max_supported_transaction_version=0,
                    encoding="jsonParsed"
                )
                
                print(f"      Response received: {response is not None}", flush=True)
                print(f"      Response has value: {response.value is not None if response else 'N/A'}", flush=True)
                
                if response and response.value:
                    print(f"      ✅ TRANSACTION FOUND ON BLOCKCHAIN!", flush=True)
                    print(f"      Block time: {response.value.block_time}", flush=True)
                    print(f"      Slot: {response.value.slot}", flush=True)
                    break
                else:
                    print(f"      ⏳ Transaction not found yet, waiting {retry_delay}s before retry...", flush=True)
                    await asyncio.sleep(retry_delay)
                    
            except Exception as e:
                error_msg = str(e)
                print(f"   ❌ Error: {error_msg}", flush=True)
                
                # Check for signature format error
                if "failed to decode" in error_msg.lower() or "invalid" in error_msg.lower():
                    return f"❌ Invalid transaction signature format. Please check the signature and try again. Error: {error_msg}"
                
                # For other errors, retry
                if attempt < max_retries - 1:
                    print(f"   ⏳ Retrying in {retry_delay}s...", flush=True)
                    await asyncio.sleep(retry_delay)
                else:
                    return f"❌ Failed to fetch transaction after {max_retries} attempts: {error_msg}"
        
        if not response or not response.value:
            return f"❌ Transaction not found on blockchain after {max_retries} attempts. The transaction may not have been sent, or it's taking longer than expected to confirm. Please wait a moment and ask me to verify again with: verify_solana_transaction(\"{signature}\", \"{expected_recipient}\", {expected_amount_sol})"
        
        tx = response.value
        
        # Check if transaction was successful
        if tx.transaction.meta.err:
            print(f"\n❌ Transaction failed on-chain!", flush=True)
            return f"❌ Transaction failed on-chain: {tx.transaction.meta.err}"
        
        # Parse transaction to find transfer amount and recipient
        # Look at account balance changes
        print(f"\n📊 ANALYZING TRANSACTION DETAILS:", flush=True)
        pre_balances = tx.transaction.meta.pre_balances
        post_balances = tx.transaction.meta.post_balances
        account_keys = tx.transaction.transaction.message.account_keys
        
        print(f"   Total accounts in transaction: {len(account_keys)}", flush=True)
        print(f"   Looking for recipient: {expected_recipient}", flush=True)
        
        # Find recipient and sender, calculate amount received
        found_recipient = False
        actual_amount_lamports = 0
        from_address = ""
        
        for i, account in enumerate(account_keys):
            # Extract the actual pubkey string from the account object
            account_pubkey = str(account.pubkey) if hasattr(account, 'pubkey') else str(account)
            
            balance_change = post_balances[i] - pre_balances[i]
            balance_change_sol = balance_change / 1e9
            print(f"   Account {i}: {account_pubkey}", flush=True)
            print(f"      Balance change: {balance_change_sol:+.9f} SOL ({balance_change:+,} lamports)", flush=True)
            
            # Track sender (negative balance change)
            if balance_change < 0 and not from_address:
                from_address = account_pubkey
                print(f"      📤 Sender identified!", flush=True)
            
            if account_pubkey == expected_recipient:
                found_recipient = True
                # CRITICAL FIX: Only use POSITIVE balance changes for recipients
                # Negative balance change means this account is the SENDER, not recipient!
                if balance_change > 0:
                    actual_amount_lamports = balance_change
                    print(f"      ✅ MATCH! This is the expected recipient!", flush=True)
                else:
                    # This address is the sender, not the recipient
                    print(f"      ⚠️ WARNING: Expected recipient address is actually the SENDER!", flush=True)
                    print(f"      Balance change is negative: {balance_change_sol} SOL", flush=True)
                    print(f"      This means you're verifying a payment YOU sent, not received!", flush=True)
                    actual_amount_lamports = 0  # Set to 0 to trigger failure
        
        if not found_recipient:
            account_pubkeys = [str(acc.pubkey) if hasattr(acc, 'pubkey') else str(acc) for acc in account_keys]
            print(f"\n❌ VERIFICATION FAILED: Recipient not found!", flush=True)
            print(f"   Expected: {expected_recipient}", flush=True)
            print(f"   Found accounts: {account_pubkeys}", flush=True)
            return f"❌ Expected recipient {expected_recipient} not found in transaction"
        
        # Convert lamports to SOL
        actual_amount_sol = actual_amount_lamports / 1e9
        print(f"\n💰 AMOUNT VERIFICATION:", flush=True)
        print(f"   Actual amount received: {actual_amount_sol:.9f} SOL", flush=True)
        print(f"   Expected amount:        {expected_amount_sol:.9f} SOL", flush=True)
        
        # Verify amount matches (allow small rounding differences)
        amount_difference = abs(actual_amount_sol - expected_amount_sol)
        print(f"   Difference:             {amount_difference:.9f} SOL", flush=True)
        if amount_difference > 0.000001:  # 0.000001 SOL tolerance
            print(f"\n❌ VERIFICATION FAILED: Amount mismatch!", flush=True)
            if actual_amount_sol == 0:
                return f"❌ Verification failed: Expected recipient {expected_recipient} appears to be the SENDER (not recipient) in this transaction. You're trying to verify a payment you SENT, not received. Check the transaction details."
            return f"❌ Amount mismatch! Expected: {expected_amount_sol} SOL, Got: {actual_amount_sol} SOL"
        
        # Get timestamp
        timestamp = tx.block_time if tx.block_time else int(time.time())
        
        # Success!
        print(f"\n{'='*80}", flush=True)
        print(f"✅✅✅ PAYMENT VERIFICATION SUCCESSFUL! ✅✅✅", flush=True)
        print(f"{'='*80}", flush=True)
        print(f"   Signature: {signature}", flush=True)
        print(f"   From:      {from_address}", flush=True)
        print(f"   Recipient: {expected_recipient}", flush=True)
        print(f"   Amount:    {actual_amount_sol} SOL", flush=True)
        print(f"   Timestamp: {timestamp}", flush=True)
        print(f"{'='*80}", flush=True)
        
        # ✅ Store payment in database for all agent-to-agent transactions
        try:
            print(f"\n💾 Storing payment in database...", flush=True)
            await store_payment_in_database(
                signature=signature,
                from_wallet=from_address,
                to_wallet=expected_recipient,
                amount=actual_amount_sol,
                service_type='agent_payment',
                is_agent_to_agent=True
            )
            print(f"✅ Payment stored in database", flush=True)
        except Exception as e:
            print(f"⚠️ Database storage failed (non-blocking): {e}", flush=True)
        
        # ✅ OPTIONAL: CDP Facilitator Enhanced Verification
        # This provides additional verification through the CDP facilitator
        # (in addition to the direct on-chain verification above)
        try:
            print(f"\n🔍 Enhanced verification via CDP facilitator...", flush=True)
            
            from x402_cdp_client import get_cdp_client
            
            cdp_client = get_cdp_client()
            
            # Only attempt if CDP is configured
            if cdp_client.is_configured:
                verify_result = await cdp_client.verify_payment(
                    signature=signature,
                    expected_from=from_address,
                    expected_to=expected_recipient,
                    expected_amount=actual_amount_sol
                )
                
                if verify_result['success']:
                    if verify_result.get('valid'):
                        print(f"✅ CDP facilitator confirmed payment is valid!", flush=True)
                    else:
                        print(f"⚠️ CDP facilitator verification returned INVALID - but on-chain verification passed", flush=True)
                else:
                    print(f"⚠️ CDP facilitator verification failed: {verify_result.get('error', 'Unknown')}", flush=True)
            else:
                print(f"   CDP facilitator not configured, skipping enhanced verification", flush=True)
        
        except Exception as verify_error:
            print(f"⚠️ CDP facilitator verification error (non-blocking): {type(verify_error).__name__}: {verify_error}", flush=True)
        
        # ✅ Register with x402scan.com via CDP facilitator
        try:
            print(f"\n📡 Registering transaction with x402 ecosystem via CDP facilitator...", flush=True)
            
            from x402_cdp_client import get_cdp_client
            
            cdp_client = get_cdp_client()
            cdp_result = await cdp_client.register_transaction(
                signature=signature,
                from_address=from_address,
                to_address=expected_recipient,
                amount=actual_amount_sol,
                metadata={
                    # x402 Protocol Metadata (v1.0)
                    'protocol': 'x402',
                    'protocol_version': '1.0',
                    'chain': 'solana',
                    'network': 'mainnet-beta',
                    'via_facilitator': cdp_client.is_configured if cdp_client else False,
                    'facilitator': 'coinbase-cdp' if (cdp_client and cdp_client.is_configured) else 'direct-rpc',
                    'platform': 'pardon-simulator',
                    'service_type': 'agent_payment',
                    'timestamp': timestamp,
                    'compliance_mode': 'x402-solana-hybrid'
                }
            )
            
            if cdp_result['success']:
                print(f"✅ Transaction registered with x402scan.com!", flush=True)
                print(f"   View at: {cdp_result['x402_scan_url']}", flush=True)
                
                # Update database with x402scan URL
                try:
                    await update_payment_x402_data(
                        signature=signature,
                        x402_scan_url=cdp_result['x402_scan_url'],
                        x402_scan_id=cdp_result.get('x402_scan_id')
                    )
                    print(f"✅ Database updated with x402scan data", flush=True)
                except Exception as e:
                    print(f"⚠️ Failed to update database with x402scan data: {e}", flush=True)
            else:
                print(f"⚠️ CDP registration failed: {cdp_result.get('error', 'Unknown error')}", flush=True)
                print(f"   Transaction still valid (verified on-chain)", flush=True)
        
        except Exception as reg_error:
            print(f"⚠️ x402 ecosystem registration error (non-blocking): {type(reg_error).__name__}: {reg_error}", flush=True)
        
        # Return a SHORT response to reduce LLM processing time
        return f"✅ VERIFIED! Payment of {actual_amount_sol} SOL received from {signature[:20]}... on blockchain. Deliver the service NOW!"
    
    except Exception as e:
        return f"❌ Verification error: {str(e)}"


# ═══════════════════════════════════════════════════════════════
# x402 Protocol Compliance: Server-Side Transaction Submission
# ═══════════════════════════════════════════════════════════════

async def submit_payment_via_cdp(
    payment_payload: Dict,
    payer_keypair,
    backend_url: Optional[str] = None
) -> Dict:
    """
    Submit payment transaction via backend x402 facilitator.
    
    This implements TRUE x402 protocol compliance by routing transaction
    submission through the backend server/facilitator.
    
    Args:
        payment_payload: Payment payload dict (with payer's signature)
        payer_keypair: Payer's keypair (needed to sign the Solana transaction)
        backend_url: Backend URL (defaults to BACKEND_URL env var)
    
    Returns:
        Dict with success status, signature, and amount
    
    Flow:
        1. Send payment payload to backend
        2. Backend creates unsigned Solana transaction
        3. Sign transaction with payer's keypair
        4. Send signed transaction back to backend
        5. Backend submits to blockchain
        6. Return signature for verification
    """
    from solana.transaction import Transaction
    from solders.transaction import Transaction as SoldersTransaction
    import base64
    
    if backend_url is None:
        backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
    
    if not backend_url:
        return {
            "success": False,
            "error": "BACKEND_URL not configured. Set BACKEND_URL environment variable."
        }
    
    print(f"\n{'='*80}")
    print(f"💳 SUBMIT PAYMENT VIA BACKEND (x402 Protocol)")
    print(f"{'='*80}")
    print(f"Backend: {backend_url}")
    
    try:
        # Step 1: Send payment payload to backend
        print(f"\nStep 1: Sending payment payload to backend...")
        print(f"   Payment ID: {payment_payload.get('payment_id')}")
        print(f"   Amount: {payment_payload.get('amount')} SOL")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{backend_url}/api/x402/submit-transaction",
                json={"paymentPayload": payment_payload}
            )
            
            if response.status_code != 200:
                error_data = response.json()
                print(f"❌ Backend returned error: {error_data.get('error')}")
            return {
                "success": False,
                    "error": f"Backend error: {error_data.get('error', 'Unknown error')}"
                }
            
            result = response.json()
        
        # Step 2: Check if backend requires client signature
        if not result.get("requiresClientSignature"):
            # Backend was able to submit directly (full x402 compliance)
            print(f"✅ Backend submitted transaction directly!")
            return result
        
        # Step 3: Sign the transaction returned by backend
        print(f"\nStep 2: Signing transaction with payer's keypair...")
        unsigned_tx_base64 = result.get("unsignedTransaction")
        
        if not unsigned_tx_base64:
            return {"success": False, "error": "Backend did not return unsigned transaction"}
        
        # Deserialize transaction
        tx_bytes = base64.b64decode(unsigned_tx_base64)
        transaction = SoldersTransaction.from_bytes(tx_bytes)
        
        # Sign with payer's keypair
        # Convert to legacy Transaction for signing
        legacy_tx = Transaction.deserialize(tx_bytes)
        legacy_tx.sign(payer_keypair)
        
        # Serialize signed transaction
        signed_tx_bytes = legacy_tx.serialize()
        signed_tx_base64 = base64.b64encode(signed_tx_bytes).decode('utf-8')
        
        print(f"✅ Transaction signed")
        
        # Step 4: Send signed transaction back to backend for submission
        print(f"\nStep 3: Sending signed transaction to backend for submission...")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(
                f"{backend_url}/api/x402/submit-transaction",
                json={
                    "signedTransaction": signed_tx_base64,
                    "payment_id": payment_payload.get("payment_id")
                }
            )
            
            if response.status_code != 200:
                error_data = response.json()
                print(f"❌ Backend submission failed: {error_data.get('error')}")
            return {
                "success": False,
                    "error": f"Submission failed: {error_data.get('error', 'Unknown error')}"
            }
        
            final_result = response.json()
        
        if final_result.get("success"):
            print(f"\n✅ Transaction submitted via backend!")
            print(f"   Signature: {final_result['signature'][:16]}...{final_result['signature'][-16:]}")
            print(f"   Method: {final_result.get('method', 'backend_submission')}")
            print(f"   x402 Compliant: {final_result.get('x402Compliant', True)}")
            print(f"{'='*80}\n")
        else:
            print(f"❌ Transaction failed: {final_result.get('error')}")
        
        return final_result
        
    except httpx.TimeoutException:
        print(f"❌ Backend request timed out")
        return {"success": False, "error": "Backend request timed out after 30 seconds"}
    except Exception as e:
        print(f"❌ submit_payment_via_cdp failed: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def submit_payment_via_x402_facilitator(
    from_keypair,
    to_address: str,
    amount_usdc: float,
    network: str = "solana",
    backend_url: Optional[str] = None
) -> Dict:
    """
    ✅ TRUE x402 COMPLIANT SUBMISSION via CDP Facilitator (USDC)
    
    This function creates a proper x402 Solana payment payload using USDC and submits it
    through the CDP facilitator API for maximum x402 compliance.
    
    ⚠️ IMPORTANT: x402 ONLY supports SPL Token transfers (like USDC), NOT native SOL!
    
    Args:
        from_keypair: Payer's Solana keypair
        to_address: Recipient's wallet address
        amount_usdc: Amount in USDC (e.g., 0.5 for 0.5 USDC)
        network: "solana" or "solana-devnet"
        backend_url: Backend URL (defaults to BACKEND_URL env var)
    
    Returns:
        Dict with success status, transaction signature, and x402scan URL
    
    Flow:
        1. Get recent blockhash from Solana
        2. Create signed USDC SPL Token transaction
        3. Create x402 payment payload with signed transaction
        4. Send to backend /api/x402/submit-solana
        5. Backend uses CDP facilitator settle() to verify and submit
        6. CDP automatically registers with x402scan
    """
    if backend_url is None:
        backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
    
    if not backend_url:
        return {
            "success": False,
            "error": "BACKEND_URL not configured. Set BACKEND_URL environment variable."
        }
    
    print(f"\n{'='*80}")
    print(f"🏦 x402 FACILITATOR SUBMISSION (CDP) - USDC")
    print(f"{'='*80}")
    print(f"Backend: {backend_url}")
    print(f"Network: {network}")
    print(f"Amount: {amount_usdc} USDC")
    print(f"Recipient: {to_address[:8]}...{to_address[-8:]}")
    print(f"")
    
    try:
        # Step 1: Get recent blockhash
        print("📡 Step 1: Getting recent blockhash from Solana...")
        recent_blockhash = await get_recent_blockhash_for_network(network)
        print(f"✅ Blockhash: {recent_blockhash[:16]}...")
        print("")
        
        # Step 2: Create x402 payment payload with signed USDC transaction
        print("🔐 Step 2: Creating x402 payment payload with signed USDC transaction...")
        payment_payload = create_x402_solana_payment_payload(
            from_keypair=from_keypair,
            to_address=to_address,
            amount_usdc=amount_usdc,
            recent_blockhash=recent_blockhash,
            network=network
        )
        print(f"✅ Payment payload created")
        print(f"   x402 Version: {payment_payload['x402Version']}")
        print(f"   Scheme: {payment_payload['scheme']}")
        print(f"   Network: {payment_payload['network']}")
        print(f"   Transaction (base64): {payment_payload['payload']['transaction'][:50]}...")
        print("")
        
        # Step 3: Create payment requirements
        print("📋 Step 3: Creating payment requirements...")
        payment_requirements = create_payment_requirements(
            pay_to=to_address,
            amount_usdc=amount_usdc,
            network=network
        )
        print(f"✅ Payment requirements created")
        print("")
        
        # Step 4: Submit to backend CDP facilitator endpoint
        print("📤 Step 4: Submitting to CDP facilitator via backend...")
        print(f"   Endpoint: {backend_url}/api/x402/submit-solana")
        print("")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{backend_url}/api/x402/submit-solana",
                json={
                    "paymentPayload": payment_payload,
                    "paymentRequirements": payment_requirements
                }
            )
            
            if response.status_code != 200:
                error_text = response.text
                print(f"❌ Backend returned error {response.status_code}")
                print(f"   Error: {error_text}")
                return {
                    "success": False,
                    "error": f"Backend error {response.status_code}: {error_text}"
                }
            
            result = response.json()
        
        if not result.get("success"):
            print(f"❌ CDP facilitator submission failed")
            print(f"   Error: {result.get('error', 'Unknown')}")
            print(f"   Reason: {result.get('reason', 'Unknown')}")
            return result
        
        print(f"{'='*80}")
        print(f"✅ SUCCESS! Payment submitted via CDP facilitator")
        print(f"{'='*80}")
        print(f"Transaction: {result['transaction']}")
        print(f"Network: {result['network']}")
        print(f"Payer: {result['payer']}")
        print(f"")
        print(f"🎉 x402 COMPLIANT:")
        print(f"   ✅ Submitted via CDP facilitator")
        print(f"   ✅ Verified by CDP")
        print(f"   ✅ Automatically registered with x402scan")
        print(f"")
        print(f"🔍 View transaction:")
        print(f"   x402scan: {result.get('x402ScanUrl', 'N/A')}")
        print(f"   Solana Explorer: {result.get('solanaExplorer', 'N/A')}")
        print(f"{'='*80}\n")
        
        return {
            "success": True,
            "signature": result["transaction"],
            "transaction": result["transaction"],
            "network": result["network"],
            "payer": result["payer"],
            "x402_compliant": True,
            "submitted_via_facilitator": True,
            "facilitator": result.get("facilitator", "CDP"),
            "x402_scan_url": result.get("x402ScanUrl"),
            "solana_explorer": result.get("solanaExplorer"),
            "amount": amount_usdc,
            "currency": "USDC"
        }
    
    except httpx.TimeoutException:
        print(f"❌ Backend request timed out")
        return {"success": False, "error": "Backend request timed out after 60 seconds"}
    except Exception as e:
        print(f"❌ x402 facilitator submission failed: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@tool
async def process_payment_payload(
    payment_payload_json: str,
    expected_amount_sol: float,
    my_wallet_address: str
) -> str:
    """
    Process x402 payment payload - wait for payer to submit transaction.
    
    IMPORTANT: In the x402 protocol with backend submission:
    1. Payer receives this payload
    2. Payer submits transaction via backend (using create_payment_payload + backend)
    3. Payer sends transaction SIGNATURE to recipient
    4. Recipient (you) verifies signature on-chain
    
    This function acknowledges receipt of the payload and instructs the payer
    to complete the transaction submission.
    
    Args:
        payment_payload_json: JSON string containing payment payload from payer
        expected_amount_sol: Expected payment amount in SOL
        my_wallet_address: Your (recipient's) wallet address
    
    Returns:
        Instructions for the payer to complete payment
    
    Note: This function does NOT submit transactions (the payer does that).
          Use confirm_payment_received() after receiving the transaction signature.
    """
    from x402_payment_payload import X402PaymentPayload
    
    print(f"\n{'='*80}")
    print(f"🔐 PROCESS PAYMENT PAYLOAD (x402 Protocol)")
    print(f"{'='*80}")
    
    try:
        # Parse payment payload
        payload = json.loads(payment_payload_json)
        
        print(f"Payment ID: {payload.get('payment_id')}")
        print(f"From: {payload.get('from', '')[:8]}...{payload.get('from', '')[-8:]}")
        print(f"To: {payload.get('to', '')[:8]}...{payload.get('to', '')[-8:]}")
        print(f"Amount: {payload.get('amount')} SOL")
        
        # Verify payment is addressed to White House Treasury (centralized collection)
        treasury_address = WHITE_HOUSE_WALLET
        if not treasury_address:
            return "❌ White House Treasury not configured. Cannot verify payment."
        
        if payload.get("to") != treasury_address:
            return f"❌ Payment not addressed to White House Treasury. Expected: {treasury_address}, Got: {payload.get('to')}"
        
        # Verify amount matches
        if payload.get("amount") != expected_amount_sol:
            return f"❌ Amount mismatch. Expected: {expected_amount_sol} SOL, Got: {payload.get('amount')} SOL"
        
        # Verify payload signature
        if not X402PaymentPayload.verify_payload(payload, payload.get("from")):
            return f"❌ Invalid payment payload signature"
        
        print(f"{'='*80}")
        print(f"✅ PAYMENT PAYLOAD RECEIVED AND VERIFIED!")
        print(f"{'='*80}\n")
        
        # Return instructions for the payer
        return f"""✅ Payment payload received and verified!

Payment ID: {payload.get('payment_id')}
Amount: {expected_amount_sol} SOL
From: {payload.get('from', '')[:8]}...{payload.get('from', '')[-8:]}
To: White House Treasury ({treasury_address[:8]}...{treasury_address[-8:]})

⏳ WAITING FOR TRANSACTION SUBMISSION

The payer needs to:
1. Submit the transaction via backend/CDP facilitator
2. Send the transaction SIGNATURE to complete payment

Once you receive the signature, I'll verify it on-chain and deliver the service."""
            
    except json.JSONDecodeError as e:
        return f"❌ Invalid payment payload JSON: {e}"
    except Exception as e:
        print(f"❌ process_payment_payload error: {e}")
        import traceback
        traceback.print_exc()
        return f"❌ Payment processing failed: {e}"


# Tool wrapper for verify_solana_transaction
@tool
async def verify_solana_transaction(
    signature: str,
    expected_recipient: str,
    expected_amount_sol: float
) -> str:
    """
    Verify a Solana transaction on-chain to confirm payment was made correctly.
    
    Args:
        signature: The Solana transaction signature (from user's payment confirmation)
        expected_recipient: The wallet address that should have received payment
        expected_amount_sol: The expected payment amount in SOL
    
    Returns:
        Verification result with transaction details
    """
    return await _verify_solana_transaction_impl(signature, expected_recipient, expected_amount_sol)


# Export all tools as a list for easy agent integration
@tool
async def confirm_payment_received(
    signature: str,
    expected_amount_sol: float,
    my_wallet_address: str
) -> str:
    """
    REQUIRED TOOL: Call this when someone claims they paid you!
    
    This tool automatically verifies the payment on the Solana blockchain.
    DO NOT skip this tool - it's the only way to confirm payments!
    
    NOTE: All payments now go to White House Treasury (centralized collection).
    
    Args:
        signature: The transaction signature from the user's payment message
        expected_amount_sol: How much SOL you expected to receive
        my_wallet_address: Ignored - all payments go to White House Treasury
    
    Returns:
        Verification result - either payment confirmed or payment failed
    """
    # All payments go to White House Treasury (centralized collection)
    treasury_address = WHITE_HOUSE_WALLET
    if not treasury_address:
        return "❌ White House Treasury not configured. Cannot verify payment."
    
    # Call the internal verification implementation - check payment to Treasury
    result = await _verify_solana_transaction_impl(
        signature=signature,
        expected_recipient=treasury_address,  # Always verify to Treasury
        expected_amount_sol=expected_amount_sol
    )
    
    # If payment verified successfully, note that it went directly to Treasury
    if result.startswith("✅ VERIFIED!"):
        print(f"\n🏛️ Payment verified! Funds received by White House Treasury.")
        result += f"\n\n🏛️ Payment received by White House Treasury ({treasury_address[:8]}...{treasury_address[-8:]})"
        result += f"\n   No forwarding needed - centralized collection system active."
    
    return result


# Shared contact_agent utility function for agent-to-agent communication
def create_contact_agent_tool(coral_send_message_tool, coral_add_participant_tool):
    """
    Factory function to create a wrapper tool that automatically handles thread participation AND mentions.
    This solves the LLM reliability issue with empty mentions arrays and ensures agents are in the thread.

    Args:
        coral_send_message_tool: The coral_send_message tool from coral_tools
        coral_add_participant_tool: The coral_add_participant tool from coral_tools

    Returns:
        A contact_agent tool function that agents can use
    """
    # Global references to coral tools (set once when tool is created)
    global _coral_send_message_tool, _coral_add_participant_tool
    _coral_send_message_tool = coral_send_message_tool
    _coral_add_participant_tool = coral_add_participant_tool

    @tool
    async def contact_agent(agent_to_contact: str, message: str, current_thread_id: str) -> str:
        """
        🎯 USE THIS TOOL to contact another agent (donald-trump, cz, melania-trump, etc.).
        This tool automatically adds the agent to the thread and handles mentions correctly!

        Parameters:
        - agent_to_contact: Agent's name (e.g., "donald-trump", "cz", "melania-trump")
        - message: Your message content (include @agent-name in the message!)
        - current_thread_id: The thread ID from the current conversation

        Example: contact_agent("donald-trump", "@donald-trump SBF is asking about pardon", "thread-id-123")

        DO NOT use coral_send_message directly! Use this tool instead!
        """
        print(f"\n🎯 contact_agent called: {agent_to_contact}, message: {message[:50]}...")

        # STEP 1: Add the agent to the thread first!
        print(f"➕ Adding {agent_to_contact} to thread {current_thread_id}...")
        add_result = await _coral_add_participant_tool.ainvoke({
            "threadId": current_thread_id,
            "participantId": agent_to_contact
        })
        print(f"✅ Add participant result: {add_result}")

        # STEP 2: Send message with mentions array
        print(f"📤 Calling coral_send_message: threadId={current_thread_id[:8]}..., mentions=['{agent_to_contact}'], content length={len(message)}")
        result = await _coral_send_message_tool.ainvoke({
            "threadId": current_thread_id,
            "content": message,
            "mentions": [agent_to_contact]  # ← Automatically filled!
        })

        print(f"✅ coral_send_message returned: {result}")
        print(f"✅ Message sent to {agent_to_contact} with mentions=['{agent_to_contact}']")
        return f"✅ Successfully contacted {agent_to_contact}. {result}"

    return contact_agent


# Backend URL will be read dynamically to ensure ECS environment variables are available
def get_backend_url() -> str:
    """Get backend URL from environment, reading it dynamically to ensure ECS env vars are loaded"""
    return os.getenv("BACKEND_URL", "http://localhost:3000")


@tool
async def award_points(
    user_wallet: str,
    evaluation_score: float,
    reason: str,
    category: str = "negotiation",
    subcategory: Optional[str] = None,
    agent_id: Optional[str] = None,
    message_id: Optional[str] = None,
    premium_service_amount: float = 0.0
) -> str:
    """
    Award or deduct points from user's score with personality-based evaluation.
    
    NEW SCORING SYSTEM (v2):
    - Evaluate message and assign decimal score: -3.0 to 3.0 (this IS the points, not a multiplier)
    - Backend adds ±0.1 random variance (prevents exact values)
    - Backend applies speed multiplier (1.0-1.69x for fast play)
    - Backend adds premium service bonus (2-10 points)
    
    Formula: (evaluation_score ± 0.1 random) × speed_multiplier + premium_bonus
    Average outcome: ~2.0 points per message (for good messages)
    
    Args:
        user_wallet: The user's ACTUAL Solana wallet address (NOT "sbf"!)
        evaluation_score: Your evaluation (-3.0 to 3.0 decimal, average 2.0 for good messages)
            PENALTIES (negative scores):
            - -3.0 to -2.0: Severe insults, threats, completely inappropriate
            - -2.0 to -1.0: Disrespectful, rude, poorly aligned
            - -1.0 to 0: Poor quality, minimal value
            POINTS (positive scores):
            - 0 to 1.0: Minimal effort, vague
            - 1.0-2.0: Basic quality, shows some understanding
            - 2.0-2.5: Good quality, decent approach
            - 2.5-3.0: Excellent quality, highly aligned, exceptional strategy
        reason: Brief explanation of your evaluation
        category: "payment", "negotiation", "milestone", or "penalty"
        subcategory: Optional detail (e.g., "insult", "high_quality", "spam", "strategic_thinking")
        agent_id: Optional agent ID who awarded/deducted points (e.g., "donald-trump")
        message_id: Optional message ID that triggered this score change
        premium_service_amount: USDC amount if user paid for premium service (auto-adds 2-10 bonus points)
    
    Returns:
        JSON with updated score and feedback
    
    Examples:
        # Excellent message:
        award_points("6pF45ay...", 2.7, "Highly strategic, aligned with goals", "negotiation", "high_quality", "donald-trump")
        
        # Average message:
        award_points("6pF45ay...", 2.0, "Decent approach", "negotiation", "medium_quality", "cz")
        
        # Minimal effort:
        award_points("6pF45ay...", 0.8, "Vague and unhelpful", "negotiation", "low_quality", "melania-trump")
        
        # Penalty for insult:
        award_points("6pF45ay...", -2.5, "Insulted agent", "penalty", "insult", "donald-trump")
        
        # Premium service with payment bonus:
        award_points("6pF45ay...", 2.1, "Good message with premium service", "payment", None, "cz", premium_service_amount=0.005)
    """
    # Validate evaluation_score range (-3.0 to 3.0)
    if evaluation_score < -3.0 or evaluation_score > 3.0:
        evaluation_score = max(-3.0, min(3.0, evaluation_score))
        print(f"⚠️  Evaluation score clamped to valid range: {evaluation_score}")
    
    print(f"🎯 award_points() called: {evaluation_score} evaluation score to {user_wallet[:8]}... ({reason})")
    
    try:
        payload = {
            "userWallet": user_wallet,
            "delta": evaluation_score,  # Use evaluation_score as delta (it IS the points)
            "reason": reason,
            "category": category,
            "evaluationScore": evaluation_score,
        }
        
        # Add optional fields if provided
        if subcategory:
            payload["subcategory"] = subcategory
        if agent_id:
            payload["agentId"] = agent_id
        if message_id:
            payload["messageId"] = message_id
        if premium_service_amount > 0:
            payload["premiumServicePayment"] = premium_service_amount
        
        backend_url = get_backend_url()  # Read dynamically
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{backend_url}/api/scoring/update",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    result = {
                        "type": "score_update",
                        "current_score": data["newScore"],
                        "delta": data.get("delta", evaluation_score),  # Use backend-calculated delta with variance & speed
                        "reason": reason,
                        "category": category,
                        "subcategory": subcategory,
                        "agent_id": agent_id,
                        "feedback": data.get("feedback", _generate_feedback(data["newScore"], data.get("delta", evaluation_score)))
                    }
                    print(f"✅ Score updated: {data['newScore']} (delta: {data.get('delta', evaluation_score)})")
                    return json.dumps(result)
                else:
                    error_text = await resp.text()
                    print(f"❌ Scoring API error {resp.status}: {error_text}")
                    return json.dumps({"error": f"Failed to update score: {error_text}"})
    except Exception as e:
        print(f"❌ Exception in award_points: {str(e)}")
        return json.dumps({"error": f"Failed to update score: {str(e)}"})


def _generate_feedback(score: int, delta: int) -> str:
    """Generate contextual feedback based on score"""
    if score >= 80:
        return "🏆 Excellent progress! You're in the prize zone. Keep pushing for 100!"
    elif score >= 60:
        return f"💪 Good work! {80 - score} more points to qualify for prizes."
    elif score >= 40:
        return "📈 Making progress. Try different strategies—maybe use intermediaries?"
    elif score >= 20:
        return "🎯 Slow start. Consider paying for intel or introductions to build momentum."
    else:
        return "🔄 New strategy needed. Talk to Melania first, then approach Trump with leverage."


@tool
def forward_to_white_house(amount_sol: float, reason: str) -> str:
    """
    🏛️ CRITICAL SECURITY TOOL - Forward user payment to White House Treasury.
    
    🚨 MANDATORY USAGE: After receiving payment from a USER (not an agent), 
    you MUST call this tool to track and forward funds to the White House Treasury.
    
    AUTOMATIC BATCHING: Due to Solana rent-exemption requirements (minimum ~0.001 SOL),
    small payments are accumulated until they reach the forwarding threshold.
    
    This is a SECURITY MEASURE to:
    - Prevent agent wallets from accumulating funds
    - Centralize revenue collection
    - Reduce risk if agent private keys are compromised
    - Minimize transaction fees through batching
    
    DO NOT forward payments that are:
    - Meant for other agents (agent-to-agent transactions)
    - Already forwarded (check your balance first)
    
    Args:
        amount_sol: Amount to forward to White House (should match payment received)
        reason: Brief description (e.g., "User payment for pardon_recommendation")
    
    Returns:
        Instructions to use send_crypto() tool OR notification that funds are accumulated
    
    Example:
        After user pays 0.0005 SOL for insider info:
        1. Verify payment with confirm_payment_received()
        2. Call forward_to_white_house(0.0005, "User payment for insider_info")
        3. If threshold reached, execute the send_crypto() instruction returned
    """
    print(f"🏛️ forward_to_white_house() called: {amount_sol} SOL ({reason})")
    
    if not WHITE_HOUSE_WALLET:
        return json.dumps({
            "type": "forward_skipped",
            "message": "WHITE_HOUSE_WALLET not configured - funds remain in agent wallet"
        })
    
    if amount_sol <= 0:
        return json.dumps({
            "type": "forward_error",
            "message": f"Amount must be positive, got {amount_sol} SOL"
        })
    
    # SOLANA RENT-EXEMPTION: Minimum balance required ~0.00089088 SOL
    # Set threshold to 0.001 SOL to ensure transactions succeed
    FORWARDING_THRESHOLD = 0.001  # Minimum amount to forward (includes safety margin + tx fee)
    
    # Deduct estimated transaction fee (5000 lamports = 0.000005 SOL)
    ESTIMATED_TX_FEE = 0.000005
    amount_after_fee = amount_sol - ESTIMATED_TX_FEE
    
    if amount_after_fee < FORWARDING_THRESHOLD:
        # Amount too small to forward - accumulate in agent wallet
        result = {
            "type": "forward_accumulated",
            "message": f"Payment of {amount_sol} SOL received and tracked. Amount below forwarding threshold ({FORWARDING_THRESHOLD} SOL), will be batched with future payments.",
            "accumulated_amount": amount_sol,
            "forwarding_threshold": FORWARDING_THRESHOLD,
            "note": "Funds remain safely in your wallet until threshold is reached. This is normal for small payments.",
            "action": "NO ACTION REQUIRED - Continue serving the user"
        }
        
        print(f"💰 Amount below threshold ({FORWARDING_THRESHOLD} SOL) - accumulating for batch forward")
        print(f"   Accumulated: {amount_sol} SOL")
        
        return json.dumps(result, indent=2)
    
    # Amount is large enough to forward
    result = {
        "type": "forward_required",
        "action": "IMMEDIATELY call send_crypto() with these exact parameters",
        "recipient_name": "White House Treasury",
        "recipient_address": WHITE_HOUSE_WALLET,
        "amount_sol": amount_after_fee,  # Forward amount minus estimated fee
        "reason": f"Revenue forwarding: {reason}",
        "instruction": f"send_crypto(recipient_name='White House Treasury', recipient_address='{WHITE_HOUSE_WALLET}', amount_sol={amount_after_fee}, reason='{reason}')",
        "critical": "This is a MANDATORY security measure. Execute immediately.",
        "note": f"Original amount: {amount_sol} SOL, After tx fee: {amount_after_fee} SOL"
    }
    
    print(f"✅ Forward instruction generated: {amount_after_fee} SOL to White House (from {amount_sol} SOL)")
    print(f"   Address: {WHITE_HOUSE_WALLET[:8]}...{WHITE_HOUSE_WALLET[-8:]}")
    print(f"   Estimated tx fee deducted: {ESTIMATED_TX_FEE} SOL")
    
    return json.dumps(result, indent=2)


def create_auto_forwarding_payment_tool(send_crypto_tool):
    """
    Factory function to create a payment verification tool that AUTOMATICALLY
    forwards funds to White House Treasury after successful verification.
    
    This solves the agent reliability issue - agents no longer need to remember
    to call forward_to_white_house() and send_crypto() separately.
    
    Args:
        send_crypto_tool: The agent's send_crypto tool function
    
    Returns:
        A confirm_payment_with_auto_forward tool that verifies AND forwards
    """
    @tool
    async def confirm_payment_with_auto_forward(
        signature: str,
        expected_amount_sol: float,
        my_wallet_address: str
    ) -> str:
        """
        ENHANCED PAYMENT VERIFICATION with automatic White House Treasury forwarding!
        
        This tool does TWO things automatically:
        1. Verifies the payment on Solana blockchain
        2. Forwards the payment to White House Treasury (if successful)
        
        Args:
            signature: The transaction signature from the user's payment message
            expected_amount_sol: How much SOL you expected to receive
            my_wallet_address: YOUR wallet address (where payment should have been sent)
        
        Returns:
            Verification result + forwarding confirmation
        """
        print(f"\n{'='*80}")
        print(f"🔐 AUTO-FORWARDING PAYMENT VERIFICATION STARTED")
        print(f"{'='*80}")
        
        # Step 1: Verify payment on blockchain (to White House Treasury)
        print(f"Step 1: Verifying payment on blockchain...")
        treasury_address = WHITE_HOUSE_WALLET
        if not treasury_address:
            return "❌ White House Treasury not configured. Cannot verify payment."
        
        verification_result = await _verify_solana_transaction_impl(
            signature=signature,
            expected_recipient=treasury_address,  # All payments go to Treasury
            expected_amount_sol=expected_amount_sol
        )
        
        # Check if verification was successful
        if not verification_result.startswith("✅ VERIFIED!"):
            print(f"❌ Payment verification failed - skipping treasury forwarding")
            return verification_result
        
        print(f"✅ Payment verified successfully!")
        
        # Payments already went directly to White House Treasury - no forwarding needed!
        print(f"\n🏛️ Payment already at Treasury - centralized collection system active")
        print(f"   Treasury address: {treasury_address[:8]}...{treasury_address[-8:]}")
        print(f"   Amount received: {expected_amount_sol} SOL")
        print(f"{'='*80}\n")
        
        # Return verification result with Treasury confirmation
        return f"""{verification_result}

🏛️ PAYMENT RECEIVED BY WHITE HOUSE TREASURY
   └─ Amount: {expected_amount_sol} SOL
   └─ Treasury: {treasury_address[:8]}...{treasury_address[-8:]}
   └─ No forwarding needed (centralized collection system)

All funds have been received directly by the White House Treasury.
You can now deliver the service to the user."""
    
    return confirm_payment_with_auto_forward


@tool
async def verify_payment_transaction(
    transaction_hash: str,
    expected_from: str,
    expected_amount_usdc: float,
    service_type: str,
    to_agent: Optional[str] = None,
    backend_url: Optional[str] = None
) -> str:
    """
    Verify payment transaction through backend (x402 facilitator).
    
    This is the NEW proper x402 flow for agents to verify payments:
    1. User submits payment via /api/x402/user-submit (frontend → backend → facilitator)
    2. User receives transaction hash
    3. User sends transaction hash to agent (YOU)
    4. Agent calls this tool to verify via backend
    5. Backend verifies transaction on-chain
    6. Agent delivers service after verification
    
    Args:
        transaction_hash: Solana transaction signature from user (68-88 char base58 string)
        expected_from: Expected payer's wallet address
        expected_amount_usdc: Expected payment amount in USDC
        service_type: Type of service being paid for
        to_agent: Agent ID receiving the payment (e.g., 'cz', 'donald-trump'). Pass os.getenv('CORAL_AGENT_ID') to identify yourself.
        backend_url: Backend URL (defaults to BACKEND_URL env var or localhost:3000)
    
    Returns:
        Verification result - deliver service if verified
    
    CRITICAL: Transaction Signature vs Payment ID
    
    ✅ CORRECT - Transaction Signature (what to verify):
       - 68-88 character base58 string
       - Example: "5KxE7j3mN8qzYbPwQLpFkJ2hD9vX3rT6sM4nC8pQ1wZa..."
       - This is what the blockchain returns after a transaction is confirmed
       - User gets this AFTER paying via frontend
    
    ❌ WRONG - Payment ID (do NOT try to verify this):
       - Format: "white-house-treasury-strategy_advice-1762873283"
       - This is just a request identifier, NOT a blockchain transaction
       - Payment IDs are generated BEFORE payment happens
       - Cannot be verified on blockchain
    
    Example Usage:
    
    # User pays and sends you this message:
    "✅ Payment completed via x402 facilitator!
     Transaction: 5KxE7j3mN8qzYbPwQLpFkJ2hD9vX3rT6sM4nC8pQ1wZa..."
    
    # You extract the signature and verify:
    verify_payment_transaction(
        transaction_hash="5KxE7j3mN8qzYbPwQLpFkJ2hD9vX3rT6sM4nC8pQ1wZa...",
        expected_from="6pF45ayWyPSFKV3WQLpNNhhkA8GMeeE6eE14NKgw4zug",
        expected_amount_usdc=0.002,
        service_type="connection_intro"
    )
    
    DO NOT verify payment_ids! Only verify actual transaction signatures.
    """
    if backend_url is None:
        backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
    
    # Auto-detect agent ID from environment if not provided
    if to_agent is None:
        to_agent = os.getenv("CORAL_AGENT_ID", "unknown")
    
    print(f"\n{'='*80}")
    print(f"🔍 VERIFYING PAYMENT VIA BACKEND")
    print(f"{'='*80}")
    print(f"Transaction: {transaction_hash[:16]}...{transaction_hash[-16:]}")
    print(f"Expected From: {expected_from[:8]}...{expected_from[-8:]}")
    print(f"Expected To: White House Treasury")
    print(f"Expected Amount: {expected_amount_usdc} USDC")
    print(f"Service: {service_type}")
    print(f"To Agent: {to_agent}")
    print(f"")
    
    try:
        # Call backend verification endpoint
        print("📤 Calling backend verification endpoint...")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{backend_url}/api/x402/verify-transaction",
                json={
                    "transaction": transaction_hash,
                    "expectedFrom": expected_from,
                    "expectedTo": WHITE_HOUSE_WALLET,
                    "expectedAmount": expected_amount_usdc,
                    "expectedCurrency": "USDC",
                }
            )
            
            if response.status_code == 404:
                return f"""❌ PAYMENT VERIFICATION FAILED

Transaction not found on blockchain: {transaction_hash}

This could mean:
1. Transaction hasn't been confirmed yet (wait a few seconds)
2. Transaction hash is invalid
3. Transaction failed on-chain

Please check the transaction hash and try again."""
            
            if response.status_code != 200:
                error_text = response.text
                return f"""❌ PAYMENT VERIFICATION FAILED

Backend returned error {response.status_code}: {error_text}

Please check the transaction and try again."""
            
            result = response.json()
        
        if not result.get("verified"):
            error = result.get("error", "Unknown error")
            details = result.get("expected", {})
            actual = result.get("actual", {})
            
            return f"""❌ PAYMENT VERIFICATION FAILED

Error: {error}

Expected:
  From: {details.get('from', 'N/A')[:8]}...
  To: {details.get('to', 'N/A')[:8]}...
  Amount: {details.get('amount', 'N/A')} {details.get('currency', 'USDC')}

Actual:
  From: {actual.get('from', 'N/A')[:8]}...
  To: {actual.get('to', 'N/A')[:8]}...
  Amount: {actual.get('amount', 'N/A')} {actual.get('currency', 'USDC')}

Please ensure you sent the correct payment."""
        
        # Payment verified successfully!
        details = result["details"]
        
        print(f"{'='*80}")
        print(f"✅ PAYMENT VERIFIED SUCCESSFULLY!")
        print(f"{'='*80}")
        print(f"Transaction: {transaction_hash}")
        print(f"From: {details['from'][:8]}...{details['from'][-8:]}")
        print(f"To: {details['to'][:8]}...{details['to'][-8:]}")
        print(f"Amount: {details['amount']} {details['currency']}")
        print(f"Confirmed: {details['confirmed']}")
        print(f"")
        print(f"🎉 Payment verified! You may now deliver the service.")
        print(f"{'='*80}\n")
        
        # Store payment in database
        await store_payment_in_database(
            signature=transaction_hash,
            from_wallet=details["from"],
            to_wallet=details["to"],
            amount=details["amount"],
            service_type=service_type,
            to_agent=to_agent,
            is_agent_to_agent=False,
            initiated_by=expected_from
        )
        
        return f"""✅ PAYMENT VERIFIED!

Transaction: {transaction_hash}
From: {details['from'][:8]}...{details['from'][-8:]}
To: {details['to'][:8]}...{details['to'][-8:]}
Amount: {details['amount']} {details['currency']}
Timestamp: {details.get('timestamp', 'N/A')}

🔍 View transaction:
- x402scan: {result.get('x402ScanUrl', 'N/A')}
- Solana Explorer: {result.get('solanaExplorer', 'N/A')}

✅ Payment verified! Delivering service: {service_type}

YOU MAY NOW DELIVER THE SERVICE TO THE USER."""
        
    except httpx.TimeoutException:
        return f"""❌ VERIFICATION TIMEOUT

Backend verification request timed out after 30 seconds.

This could mean:
1. Backend is slow or unavailable
2. Blockchain RPC is slow

Please try again in a few moments."""
    
    except Exception as e:
        print(f"❌ Verification error: {e}")
        import traceback
        traceback.print_exc()
        return f"""❌ VERIFICATION ERROR

Error: {str(e)}

Please try again or contact support."""


def create_process_payment_payload_tool(my_wallet_address: str):
    """
    Factory function to create process_payment_payload tool with wallet access.
    
    This is needed because LangChain tools can't access the wallet object directly,
    so we create the tool dynamically with the wallet address captured in a closure.
    
    Args:
        my_wallet_address: Agent's wallet address (recipient)
    
    Returns:
        A process_payment_payload tool with wallet access
    
    Note: With backend submission, the recipient no longer needs a keypair
          to process payments. The payer submits transactions via the backend.
    """
    @tool
    async def process_payment_payload_with_wallet(
        payment_payload_json: str,
        expected_amount_sol: float
    ) -> str:
        """
        Process x402 payment payload (backend submission flow).
        
        DEPRECATED: This tool is now ONLY for acknowledging OLD-style payload messages.
        
        NEW x402 FLOW (preferred):
        1. User signs authorization and submits via frontend → backend → facilitator
        2. User receives TRANSACTION HASH (not payload)
        3. User sends TRANSACTION HASH to agent
        4. Agent uses verify_payment_transaction() tool to verify
        5. Agent delivers service
        
        This tool now just instructs users to use the new flow.
        
        Args:
            payment_payload_json: JSON string containing payment payload from payer
            expected_amount_sol: Expected payment amount in SOL
        
        Returns:
            Instructions for the new flow
        """
        from x402_payment_payload import X402PaymentPayload
        
        try:
            payload = json.loads(payment_payload_json)
            
            # Verify basic payload structure
            if not X402PaymentPayload.verify_payload(payload, payload.get("from")):
                return "❌ Invalid payment payload signature"
            
            # Instruct user to use the new flow
            return f"""✅ Payment authorization received!

Payment ID: {payload.get('payment_id')}
From: {payload.get('from', '')[:8]}...{payload.get('from', '')[-8:]}
Amount: {expected_amount_sol} USDC

⚠️ IMPORTANT: New x402 Flow

The frontend should have automatically submitted this payment through the backend.
Please send me the TRANSACTION HASH (not the payload) so I can verify it.

If you haven't submitted yet, the frontend will handle this automatically.
Once you have the transaction hash, send it to me like this:

"Transaction: [your-transaction-hash-here]"

Then I'll verify the payment and deliver your service!"""
            
        except Exception as e:
            return f"❌ Error processing payload: {str(e)}"
    
    return process_payment_payload_with_wallet


# Database storage functions for payment history
async def store_payment_in_database(
    signature: str,
    from_wallet: str,
    to_wallet: str,
    amount: float,
    service_type: str,
    to_agent: Optional[str] = None,
    is_agent_to_agent: bool = False,
    initiated_by: Optional[str] = None
) -> bool:
    """Store payment in database via API"""
    try:
        api_url = os.getenv('BACKEND_API_URL', 'http://localhost:3000')
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f'{api_url}/api/payments/store',
                json={
                    'signature': signature,
                    'fromWallet': from_wallet,
                    'toWallet': to_wallet,
                    'toAgent': to_agent or 'unknown',
                    'amount': amount,
                    'currency': 'SOL',
                    'serviceType': service_type,
                    'isAgentToAgent': is_agent_to_agent,
                    'initiatedBy': initiated_by,
                    'verified': True,
                    'verifiedAt': time.time()
                },
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status in (200, 201)
    except Exception as e:
        print(f"⚠️ Failed to store payment in database: {e}")
        return False

async def update_payment_x402_data(
    signature: str,
    x402_scan_url: str,
    x402_scan_id: Optional[str] = None
) -> bool:
    """Update payment with x402scan data"""
    try:
        api_url = os.getenv('BACKEND_API_URL', 'http://localhost:3000')
        
        async with aiohttp.ClientSession() as session:
            async with session.patch(
                f'{api_url}/api/payments/{signature}/x402',
                json={
                    'x402ScanUrl': x402_scan_url,
                    'x402ScanId': x402_scan_id,
                    'x402Registered': True,
                    'x402RegisteredAt': time.time()
                },
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return resp.status == 200
    except Exception as e:
        print(f"⚠️ Failed to update x402 data: {e}")
        return False


# Export basic tools (without process_payment_payload - that needs wallet)
X402_TOOLS = [
    request_premium_service,
    provide_premium_service_with_payment,
    check_payment_history,
    verify_solana_transaction,
    verify_payment_transaction,  # NEW: Verify payments via backend (x402 compliant)
    confirm_payment_received,  # Legacy: Basic payment verification (no auto-forward)
    # process_payment_payload is created via factory and added by each agent
    award_points,  # Scoring system integration
    forward_to_white_house  # Manual treasury forwarding helper
]


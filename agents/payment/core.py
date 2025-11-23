"""
Core payment utilities and shared types

Contains wallet management, payment ID extraction, and basic configuration.
"""

import os
import re
import json
from typing import Dict, Optional


def load_agent_wallets(suppress_warning: bool = False) -> Dict[str, str]:
    """
    Load agent wallet addresses from environment variables.
    
    Args:
        suppress_warning: If True, don't print warnings about missing wallets
    
    Returns:
        Dictionary mapping agent names to wallet addresses
    """
    wallets = {
        "trump-donald": os.getenv("WALLET_DONALD_TRUMP", ""),
        "trump-melania": os.getenv("WALLET_MELANIA_TRUMP", ""),
        "trump-eric": os.getenv("WALLET_ERIC_TRUMP", ""),
        "trump-donjr": os.getenv("WALLET_DONJR_TRUMP", ""),
        "trump-barron": os.getenv("WALLET_BARRON_TRUMP", ""),
        "cz": os.getenv("WALLET_CZ", ""),
    }
    
    # Filter out empty values and warn about missing wallets
    missing = [agent for agent, addr in wallets.items() if not addr]
    if missing and not suppress_warning:
        print(f"⚠️  Warning: Missing wallet addresses for: {', '.join(missing)}")
        print("   Please set WALLET_[AGENT] environment variables in .env")
    
    # Return only configured wallets
    return {agent: addr for agent, addr in wallets.items() if addr}


# Agent wallet directory (for cross-agent transactions and payment requests)
# NOTE: "sbf" is NOT included - SBF is user-controlled via browser wallet
AGENT_WALLETS = load_agent_wallets(suppress_warning=True)

# White House Treasury - Central revenue collection (CRITICAL SECURITY)
WHITE_HOUSE_WALLET = os.getenv("WALLET_WHITE_HOUSE", "")


def reload_agent_wallets():
    """Reload agent wallet addresses after .env file is loaded."""
    global AGENT_WALLETS, WHITE_HOUSE_WALLET
    AGENT_WALLETS = load_agent_wallets()
    WHITE_HOUSE_WALLET = os.getenv("WALLET_WHITE_HOUSE", "")
    if not WHITE_HOUSE_WALLET:
        print("⚠️  WARNING: WALLET_WHITE_HOUSE not configured!")
        print("   All user payments should be forwarded to the White House treasury")


def get_backend_url() -> str:
    """
    Get backend URL from environment.
    
    Returns:
        Backend URL string
    """
    return os.getenv("BACKEND_URL", "http://localhost:3000")


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


# Payment ledger - tracks pending and completed payments
# This is an in-memory store and will be lost on restart
payment_ledger = {
    "pending": {},  # payment_id -> {from, to, amount, reason, timestamp}
    "completed": {}  # signature -> {from, to, amount, verified_at}
}


"""
x402 Solana Adapter - Payment Token Edition

Adapter to make Solana SPL token payments work with x402 protocol standard.
This bridges the gap between Solana's blockchain and the x402 payment protocol,
ensuring compliance with x402scan.com and the broader x402 community.

All payments use SPL Token for full x402 compliance.
The x402 SDK only supports SPL Token transfers, not native SOL.

Reference: https://github.com/coinbase/x402
Standard: x402 Protocol v1.0
"""

from typing import Dict, Optional, Any
import time
import json

# =============================================================================
# PAYMENT TOKEN CONFIGURATION
# =============================================================================
# 🔄 CHANGE ONLY THESE 3 VALUES TO REPLACE THE TOKEN:
# =============================================================================

# Payment token mint address (Solana SPL token)
# Update this value when switching to production token
PAYMENT_TOKEN_MINT = "A38LewMbt9t9HvNUrsPtHQPHLfEPVT5rfadN4VqBbonk"

# Payment token decimals
# Update this value if production token uses different decimals
PAYMENT_TOKEN_DECIMALS = 6

# Payment token name (for display)
# Update this value when switching to production token (e.g., 'PARDON')
PAYMENT_TOKEN_NAME = "PARDON"

# =============================================================================
# DO NOT CHANGE BELOW
# =============================================================================


class X402SolanaAdapter:
    """
    Adapts x402 protocol for Solana blockchain using configured payment token.
    
    Converts Solana-specific payment token details into x402-compliant format
    that can be recognized by x402scan.com and other x402 tools.
    """
    
    def __init__(self, network: str = "mainnet-beta"):
        """
        Initialize the adapter.
        
        Args:
            network: Solana network (mainnet-beta, devnet, testnet)
        """
        self.chain = "solana"
        self.network = network
        self.protocol_version = "1.0"
        self.payment_token_mint = PAYMENT_TOKEN_MINT
        self.payment_token_decimals = PAYMENT_TOKEN_DECIMALS
        self.payment_token_name = PAYMENT_TOKEN_NAME
    
    def create_payment_request(
        self,
        resource_url: str,
        method: str,
        recipient_id: str,
        recipient_address: str,
        amount: float,
        service_type: str = "",
        details: str = "",
        provider_agent: str = None,
        target_agent: str = None
    ) -> Dict[str, Any]:
        """
        Create x402-compliant payment request for Solana using configured payment token.
        
        This format follows the x402 protocol standard and includes
        all necessary fields for x402scan.com recognition.
        
        Args:
            resource_url: URL/identifier of the resource being paid for
            method: HTTP method (POST, GET, etc.)
            recipient_id: Human-readable recipient identifier (agent name)
            recipient_address: Solana wallet address
            amount: Amount in payment token (e.g., 0.01)
            service_type: Type of service (e.g., "insider_info")
            details: Additional details about the service
            provider_agent: Agent providing the service (e.g., "trump-donald")
            target_agent: For connection_intro - the agent to contact (e.g., "trump-barron")
        
        Returns:
            x402-compliant payment request dictionary
        """
        # Enhanced payment_id with agent context
        # CRITICAL: Normalize agent names to use underscores instead of dashes
        # This makes payment_id parsing unambiguous since we use "-" as delimiter
        # Example: trump-donald → trump_donald in payment_id
        if service_type == "connection_intro" and target_agent and provider_agent:
            # Include target agent for connection_intro
            provider_normalized = provider_agent.replace("-", "_")
            target_normalized = target_agent.replace("-", "_")
            payment_id = f"wht-{provider_normalized}-{service_type}-{target_normalized}-{int(time.time())}"
        elif provider_agent:
            # Include provider agent for all other services
            provider_normalized = provider_agent.replace("-", "_")
            payment_id = f"wht-{provider_normalized}-{service_type}-{int(time.time())}"
        else:
            # Fallback to old format for backward compatibility
            recipient_normalized = recipient_id.replace("-", "_")
            payment_id = f"{recipient_normalized}-{service_type}-{int(time.time())}"
        
        # All payments use the configured payment token
        currency = self.payment_token_name
        mint_address = self.payment_token_mint
        decimals = self.payment_token_decimals
        micro_amount = str(int(amount * (10 ** decimals)))
        human_readable = f"{amount} {currency}"
        
        return {
            # Core x402 protocol fields
            "type": "x402_payment_required",
            "protocol_version": self.protocol_version,
            
            # Blockchain-specific fields
            "chain": self.chain,
            "network": self.network,
            "payment_method": "spl_token",  # SPL Token payment
            
            # Recipient information (nested object per x402 standard)
            "recipient": {
                "id": recipient_id,
                "address": recipient_address,
                "chain": self.chain
            },
            
            # Amount information (nested object with proper decimals)
            "amount": {
                "value": micro_amount,
                "currency": currency,
                "decimals": decimals,
                "human_readable": human_readable,
                "mint": mint_address  # Token mint address (required for x402!)
            },
            
            # Resource information (what's being paid for)
            "resource": {
                "url": resource_url,
                "method": method,
                "description": service_type.replace('_', ' ').title()
            },
            
            # Payment tracking
            "payment_id": payment_id,
            "expires_at": int(time.time()) + 600,  # 10 minutes
            
            # Legacy fields for backward compatibility
            "recipient_address": recipient_address,  # Flat field for easy access
            "amount": amount,  # Payment token amount
            "currency": currency,  # Current currency being used
            "reason": f"{service_type.replace('_', ' ').title()} - {details}",
            "service_type": service_type,
            "timestamp": time.time(),
            
            # Additional metadata
            "metadata": {
                "service": service_type,
                "details": details,
                "agent": recipient_id,
                "provider_agent": provider_agent,
                "target_agent": target_agent,
                "token": currency,
                "mint": mint_address
            }
        }
    
    def create_payment_verification_request(
        self,
        signature: str,
        expected_recipient: str,
        expected_amount: float,
        payment_id: str
    ) -> Dict[str, Any]:
        """
        Create verification request for a Solana payment token transaction.
        
        Args:
            signature: Solana transaction signature
            expected_recipient: Expected recipient wallet address
            expected_amount: Expected amount in payment token
            payment_id: Payment ID from the original request
        
        Returns:
            Verification request dictionary
        """
        return {
            "signature": signature,
            "chain": self.chain,
            "network": self.network,
            "expected_recipient": expected_recipient,
            "expected_amount": {
                "value": str(int(expected_amount * (10 ** self.payment_token_decimals))),
                "currency": self.payment_token_name,
                "decimals": self.payment_token_decimals,
                "mint": self.payment_token_mint
            },
            "payment_id": payment_id,
            "protocol_version": self.protocol_version
        }
    
    def create_payment_confirmation(
        self,
        signature: str,
        payment_id: str,
        from_address: str,
        to_address: str,
        amount_usdc: float,
        service_content: str
    ) -> Dict[str, Any]:
        """
        Create payment confirmation after successful verification.
        
        Args:
            signature: Solana transaction signature
            payment_id: Payment ID
            from_address: Sender wallet address
            to_address: Recipient wallet address
            amount_usdc: Amount in USDC
            service_content: The service/content being delivered
        
        Returns:
            Payment confirmation dictionary
        """
        return {
            "type": "x402_payment_confirmed",
            "protocol_version": self.protocol_version,
            "payment_id": payment_id,
            "chain": self.chain,
            "network": self.network,
            "signature": signature,
            "from": from_address,
            "to": to_address,
            "amount": {
                "value": str(int(amount_usdc * (10 ** PAYMENT_TOKEN_DECIMALS))),
                "currency": PAYMENT_TOKEN_NAME,
                "decimals": PAYMENT_TOKEN_DECIMALS,
                "mint": self.payment_token_mint
            },
            "verified_at": int(time.time()),
            "service_delivered": True,
            "service_content": service_content,
            # For x402scan.com registration
            "explorer_url": f"https://solscan.io/tx/{signature}",
            "x402_scan_url": f"https://www.x402scan.com/tx/{signature}?chain=solana"
        }
    
    def format_x402_response(self, payment_request: Dict[str, Any]) -> str:
        """
        Format payment request as x402 response message.
        
        Creates a human-readable message with embedded JSON for protocol compliance.
        
        Args:
            payment_request: Payment request dictionary
        
        Returns:
            Formatted x402 response string
        """
        # Extract amount (try new field first, fallback to old field)
        amount = payment_request.get("amount_usdc")
        if amount is None:
            amount_obj = payment_request.get("amount", {})
            if isinstance(amount_obj, dict):
                amount = float(amount_obj.get("value", 0)) / (10 ** PAYMENT_TOKEN_DECIMALS)
            else:
                amount = 0
        
        service = payment_request.get("service_type", "service").replace('_', ' ').title()
        recipient = payment_request.get("recipient", {})
        if isinstance(recipient, dict):
            recipient_name = recipient.get("id", "agent")
        else:
            recipient_name = recipient
        
        response = f"""💰 402 PAYMENT REQUIRED

Service: {service}
Provider: {recipient_name}
Amount: {amount} USDC
Protocol: x402 v{self.protocol_version}

Payment ID: {payment_request['payment_id']}

<x402_payment_request>
{json.dumps(payment_request, indent=2)}
</x402_payment_request>
"""
        return response
    
    def parse_payment_request(self, message: str) -> Optional[Dict[str, Any]]:
        """
        Parse payment request from message content.
        
        Args:
            message: Message containing payment request
        
        Returns:
            Parsed payment request or None if not found
        """
        try:
            # Look for embedded JSON in x402 tags
            import re
            match = re.search(
                r'<x402_payment_request>(.*?)</x402_payment_request>',
                message,
                re.DOTALL
            )
            
            if match:
                json_str = match.group(1).strip()
                return json.loads(json_str)
        except Exception as e:
            print(f"❌ Failed to parse payment request: {e}")
        
        return None


# Global adapter instance
_adapter_instance = None


def get_x402_adapter(network: str = "mainnet-beta") -> X402SolanaAdapter:
    """
    Get or create the global x402 Solana adapter instance.
    
    Args:
        network: Solana network
    
    Returns:
        X402SolanaAdapter instance
    """
    global _adapter_instance
    if _adapter_instance is None:
        _adapter_instance = X402SolanaAdapter(network)
    return _adapter_instance

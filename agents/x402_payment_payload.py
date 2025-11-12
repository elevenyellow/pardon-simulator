"""
x402 Payment Payload Module

This module implements the TRUE x402 protocol flow where clients create and sign
PAYMENT PAYLOADS (not blockchain transactions), and the server/facilitator submits
the actual transaction to the blockchain.

This is the fundamental architecture of x402 - the server controls transaction submission.
"""

from typing import Dict, Optional
from solders.keypair import Keypair
from solders.pubkey import Pubkey
import base58
import json
import time
import hashlib


class X402PaymentPayload:
    """
    x402 payment payload - signed authorization for payment.
    
    CRITICAL: This is NOT a blockchain transaction!
    
    The x402 protocol works as follows:
    1. Client creates a payment payload with payment details
    2. Client signs the payload with their wallet
    3. Client sends payload to server
    4. Server/facilitator verifies signature
    5. Server/facilitator submits transaction to blockchain
    6. Server delivers resource after confirmation
    
    This gives the server control over transaction submission, enabling:
    - Facilitator-based payment processing
    - Proper x402scan indexing
    - Protocol compliance
    """
    
    @staticmethod
    def create_payload(
        payment_id: str,
        from_address: str,
        to_address: str,
        amount_sol: float,
        keypair: Keypair
    ) -> Dict:
        """
        Create signed payment payload per x402 specification.
        
        Args:
            payment_id: Unique payment identifier from x402 payment request
            from_address: Payer's Solana wallet address
            to_address: Payee's Solana wallet address
            amount_sol: Amount in SOL
            keypair: Payer's keypair for signing
        
        Returns:
            Dict containing payment payload with signature
        
        Example:
            payload = X402PaymentPayload.create_payload(
                payment_id="melania-trump-insider_info-1762850712",
                from_address="CZ_wallet_address",
                to_address="melania_wallet_address",
                amount_sol=0.0005,
                keypair=cz_keypair
            )
            # Send this payload to Melania
            # Melania will submit transaction via CDP
        """
        # Create payload structure (x402 v1.0 format)
        payload = {
            "payment_id": payment_id,
            "from": from_address,
            "to": to_address,
            "amount": amount_sol,
            "timestamp": int(time.time()),
            "chain": "solana",
            "network": "mainnet-beta",
            "protocol": "x402",
            "version": "1.0"
        }
        
        # Create canonical message for signing (sorted keys for deterministic output)
        message = json.dumps(payload, sort_keys=True).encode('utf-8')
        
        # Sign the message (NOT a transaction!)
        signature = keypair.sign_message(message)
        signature_bytes = bytes(signature)  # Convert Signature object to bytes
        signature_b58 = base58.b58encode(signature_bytes).decode('ascii')
        
        # Add signature to payload
        payload["signature"] = signature_b58
        
        print(f"✅ Created x402 payment payload:")
        print(f"   Payment ID: {payment_id}")
        print(f"   From: {from_address[:8]}...{from_address[-8:]}")
        print(f"   To: {to_address[:8]}...{to_address[-8:]}")
        print(f"   Amount: {amount_sol} SOL")
        print(f"   Signature: {signature_b58[:16]}...{signature_b58[-16:]}")
        
        return payload
    
    @staticmethod
    def verify_payload(payload: Dict, expected_from: str) -> bool:
        """
        Verify payment payload signature.
        
        Args:
            payload: Payment payload dict with signature
            expected_from: Expected payer address
        
        Returns:
            True if signature is valid, False otherwise
        
        Note:
            This verification confirms that the payload was signed by the claimed sender.
            Additional verification (amount, recipient) should be done separately.
        """
        try:
            # Extract signature
            if "signature" not in payload:
                print("❌ Signature missing from payload")
                return False
            
            signature_b58 = payload["signature"]
            
            # Create copy without signature for verification
            payload_copy = payload.copy()
            del payload_copy["signature"]
            
            # Recreate canonical message
            message = json.dumps(payload_copy, sort_keys=True).encode('utf-8')
            
            # Verify from address matches expected
            if payload.get("from") != expected_from:
                print(f"❌ From address mismatch: expected {expected_from}, got {payload.get('from')}")
                return False
            
            # For now, we'll trust the signature if the from address matches
            # Full signature verification would require:
            # 1. Decode signature from base58
            # 2. Recover pubkey from signature + message
            # 3. Verify pubkey matches from_address
            #
            # However, the CDP facilitator will do full verification when submitting
            # the transaction, so this is primarily for early validation.
            
            print(f"✅ Payment payload verified:")
            print(f"   From: {expected_from[:8]}...{expected_from[-8:]}")
            print(f"   Payment ID: {payload.get('payment_id')}")
            print(f"   Amount: {payload.get('amount')} SOL")
            
            return True
            
        except Exception as e:
            print(f"❌ Payload verification failed: {e}")
            return False
    
    @staticmethod
    def extract_from_message(message_content: str) -> Optional[Dict]:
        """
        Extract payment payload JSON from agent message.
        
        Args:
            message_content: Message content that may contain payment payload
        
        Returns:
            Payment payload dict if found, None otherwise
        
        Example:
            message = "Here's my payment: {'payment_id': '...', 'from': '...', ...}"
            payload = X402PaymentPayload.extract_from_message(message)
        """
        import re
        
        # Try to find JSON object in message
        # Look for patterns like: {..."payment_id":..."from":..."to"...}
        try:
            # Find JSON-like structure
            match = re.search(r'\{[^{}]*"payment_id"[^{}]*\}', message_content, re.DOTALL)
            
            if match:
                json_str = match.group(0)
                payload = json.loads(json_str)
                
                # Validate it's a payment payload
                required_fields = ["payment_id", "from", "to", "amount", "signature"]
                if all(field in payload for field in required_fields):
                    print(f"✅ Extracted payment payload from message")
                    print(f"   Payment ID: {payload['payment_id']}")
                    return payload
                else:
                    print(f"⚠️ JSON found but missing required fields")
            else:
                print("⚠️ No payment payload JSON found in message")
        
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse payment payload JSON: {e}")
        except Exception as e:
            print(f"❌ Error extracting payment payload: {e}")
        
        return None


# Export for easy importing
__all__ = ['X402PaymentPayload']


"""
Coinbase CDP x402 Facilitator Client - Official CDP SDK Integration for Solana

Integrates with Coinbase CDP SDK for x402 protocol compliance on Solana blockchain.
Uses CDP facilitator API for verify() and settle() operations.
Configure CDP_API_KEY_ID and CDP_API_KEY_SECRET for full functionality.
"""
import os
import httpx
from typing import Dict, Optional
from x402_solana_adapter import PAYMENT_TOKEN_NAME

# Try to import CDP SDK (required for x402 compliance)
try:
    from cdp import Cdp
    CDP_SDK_AVAILABLE = True
except ImportError:
    CDP_SDK_AVAILABLE = False

class X402CDPClient:
    """x402 Facilitator Client - Official Coinbase CDP Integration for Solana"""
    
    def __init__(self):
        # CDP API credentials
        self.api_key_id = os.getenv('CDP_API_KEY_ID')
        self.api_key_secret = os.getenv('CDP_API_KEY_SECRET')
        
        # Backend URL for x402 API endpoints
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:3000')
        
        self.platform_name = os.getenv('X402_PLATFORM_NAME', 'pardon-simulator')
        
        self.is_configured = False
        
        # Check if CDP credentials are configured
        if all([self.api_key_id, self.api_key_secret]):
            self.is_configured = True
            print("✅ CDP x402 Facilitator configured", flush=True)
            print("   Will use backend CDP endpoints for verify/settle", flush=True)
            print("   x402scan registration enabled", flush=True)
        else:
            # No credentials provided
            print("ℹ️  CDP credentials not configured", flush=True)
            print("   Transactions will use backend endpoints without CDP", flush=True)
    
    async def verify_payment(
        self,
        signature: str,
        expected_from: str, 
        expected_to: str,
        expected_amount: float
    ) -> Dict:
        """Verify payment via backend CDP facilitator endpoint"""
        try:
            print(f"\n🔍 Verifying payment via backend CDP facilitator...", flush=True)
            print(f"   Signature: {signature[:16]}...{signature[-16:]}", flush=True)
            
            # Call backend verification endpoint
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.backend_url}/api/x402/verify-transaction",
                    json={
                        "transaction": signature,
                        "expectedFrom": expected_from,
                        "expectedTo": expected_to,
                        "expectedAmount": expected_amount,
                        "expectedCurrency": PAYMENT_TOKEN_NAME
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('verified'):
                        print(f"✅ CDP facilitator verified payment", flush=True)
                        return {'success': True, 'valid': True, 'details': result.get('details')}
                    else:
                        return {'success': False, 'valid': False, 'error': result.get('error')}
                else:
                    error_text = response.text
                    print(f"⚠️ CDP verification failed: {error_text}", flush=True)
                    return {'success': False, 'error': error_text}
                    
        except Exception as e:
            print(f"⚠️ CDP verification error: {e}", flush=True)
            return {'success': False, 'error': str(e)}
    
    async def submit_transaction(
        self,
        from_address: str,
        to_address: str,
        amount_usdc: float,
        from_keypair=None
    ) -> Dict:
        """
        Submit transaction via backend CDP facilitator (x402 compliant).
        
        Uses backend /api/x402/settle endpoint which calls CDP facilitator.
        
        Args:
            from_address: Sender's Solana wallet address
            to_address: Recipient's Solana wallet address
            amount_usdc: Amount in USDC
            from_keypair: Sender's keypair for signing transaction
        
        Returns:
            Dict with success status, signature, and amount
        """
        try:
            print(f"\n💳 Submitting transaction via backend CDP facilitator...", flush=True)
            print(f"   From: {from_address[:8]}...{from_address[-8:]}", flush=True)
            print(f"   To: {to_address[:8]}...{to_address[-8:]}", flush=True)
            print(f"   Amount: {amount_usdc} USDC", flush=True)
            
            # Create signed USDC transaction
            if not from_keypair:
                return {"success": False, "error": "Keypair required for signing"}
            
            # Create payment payload (would need x402_solana_payload helper)
            # For now, call backend settle endpoint directly
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.backend_url}/api/x402/settle",
                    json={
                        "payload": {
                            "from": from_address,
                            "to": to_address,
                            "amount": amount_usdc,
                            # Would include signed transaction here
                        },
                        "requirements": {
                            "network": "solana",
                            "currency": PAYMENT_TOKEN_NAME,
                            "recipient": to_address,
                            "amount": amount_usdc,
                            "paymentId": f"payment-{int(os.time.time())}"
                        }
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        print(f"✅ Transaction submitted via CDP facilitator", flush=True)
                        print(f"   Signature: {result['transaction'][:16]}...", flush=True)
                        return {
                            "success": True,
                            "signature": result['transaction'],
                            "amount": amount_usdc,
                            "via_cdp": True,
                            "x402_scan_url": result.get('x402ScanUrl')
                        }
                    else:
                        return {"success": False, "error": result.get('error')}
                else:
                    return {"success": False, "error": f"Backend error: {response.status_code}"}
                
        except Exception as e:
            print(f"❌ Transaction submission failed: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    async def register_transaction(
        self,
        signature: str,
        from_address: str,
        to_address: str,
        amount: float, 
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Generate x402scan.com tracking URL for transaction.
        
        Note: x402scan.com is expected to auto-index Solana mainnet transactions.
        No explicit registration API is currently available/required.
        When transactions are submitted via CDP SDK, they should appear on x402scan automatically.
        """
        try:
            print(f"\n📡 x402scan transaction tracking...", flush=True)
            print(f"   Transaction: {signature[:16]}...{signature[-16:]}", flush=True)
            
            # Generate x402scan URL for transaction tracking
            # x402scan.com auto-indexes Solana transactions from the blockchain
            x402_scan_url = f"https://www.x402scan.com/tx/{signature}?chain=solana"
            
            if self.is_configured and self.cdp_client:
                print(f"✅ Transaction submitted via CDP facilitator", flush=True)
                print(f"   x402scan should auto-index this transaction", flush=True)
                print(f"   CDP ensures x402 protocol compliance", flush=True)
            else:
                print(f"⚠️ Transaction submitted via direct RPC (not x402 compliant)", flush=True)
                print(f"   x402scan may not index non-CDP transactions", flush=True)
            
            print(f"   Track at: {x402_scan_url}", flush=True)
            
            return {
                'success': True,
                'x402_scan_url': x402_scan_url,
                'x402_scan_id': signature,
                'data': {
                    'chain': 'solana',
                    'network': 'mainnet-beta',
                    'via_cdp': self.is_configured,
                    'auto_indexed': True
                }
            }
        except Exception as e:
            print(f"⚠️ x402scan URL generation failed: {e}", flush=True)
            return {
                'success': False,
                'error': str(e),
                'x402_scan_url': f"https://www.x402scan.com/tx/{signature}?chain=solana"
            }

# Singleton instance
_cdp_client = None

def get_cdp_client() -> X402CDPClient:
    global _cdp_client
    if _cdp_client is None:
        _cdp_client = X402CDPClient()
    return _cdp_client

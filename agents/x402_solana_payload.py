"""
x402 Solana Payment Payload Creator - USDC Edition

Creates properly formatted x402 payment payloads for Solana using USDC SPL Tokens
that are compatible with the CDP facilitator settle() API.

⚠️ IMPORTANT: The x402 SDK ONLY supports SPL Token transfers, NOT native SOL!

Format matches the official x402 Solana specification:
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana" | "solana-devnet",
  "payload": {
    "transaction": "<base64-encoded signed Solana transaction>"
  }
}
"""

from typing import Dict
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.hash import Hash
from solders.message import Message
from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price
from spl.token.instructions import transfer_checked, TransferCheckedParams
from spl.token.constants import TOKEN_PROGRAM_ID
import base64
import os


# USDC Mint Addresses
USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
USDC_DECIMALS = 6  # USDC uses 6 decimals, not 9 like SOL


def get_usdc_mint_address(network: str) -> str:
    """Get the USDC mint address for the specified network."""
    if network == "solana-devnet":
        return USDC_MINT_DEVNET
    return USDC_MINT_MAINNET


def get_associated_token_address(wallet_address: Pubkey, mint_address: Pubkey) -> Pubkey:
    """
    Calculate the Associated Token Account (ATA) address for a wallet and mint.
    
    Args:
        wallet_address: The wallet's public key
        mint_address: The token mint's public key
    
    Returns:
        The ATA public key
    """
    # Import here to avoid circular dependencies
    from spl.token.instructions import get_associated_token_address as spl_get_ata
    
    return spl_get_ata(
        owner=wallet_address,
        mint=mint_address
    )


def create_x402_solana_payment_payload(
    from_keypair: Keypair,
    to_address: str,
    amount_usdc: float,
    recent_blockhash: str,
    network: str = "solana"
) -> Dict:
    """
    Create x402-compliant Solana payment payload with signed USDC transaction.
    
    This creates a payload that can be submitted to the CDP facilitator settle() API.
    
    ✅ FULLY x402 COMPLIANT - Uses SPL Token (USDC) as required by x402 SDK
    
    IMPORTANT: The x402 SDK requires EXACTLY 3 instructions in this order:
    1. Compute Unit Limit instruction
    2. Compute Unit Price instruction
    3. TransferChecked instruction (SPL Token)
    
    Args:
        from_keypair: Payer's Solana keypair (will sign the transaction)
        to_address: Recipient's Solana wallet address
        amount_usdc: Amount to transfer in USDC (e.g., 0.01 USDC)
        recent_blockhash: Recent blockhash from Solana (for transaction lifetime)
        network: "solana" for mainnet or "solana-devnet" for devnet
    
    Returns:
        Dict in x402 Solana format ready for CDP facilitator
    
    Example:
        payload = create_x402_solana_payment_payload(
            from_keypair=wallet.keypair,
            to_address="recipient_wallet_address",
            amount_usdc=0.5,  # 0.5 USDC
            recent_blockhash=blockhash,
            network="solana"
        )
        # Send this to backend /api/x402/submit-solana endpoint
    """
    # Convert address string to Pubkey
    from_pubkey = from_keypair.pubkey()
    
    # VALIDATE and clean the recipient address
    to_address = to_address.strip()
    
    # Check if it's a formatted response like "[OK] cz's wallet address: BSX3Y..."
    if ":" in to_address:
        # Extract just the address part after the colon
        to_address = to_address.split(":")[-1].strip()
    
    # Validate it's a proper Solana address (Base58, typically 32-44 chars)
    if not to_address or len(to_address) < 32 or len(to_address) > 44:
        raise ValueError(f"Invalid Solana address format: '{to_address}'. Must be 32-44 character Base58 string.")
    
    try:
        to_pubkey = Pubkey.from_string(to_address)
    except Exception as e:
        raise ValueError(f"Invalid Solana address '{to_address}': {str(e)}")
    
    # Get USDC mint address for this network
    usdc_mint_str = get_usdc_mint_address(network)
    usdc_mint = Pubkey.from_string(usdc_mint_str)
    
    # Convert USDC to smallest unit (USDC uses 6 decimals)
    # 1 USDC = 1,000,000 (6 decimals)
    usdc_amount = int(amount_usdc * (10 ** USDC_DECIMALS))
    
    # Calculate Associated Token Accounts (ATAs) for sender and receiver
    from_ata = get_associated_token_address(from_pubkey, usdc_mint)
    to_ata = get_associated_token_address(to_pubkey, usdc_mint)
    
    # x402 REQUIRES exactly 3 instructions in this order:
    # 1. Compute unit limit instruction
    # 2. Compute unit price instruction
    # 3. TransferChecked instruction (SPL Token)
    
    # Create compute budget instructions (REQUIRED by x402 SDK)
    compute_limit_ix = set_compute_unit_limit(200_000)  # Standard limit for token transfer
    compute_price_ix = set_compute_unit_price(1)  # Minimum price (1 micro-lamport per compute unit)
    
    # Create SPL Token TransferChecked instruction
    # This is what x402 expects: a TransferChecked instruction, not a simple transfer
    transfer_ix = transfer_checked(
        TransferCheckedParams(
            program_id=TOKEN_PROGRAM_ID,
            source=from_ata,
            mint=usdc_mint,
            dest=to_ata,
            owner=from_pubkey,
            amount=usdc_amount,
            decimals=USDC_DECIMALS,
            signers=[]
        )
    )
    
    # Create transaction
    # Parse blockhash string to Hash object
    blockhash_obj = Hash.from_string(recent_blockhash)
    
    # Create message with ALL 3 instructions in EXACT order required by x402
    message = Message.new_with_blockhash(
        [compute_limit_ix, compute_price_ix, transfer_ix],
        from_pubkey,
        blockhash_obj
    )
    
    # Sign the transaction
    transaction = Transaction([from_keypair], message, blockhash_obj)
    
    # Serialize transaction to bytes and encode as base64
    tx_bytes = bytes(transaction)
    tx_base64 = base64.b64encode(tx_bytes).decode('utf-8')
    
    # Create x402 payment payload
    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": network,
        "payload": {
            "transaction": tx_base64
        }
    }
    
    return payload


async def get_recent_blockhash_for_network(network: str = "solana") -> str:
    """
    Get recent blockhash from Solana network.
    
    Args:
        network: "solana" for mainnet or "solana-devnet" for devnet
    
    Returns:
        Recent blockhash as string
    """
    from solana.rpc.async_api import AsyncClient
    
    # Determine RPC URL
    if network == "solana-devnet":
        rpc_url = "https://api.devnet.solana.com"
    else:
        # Use Helius for mainnet
        rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
    
    client = AsyncClient(rpc_url)
    
    try:
        response = await client.get_latest_blockhash()
        if response.value:
            blockhash = str(response.value.blockhash)
            return blockhash
        else:
            raise Exception("Failed to get recent blockhash")
    finally:
        await client.close()


def create_payment_requirements(
    pay_to: str,
    amount_usdc: float,
    network: str = "solana",
    resource: str = "premium_service",
    description: str = "Payment for premium service"
) -> Dict:
    """
    Create payment requirements dict for x402 facilitator.
    
    ✅ USES USDC MINT ADDRESS - Required for x402 compliance
    
    Args:
        pay_to: Recipient's Solana wallet address
        amount_usdc: Amount in USDC (e.g., 0.5 for 0.5 USDC)
        network: "solana" or "solana-devnet"
        resource: Resource identifier
        description: Human-readable description
    
    Returns:
        Payment requirements dict for x402 facilitator
    """
    # Get USDC mint address for this network
    usdc_mint = get_usdc_mint_address(network)
    
    # Convert to smallest unit (USDC has 6 decimals)
    usdc_amount = int(amount_usdc * (10 ** USDC_DECIMALS))
    
    return {
        "scheme": "exact",
        "network": network,
        "maxAmountRequired": str(usdc_amount),  # Amount in smallest unit (micro-USDC)
        "resource": resource,
        "description": description,
        "mimeType": "application/json",
        "payTo": pay_to,
        "maxTimeoutSeconds": 300,
        "asset": usdc_mint,  # USDC mint address (REQUIRED for x402!)
    }

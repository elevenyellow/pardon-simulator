#!/usr/bin/env python3
"""
Derive Solana public addresses from private keys.
Used by GitHub Actions to automatically generate SOLANA_PUBLIC_ADDRESS
environment variables for each agent.
"""

import os
import sys
import json

try:
    from solders.keypair import Keypair
except ImportError:
    print("Error: solders package not found. Install with: pip install solders", file=sys.stderr)
    sys.exit(1)


def derive_public_key(private_key_b58):
    """Derive public address from base58 private key"""
    try:
        keypair = Keypair.from_base58_string(private_key_b58)
        return str(keypair.pubkey())
    except Exception as e:
        print(f"Error deriving public key: {e}", file=sys.stderr)
        return None


def main():
    """Main function to derive all agent public addresses"""
    
    # Agent private key environment variables
    agent_keys = {
        'cz': 'SOLANA_PRIVATE_KEY_CZ',
        'sbf': 'SOLANA_PRIVATE_KEY_SBF',
        'trump-donald': 'SOLANA_PRIVATE_KEY_TRUMP_DONALD',
        'trump-melania': 'SOLANA_PRIVATE_KEY_TRUMP_MELANIA',
        'trump-eric': 'SOLANA_PRIVATE_KEY_TRUMP_ERIC',
        'trump-donjr': 'SOLANA_PRIVATE_KEY_TRUMP_DONJR',
        'trump-barron': 'SOLANA_PRIVATE_KEY_TRUMP_BARRON',
    }
    
    public_addresses = {}
    
    for agent, env_var in agent_keys.items():
        private_key = os.getenv(env_var)
        
        if not private_key:
            print(f"Warning: {env_var} not found in environment", file=sys.stderr)
            continue
        
        public_key = derive_public_key(private_key)
        
        if public_key:
            public_addresses[agent] = public_key
        else:
            print(f"Error: Failed to derive public key for {agent}", file=sys.stderr)
            sys.exit(1)
    
    # Output as JSON
    print(json.dumps(public_addresses, indent=2))


if __name__ == "__main__":
    main()


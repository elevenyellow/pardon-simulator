/**
 * Token Configuration for Payment System
 * 
 * ⚠️ TO REPLACE TOKEN: Only change the values in PAYMENT_TOKEN section below!
 * All other files import from this config.
 */

import { PublicKey } from '@solana/web3.js';

// =============================================================================
// PAYMENT TOKEN CONFIGURATION
// =============================================================================
// 🔄 CHANGE ONLY THESE 3 VALUES TO REPLACE THE TOKEN:
// =============================================================================

/**
 * Payment token mint address (Solana SPL token)
 * Update this value when switching to production token
 */
export const PAYMENT_TOKEN_MINT = 'A38LewMbt9t9HvNUrsPtHQPHLfEPVT5rfadN4VqBbonk';

/**
 * Payment token decimals
 * Update this value if production token uses different decimals
 */
export const PAYMENT_TOKEN_DECIMALS = 6;

/**
 * Payment token name (for display in UI)
 * Update this value when switching to production token (e.g., 'PARDON')
 */
export const PAYMENT_TOKEN_NAME = 'PARDON';

// =============================================================================
// DO NOT CHANGE BELOW - Everything else uses the values above
// =============================================================================

// Native SOL (Wrapped SOL mint for x402 compatibility)
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';
export const SOL_DECIMALS = 9;

// USDC SPL Token (kept for backward compatibility / fallback)
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

// Message Fee Configuration (uses payment token)
export const MESSAGE_FEE_CONFIG = {
  amount: 1000,
  currency: PAYMENT_TOKEN_NAME,
  mint: PAYMENT_TOKEN_MINT,
  decimals: PAYMENT_TOKEN_DECIMALS,
  type: 'spl_token' as const
};

// Premium Services Configuration (uses payment token)
export const PREMIUM_SERVICES_CONFIG = {
  currency: PAYMENT_TOKEN_NAME,
  mint: PAYMENT_TOKEN_MINT,
  decimals: PAYMENT_TOKEN_DECIMALS,
  type: 'spl_token' as const
};

// CDP Facilitator Address (cosigner for transactions)
export const CDP_FACILITATOR_ADDRESS = 'L54zkaPQFeTn1UsEqieEXBqWrPShiaZEPD7mS5WXfQg';

// Helper to get PublicKey objects
export const getTokenMint = (currency: string): PublicKey | null => {
  if (currency === PAYMENT_TOKEN_NAME) {
    return new PublicKey(PAYMENT_TOKEN_MINT);
  }
  switch (currency) {
    case 'USDC':
      return new PublicKey(USDC_MINT);
    case 'SOL':
      return null; // Native SOL has no mint
    default:
      return null;
  }
};

// Helper to get token decimals
export const getTokenDecimals = (currency: string): number => {
  if (currency === PAYMENT_TOKEN_NAME) {
    return PAYMENT_TOKEN_DECIMALS;
  }
  switch (currency) {
    case 'SOL':
      return 9;
    case 'USDC':
      return USDC_DECIMALS;
    default:
      return PAYMENT_TOKEN_DECIMALS; // Default to payment token
  }
};

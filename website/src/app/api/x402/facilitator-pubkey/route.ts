/**
 * GET /api/x402/facilitator-pubkey
 * Returns the facilitator's public key for including in transactions
 */

import { NextResponse } from'next/server';
import { Keypair } from'@solana/web3.js';
import bs58 from'bs58';

const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_SOLANA_PRIVATE_KEY;

export async function GET() {
  try {
    if (!FACILITATOR_PRIVATE_KEY) {
      return NextResponse.json(
        { error:'Facilitator not configured'},
        { status: 500 }
      );
    }

    // Decode private key and get public key
    const secretKey = bs58.decode(FACILITATOR_PRIVATE_KEY);
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKey = keypair.publicKey.toString();

    return NextResponse.json({
      publicKey,
    });

  } catch (error: any) {
    console.error('[facilitator-pubkey] Error:', error);
    return NextResponse.json(
      { error:'Failed to get facilitator public key'},
      { status: 500 }
    );
  }
}


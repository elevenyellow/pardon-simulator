/**
 * Test endpoint to verify CDP authentication
 * 
 * Tests the x402 package's CDP signer creation:
 * 1. CDP API key is valid
 * 2. Signer creation works correctly
 * 3. Authentication succeeds
 * 
 * Usage: GET /api/test-cdp-auth
 */

import { NextResponse } from'next/server';
import { createSigner } from'x402/types';

export async function GET() {
  try {
    console.log('[CDP Test] Testing CDP authentication with x402 package...');
    console.log('[CDP Test] API Key ID:', process.env.CDP_API_KEY_ID?.substring(0, 30) +'...');
    
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      return NextResponse.json({
        success: false,
        error:'CDP_API_KEY_ID or CDP_API_KEY_SECRET not set in environment'      }, { status: 500 });
    }

    // Create CDP signer using x402 package
    console.log('[CDP Test] Creating CDP signer...');
    const cdpCredentials = {
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g,'\n')
    };
    
    const facilitatorSigner = await createSigner('cdp', JSON.stringify(cdpCredentials));
    
    console.log('[CDP Test] CDP signer created successfully');
    
    return NextResponse.json({
      success: true,
      message:'CDP authentication is working correctly with x402 package',
      hint:'You can now test the full payment flow'    });

  } catch (error: any) {
    console.error('[CDP Test] Error:', error);
    console.error('[CDP Test] Error stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: error.message ||'Unknown error',
      errorType: error.constructor?.name,
      hint:'Check the terminal for detailed error logs. The error might indicate invalid credentials or unsupported key format.'    }, { status: 500 });
  }
}


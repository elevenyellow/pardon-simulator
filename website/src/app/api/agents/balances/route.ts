import { NextResponse } from 'next/server';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createRobustConnection, getBalanceWithRetry } from '@/lib/solana-retry';

// ✅ Backend-only Helius RPC (never exposed to browser)
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
if (!SOLANA_RPC_URL) {
  throw new Error('SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/');
}

// Load agent wallet addresses from environment variables
// NOTE: 'sbf' is NOT included - SBF is user-controlled via browser wallet
const AGENT_WALLETS: Record<string, string> = {
  'donald-trump': process.env.WALLET_DONALD_TRUMP!,
  'melania-trump': process.env.WALLET_MELANIA_TRUMP!,
  'eric-trump': process.env.WALLET_ERIC_TRUMP!,
  'donjr-trump': process.env.WALLET_DONJR_TRUMP!,
  'barron-trump': process.env.WALLET_BARRON_TRUMP!,
  'cz': process.env.WALLET_CZ!
};

// Validate that all wallet addresses are configured
const missingWallets = Object.entries(AGENT_WALLETS)
  .filter(([_, address]) => !address)
  .map(([agentId, _]) => agentId);

if (missingWallets.length > 0) {
  throw new Error(
    `Missing wallet addresses in environment variables for: ${missingWallets.join(', ')}. ` +
    `Please set WALLET_[AGENT] variables in .env.local`
  );
}

// ✅ In-memory cache for balances
interface BalanceCache {
  data: Record<string, any>;
  timestamp: number;
}

let balanceCache: BalanceCache | null = null;
const CACHE_TTL = 30000; // Cache for 30 seconds

/**
 * GET /api/agents/balances
 * Fetch SOL balances for all agents (with in-memory caching)
 */
export async function GET() {
  try {
    // Check cache first
    const now = Date.now();
    if (balanceCache && (now - balanceCache.timestamp) < CACHE_TTL) {
      console.log('✅ Returning cached balances (age: ' + Math.floor((now - balanceCache.timestamp) / 1000) + 's)');
      return NextResponse.json({
        success: true,
        balances: balanceCache.data,
        timestamp: balanceCache.timestamp,
        cached: true,
        cacheAge: now - balanceCache.timestamp
      });
    }
    
    console.log('📊 Fetching fresh agent balances from blockchain...');
    console.log(`   Using RPC: ${SOLANA_RPC_URL!.substring(0, 50)}...`);
    
    const connection = createRobustConnection(SOLANA_RPC_URL!, 'confirmed');
    
    // Fetch all balances in parallel with retry logic
    const balancePromises = Object.entries(AGENT_WALLETS).map(async ([agentId, address]) => {
      try {
        const publicKey = new PublicKey(address);
        
        // Use retry logic with timeout
        const balance = await getBalanceWithRetry(connection, publicKey, {
          maxRetries: 2,
          initialDelay: 300,
          timeout: 6000, // 6 second timeout per attempt
        });
        
        const balanceSOL = balance / LAMPORTS_PER_SOL;
        
        console.log(`   ${agentId}: ${balanceSOL.toFixed(4)} SOL`);
        
        return {
          agentId,
          address,
          balance: balanceSOL,
          balanceFormatted: `${balanceSOL.toFixed(4)} SOL`
        };
      } catch (error) {
        console.error(`   ❌ Error fetching balance for ${agentId}:`, error);
        // Return cached value if available, otherwise 0
        const cachedBalance = balanceCache?.data[agentId]?.balance ?? 0;
        return {
          agentId,
          address,
          balance: cachedBalance,
          balanceFormatted: cachedBalance > 0 ? `${cachedBalance.toFixed(4)} SOL (cached)` : 'Unavailable',
          error: error instanceof Error ? error.message : 'Unknown error',
          cached: cachedBalance > 0
        };
      }
    });
    
    const balances = await Promise.all(balancePromises);
    
    // Convert to object for easy lookup
    const balancesMap = balances.reduce((acc, balance) => {
      acc[balance.agentId] = balance;
      return acc;
    }, {} as Record<string, any>);
    
    // Update cache
    balanceCache = {
      data: balancesMap,
      timestamp: now
    };
    
    console.log(`✅ All balances fetched and cached (TTL: ${CACHE_TTL / 1000}s)`);
    
    return NextResponse.json({
      success: true,
      balances: balancesMap,
      timestamp: now,
      cached: false
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching agent balances:', error);
    return NextResponse.json(
      { 
        error: 'internal_error', 
        message: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents/balances
 * Invalidate the cache (call this after payments to force refresh)
 */
export async function POST() {
  try {
    const hadCache = balanceCache !== null;
    balanceCache = null;
    console.log('🔄 Balance cache invalidated');
    
    return NextResponse.json({
      success: true,
      message: 'Cache invalidated',
      hadCache
    });
  } catch (error: any) {
    console.error('❌ Error invalidating cache:', error);
    return NextResponse.json(
      { 
        error: 'internal_error', 
        message: error.message 
      },
      { status: 500 }
    );
  }
}


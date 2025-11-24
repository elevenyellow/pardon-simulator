import { NextResponse } from'next/server';
import fs from'fs';
import path from'path';
import { getAllPools, getUserSessionPool, selectHealthiestPool } from '@/lib/sessionPooling';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * POST /api/chat/session
 * Create a new Coral session
 * 
 * Supports multi-pool architecture for production scaling:
 * - Production: Assigns user to one of 5 pool sessions (pool-0 through pool-4)
 * - Local: Creates session with agents OR uses existing pre-connected session
 * 
 * Request body (optional):
 * - userWallet: string - For consistent pool assignment based on wallet hash
 */
export async function POST(request: Request) {
  try {
    console.log('[Session API] Creating Coral session...');
    console.log('[Session API] Coral Server URL:', CORAL_SERVER_URL);
    
    // Parse optional wallet address for pool assignment
    let userWallet: string | undefined;
    try {
      const body = await request.json();
      userWallet = body?.userWallet;
      if (userWallet) {
        console.log('[Session API] User wallet provided for pool assignment:', userWallet.slice(0, 8) + '...');
      }
    } catch {
      // No body or invalid JSON - that's fine, we'll assign a pool without wallet
      console.log('[Session API] No wallet provided, will use health-based pool assignment');
    }
    
    // Check if connecting to production ECS server (where agents are already running)
    // vs local docker-compose server (where agents need to be spawned)
    const isConnectingToProductionServer = CORAL_SERVER_URL.includes('amazonaws.com') || 
                                           CORAL_SERVER_URL.includes('pardon-alb');
    
    if (isConnectingToProductionServer) {
      // Production ECS: Agents auto-create pool sessions when they connect
      // via the /sse/v1/devmode/ endpoint. We assign users to pools for load distribution.
      console.log('[Session API] PRODUCTION MODE: Using multi-pool architecture');
      
      try {
        // Check which pool sessions exist - poll with retries for agents to connect
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds
        const expectedPools = getAllPools(); // ['pool-0', 'pool-1', 'pool-2', 'pool-3', 'pool-4']
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const sessionsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!sessionsResponse.ok) {
            console.error('[Session API] Failed to fetch sessions:', sessionsResponse.status, sessionsResponse.statusText);
            throw new Error(`Failed to check sessions: ${sessionsResponse.status} ${sessionsResponse.statusText}`);
          }

          const activeSessions: string[] = await sessionsResponse.json();
          console.log(`[Session API] Active sessions (attempt ${attempt}/${maxRetries}):`, activeSessions);

          // Filter to only pool sessions (pool-0, pool-1, etc.)
          const availablePools = activeSessions.filter(s => expectedPools.includes(s));
          
          if (availablePools.length > 0) {
            console.log(`[Session API] ✓ Found ${availablePools.length} active pool(s):`, availablePools);
            
            // Assign user to a pool
            let assignedPool: string;
            
            if (userWallet) {
              // Use consistent hashing based on wallet for returning users
              assignedPool = getUserSessionPool(userWallet);
              console.log(`[Session API] Wallet-based assignment: ${assignedPool}`);
              
              // Verify assigned pool is available, otherwise pick healthiest
              if (!availablePools.includes(assignedPool)) {
                console.warn(`[Session API] Assigned pool ${assignedPool} not available, selecting healthiest...`);
                assignedPool = await selectHealthiestPool(userWallet);
                console.log(`[Session API] Fallback to healthiest pool: ${assignedPool}`);
              }
            } else {
              // No wallet yet - assign to least-loaded pool
              assignedPool = await selectHealthiestPool();
              console.log(`[Session API] Health-based assignment (no wallet): ${assignedPool}`);
            }
            
            console.log(`[Session API] ✓ User assigned to session: ${assignedPool}`);
            return NextResponse.json({ 
              sessionId: assignedPool,
              poolingEnabled: true,
              availablePools: availablePools.length
            });
          }

          // No pool sessions found yet
          if (attempt < maxRetries) {
            console.log(`[Session API] No pool sessions found yet (expected: ${expectedPools.join(', ')}). Agents may still be connecting. Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        // After all retries, no pool sessions exist
        console.error(`[Session API] ❌ No pool sessions found after ${maxRetries} attempts`);
        console.error(`[Session API] Expected pools: ${expectedPools.join(', ')}`);
        console.error(`[Session API] This indicates agents are not connecting properly in production`);
        return NextResponse.json(
          { 
            error: 'session_not_ready',
            message: `Session pools are not available yet. Agents may still be starting up.`,
            details: 'Please wait a moment and try again. If this persists, check that agent containers are running and connecting to the correct session pools.',
            sessionId: null,
            expectedPools
          },
          { status: 503 } // Service Unavailable - temporary condition
        );

      } catch (error: any) {
        console.error('[Session API] Session check error:', error);
        return NextResponse.json(
          { 
            error: 'session_error', 
            message: error.message,
            details: 'Failed to connect to Coral Server. Please try again.'
          },
          { status: 500 }
        );
      }
    }
    
    // Local development: Check if agents are already connected, otherwise create session
    console.log('[Session API] LOCAL MODE: Checking for existing sessions');
    
    try {
      // First, check if there are any existing sessions (e.g., from start-dev.sh)
      const sessionsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (sessionsResponse.ok) {
        const activeSessions: string[] = await sessionsResponse.json();
        console.log('[Session API] Found existing sessions:', activeSessions);
        
        // If there's an existing session (like 'dev' from start-dev.sh), use it
        if (activeSessions.length > 0) {
          const existingSession = activeSessions[0]; // Use first available session
          console.log(`[Session API] ✓ Using existing session: ${existingSession}`);
          return NextResponse.json({
            sessionId: existingSession,
            existingSession: true
          });
        }
      }
    } catch (checkError) {
      // If check fails, proceed to create new session
      console.log('[Session API] Could not check for existing sessions, will create new one');
    }
    
    // No existing session found - create new session with agents
    console.log('[Session API] Creating new session with agents from configuration file');
    const configPath = path.join(process.cwd(), '../agents-session-configuration.json');
    
    if (!fs.existsSync(configPath)) {
      console.error('[Session API] ❌ Configuration file not found:', configPath);
      throw new Error('Session configuration file not found. Please create agents-session-configuration.json from the example file.');
    }
    
    const sessionConfig = JSON.parse(fs.readFileSync(configPath,'utf-8'));
    console.log('[Session API] Session config loaded, creating session...');

    // Create session via Coral Server (standard endpoint)
    const url =`${CORAL_SERVER_URL}/api/v1/sessions`;
    console.log('[Session API] POST', url);
    
    const response = await fetch(url, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Session API] Coral Server error:', response.status, errorText);
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const sessionId = data.sessionId || data.id;
    
    console.log('[Session API] ✓ Session created:', sessionId);

    return NextResponse.json({
      sessionId,
    });

  } catch (error: any) {
    console.error('[Session API] Session creation error:', error);
    return NextResponse.json(
      { error:'failed_to_create_session', message: error.message },
      { status: 500 }
    );
  }
}


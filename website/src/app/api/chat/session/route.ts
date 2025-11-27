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
/**
 * Session creation with Coral Server affinity tracking
 * 
 * IMPORTANT: With multiple Coral Server instances behind ALB:
 * - ALB sticky sessions (24h) keep user pinned to same Coral instance
 * - We track which Coral instance created the session for debugging
 * - If sticky session expires, restoration logic handles migration
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
      console.log('[Session API] Coral Server:', CORAL_SERVER_URL);
      
      try {
        // Check which pool sessions exist - with longer retry for cold starts
        const maxRetries = 5;  // Increased from 3
        const retryDelay = 3000; // Increased to 3 seconds
        const expectedPools = getAllPools(); // ['pool-0', 'pool-1', 'pool-2', 'pool-3', 'pool-4']
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const sessionsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(5000), // 5 second timeout per request
            });

            if (!sessionsResponse.ok) {
              console.error('[Session API] Failed to fetch sessions:', sessionsResponse.status, sessionsResponse.statusText);
              
              if (attempt < maxRetries) {
                console.log(`[Session API] Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
              }
              
              throw new Error(`Failed to check sessions: ${sessionsResponse.status} ${sessionsResponse.statusText}`);
            }

            const activeSessions: string[] = await sessionsResponse.json();
            console.log(`[Session API] Active sessions (attempt ${attempt}/${maxRetries}):`, activeSessions);

            // NEW: Check for single-session architecture first (production-main)
            if (activeSessions.includes('production-main')) {
              console.log('[Session API] ✓ Detected single-session architecture (production-main)');
              
              // Verify agents are connected
              try {
                const agentsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions/production-main/agents`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(3000),
                });
                
                if (agentsResponse.ok) {
                  const agentsData = await agentsResponse.json();
                  const agentCount = agentsData.agentCount || agentsData.agents?.length || 0;
                  const agentList = agentsData.agents || [];
                  
                  console.log(`[Session API] production-main has ${agentCount} agents: ${agentList.join(', ')}`);
                  
                  if (agentCount >= 7) {
                    console.log('[Session API] ✓ All agents ready in production-main session');
                    return NextResponse.json({ 
                      sessionId: 'production-main',
                      architecture: 'single-session',
                      poolingEnabled: false
                    });
                  } else {
                    console.log(`[Session API] Waiting for all agents (${agentCount}/7)...`);
                    if (attempt < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, retryDelay));
                      continue;
                    }
                  }
                }
              } catch (error: any) {
                console.error('[Session API] Could not verify agents in production-main:', error.message);
              }
            }

            // LEGACY: Filter to only pool sessions (pool-0, pool-1, etc.) for backwards compatibility
            const availablePools = activeSessions.filter(s => expectedPools.includes(s));
            
          if (availablePools.length > 0) {
            console.log(`[Session API] ✓ Found ${availablePools.length} active pool(s):`, availablePools);
            
            // CRITICAL: Check which pools have all agents ready (7 agents)
            const expectedAgentCount = 7; // donald, melania, eric, donjr, barron, cz, sbf
            const readyPools: string[] = [];
            
            for (const pool of availablePools) {
              try {
                const agentsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions/${pool}/agents`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(3000)
                });
                
                if (agentsResponse.ok) {
                  const agentsData = await agentsResponse.json();
                  const agentCount = agentsData.agentCount || 0;
                  const agentList = agentsData.agents || [];
                  
                  if (agentCount >= expectedAgentCount) {
                    console.log(`[Session API] ✓ Pool ${pool} is ready with ${agentCount} agents: ${agentList.join(', ')}`);
                    readyPools.push(pool);
                  } else {
                    console.log(`[Session API] Pool ${pool} has only ${agentCount}/${expectedAgentCount} agents: ${agentList.join(', ')}`);
                  }
                }
              } catch (error: any) {
                console.error(`[Session API] Could not check agents for pool ${pool}:`, error.message);
              }
            }
            
            // Use ready pools if any, otherwise fall back to available pools
            const usablePools = readyPools.length > 0 ? readyPools : availablePools;
            if (readyPools.length === 0) {
              console.warn('[Session API] No pools have all agents ready, using available pools anyway');
            }
            
            // Assign user to a pool
            let assignedPool: string;
            
            if (userWallet) {
              // Use consistent hashing based on wallet for returning users
              assignedPool = getUserSessionPool(userWallet);
              console.log(`[Session API] Wallet-based assignment: ${assignedPool}`);
              
              // Verify assigned pool is usable, otherwise use first usable
              if (!usablePools.includes(assignedPool)) {
                console.warn(`[Session API] Assigned pool ${assignedPool} not in usable pools, using first usable...`);
                assignedPool = usablePools[0];
                console.log(`[Session API] Fallback to usable pool: ${assignedPool}`);
              }
            } else {
              // No wallet yet - use random usable pool for load distribution
              const randomIndex = Math.floor(Math.random() * usablePools.length);
              assignedPool = usablePools[randomIndex];
              console.log(`[Session API] Random assignment (no wallet): ${assignedPool}`);
            }
            
            console.log(`[Session API] ✓ User assigned to session: ${assignedPool}`);
            
            // CRITICAL: Set a session affinity cookie to ensure subsequent requests
            // go to the same ECS task/Coral instance (which has the thread in memory)
            const response = NextResponse.json({ 
              sessionId: assignedPool,
              poolingEnabled: true,
              availablePools: availablePools.length,
              totalExpected: expectedPools.length
            });
            
            // Add a hint cookie for client-side debugging
            response.cookies.set('coral-session-id', assignedPool, {
              httpOnly: false, // Allow JavaScript to read for debugging
              secure: true,
              sameSite: 'lax',
              maxAge: 3600, // 1 hour
              path: '/'
            });
            
            return response;
          }

            // No sessions found yet (neither production-main nor legacy pools)
            if (attempt < maxRetries) {
              console.log(`[Session API] No sessions found yet (expected: production-main or ${expectedPools.join(', ')}). Agents may still be connecting. Retrying in ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          } catch (fetchError: any) {
            console.error(`[Session API] Fetch error on attempt ${attempt}:`, fetchError.message);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
            throw fetchError;
          }
        }

        // After all retries, no sessions exist
        console.error(`[Session API] ❌ No sessions found after ${maxRetries} attempts (${maxRetries * retryDelay / 1000} seconds)`);
        console.error(`[Session API] Expected: production-main (single-session) OR ${expectedPools.join(', ')} (legacy multi-pool)`);
        console.error(`[Session API] This indicates agents are not connecting properly in production`);
        console.error(`[Session API] Diagnostic steps:`);
        console.error(`[Session API]   1. Check ECS tasks are running: aws ecs list-tasks --cluster pardon-production-cluster`);
        console.error(`[Session API]   2. Check agent logs: aws logs tail /ecs/pardon-production --follow --filter-pattern "agent-cz"`);
        console.error(`[Session API]   3. Verify CORAL_SSE_URL ends with session ID in task definition`);
        console.error(`[Session API]   4. Run diagnostics: ./scripts/diagnose-production.sh`);
        
        return NextResponse.json(
          { 
            error: 'session_not_ready',
            message: `AI agents are not currently available. The system may still be starting up.`,
            details: 'This usually resolves within a few minutes. If this error persists, the system administrator has been notified.',
            technicalDetails: {
              reason: 'No agent pool sessions detected',
              expectedPools: expectedPools,
              coralServerUrl: CORAL_SERVER_URL,
              retriedFor: `${maxRetries * retryDelay / 1000} seconds`,
            },
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
            message: 'Cannot connect to AI agent backend system.',
            details: 'Please try again in a few moments. If the problem persists, the system administrator has been notified.',
            technicalDetails: {
              reason: error.message,
              coralServerUrl: CORAL_SERVER_URL,
            }
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


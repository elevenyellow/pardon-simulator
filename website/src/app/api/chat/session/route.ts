import { NextResponse } from'next/server';
import fs from'fs';
import path from'path';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * POST /api/chat/session
 * Create a new Coral session
 */
export async function POST() {
  try {
    console.log('Creating Coral session...');
    console.log('Coral Server URL:', CORAL_SERVER_URL);
    
    // Check if connecting to production ECS server (where agents are already running)
    // vs local docker-compose server (where agents need to be spawned)
    const isConnectingToProductionServer = CORAL_SERVER_URL.includes('amazonaws.com') || 
                                           CORAL_SERVER_URL.includes('pardon-alb');
    
    if (isConnectingToProductionServer) {
      // Production ECS: Agents auto-create "production-main" session when they connect
      // via the /sse/v1/devmode/ endpoint. We just need to wait for it to exist.
      const sessionId = 'production-main';
      console.log(`Connecting to PRODUCTION ECS - Checking session: ${sessionId}`);
      
      try {
        // Check if the session exists - poll with retries for agents to connect
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const sessionsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!sessionsResponse.ok) {
            console.error('Failed to fetch sessions:', sessionsResponse.status, sessionsResponse.statusText);
            throw new Error(`Failed to check sessions: ${sessionsResponse.status} ${sessionsResponse.statusText}`);
          }

          const activeSessions = await sessionsResponse.json();
          console.log(`Active sessions (attempt ${attempt}/${maxRetries}):`, activeSessions);

          if (activeSessions.includes(sessionId)) {
            console.log(`✓ Session "${sessionId}" is active`);
            return NextResponse.json({ sessionId });
          }

          // Session not found yet
          if (attempt < maxRetries) {
            console.log(`Session "${sessionId}" not found yet. Agents may still be connecting. Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        // After all retries, session still doesn't exist
        console.error(`Session "${sessionId}" not found after ${maxRetries} attempts`);
        return NextResponse.json(
          { 
            error: 'session_not_ready',
            message: `Session "${sessionId}" is not available yet. Agents may still be starting up.`,
            details: 'Please wait a moment and try again. If this persists, check that agent containers are running.',
            sessionId: null
          },
          { status: 503 } // Service Unavailable - temporary condition
        );

      } catch (error: any) {
        console.error('Session check error:', error);
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
    
    // Local docker-compose: Create new session with agents
    console.log(`Connecting to LOCAL server - Creating new session with agents`);
    const configPath = path.join(process.cwd(), '../agents-session-configuration.json');
    const sessionConfig = JSON.parse(fs.readFileSync(configPath,'utf-8'));
    
    console.log('Session config loaded');

    // Create session via Coral Server (standard endpoint)
    const url =`${CORAL_SERVER_URL}/api/v1/sessions`;
    console.log('POST', url);
    
    const response = await fetch(url, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coral Server error:', response.status, errorText);
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const sessionId = data.sessionId || data.id;
    
    console.log('Session created:', sessionId);

    return NextResponse.json({
      sessionId,
    });

  } catch (error: any) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { error:'failed_to_create_session', message: error.message },
      { status: 500 }
    );
  }
}


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
      // Production ECS: Ensure "production-main" session exists
      // If it doesn't exist, create it - agents will connect to it automatically
      const sessionId = 'production-main';
      console.log(`Connecting to PRODUCTION ECS - Ensuring session: ${sessionId}`);
      
      try {
        // Check if the session exists
        const sessionsResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!sessionsResponse.ok) {
          console.error('Failed to fetch sessions:', sessionsResponse.status, sessionsResponse.statusText);
          throw new Error(`Failed to check sessions: ${sessionsResponse.status} ${sessionsResponse.statusText}`);
        }

        const activeSessions = await sessionsResponse.json();
        console.log('Active sessions:', activeSessions);

        if (!activeSessions.includes(sessionId)) {
          console.log(`Session "${sessionId}" not found. Creating it now...`);
          
          // Create the session - agents will connect to it when they start
          // Use minimal config - just enough to create the session
          // Agents will register themselves when they connect
          const createResponse = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId,
              applicationId: 'app',
              privacyKey: 'priv',
              agentGraphRequest: {
                agents: [],  // Empty - agents will register on connection
                customTools: {},
                groups: []
              }
            }),
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error('Failed to create session:', createResponse.status, errorText);
            throw new Error(`Failed to create session: ${createResponse.status} ${createResponse.statusText}`);
          }

          const sessionData = await createResponse.json();
          console.log(`✓ Session "${sessionId}" created successfully:`, sessionData);
        } else {
          console.log(`✓ Session "${sessionId}" already exists`);
        }

        return NextResponse.json({
          sessionId,
        });
      } catch (error: any) {
        console.error('Session management error:', error);
        return NextResponse.json(
          { 
            error: 'session_error', 
            message: error.message,
            details: 'Failed to ensure production session is available. Please try again.'
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


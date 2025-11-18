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
      // Production ECS: Agents are already connected to "production-main" session
      // Just return this session ID without trying to create/spawn agents
      const sessionId = 'production-main';
      console.log(`Connecting to PRODUCTION ECS - Using well-known session: ${sessionId}`);
      
      return NextResponse.json({
        sessionId,
      });
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


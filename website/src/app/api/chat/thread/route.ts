import { NextRequest, NextResponse } from'next/server';
import { USER_SENDER_ID } from'@/lib/constants';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * POST /api/chat/thread
 * Create a new thread for conversation with an agent
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, agentId } = await request.json();

    if (!sessionId || !agentId) {
      return NextResponse.json(
        { error:'Missing required fields: sessionId, agentId'},
        { status: 400 }
      );
    }

    console.log(`Creating thread for session ${sessionId} with agent ${agentId}`);

    // CRITICAL: Check if the agent is actually registered in this session
    // This prevents "Thread not found" errors when agent hasn't connected yet
    try {
      const agentsCheck = await fetch(
        `${CORAL_SERVER_URL}/api/v1/sessions/${sessionId}/agents`,
        { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (agentsCheck.ok) {
        const agentsData = await agentsCheck.json();
        const availableAgents = agentsData.agents || [];
        
        if (!availableAgents.includes(agentId)) {
          console.error(`Agent ${agentId} not available in session ${sessionId}. Available: ${availableAgents.join(', ')}`);
          return NextResponse.json(
            { 
              error: 'agent_not_available', 
              message: `Agent ${agentId} is not connected to this session. Please try again in a moment.`,
              availableAgents 
            },
            { status: 503 }
          );
        }
        
        console.log(`✓ Agent ${agentId} is available in session ${sessionId}`);
      } else {
        console.warn(`Could not verify agent availability: ${agentsCheck.status}`);
        // Proceed anyway - if it fails, thread creation will fail with appropriate error
      }
    } catch (checkError) {
      console.warn('Agent availability check failed, proceeding anyway:', checkError);
      // Non-blocking - proceed with thread creation
    }

    // Create thread via Coral Server debug API
    // NOTE: User always plays as SBF - this is the fixed player identity in the game
    const response = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${USER_SENDER_ID}`,
      {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          threadName:'Pardon Simulator Chat',
          participantIds: [agentId, USER_SENDER_ID],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coral Server error:', errorText);
      throw new Error(`Failed to create thread: ${response.statusText}`);
    }

    const data = await response.json();
    const threadId = data.threadId || data.id;

    console.log('Thread created:', threadId);

    return NextResponse.json({
      threadId,
    });

  } catch (error: any) {
    console.error('Thread creation error:', error);
    return NextResponse.json(
      { error:'failed_to_create_thread', message: error.message },
      { status: 500 }
    );
  }
}


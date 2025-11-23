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

    // NOTE: Coral Server doesn't have a REST API endpoint to check agent registration
    // Agents auto-register when they connect via SSE, so we proceed with thread creation
    // If the agent isn't registered yet, thread creation will fail with appropriate error

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


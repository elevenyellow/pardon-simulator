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

    // 🔧 FIXED: No retry needed - session API ensures pools are ready before assignment
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
      console.error('[Thread API] Coral Server error:', errorText);
      
      // If we get 503, this is a critical infrastructure failure
      // (should never happen since session API validates readiness)
      if (response.status === 503) {
        console.error('[Thread API] CRITICAL: Agents not ready despite session validation!');
      }
      
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


import { NextRequest, NextResponse } from 'next/server';

// ✅ Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * POST /api/chat/thread
 * Create a new thread for conversation with an agent
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, agentId } = await request.json();

    if (!sessionId || !agentId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, agentId' },
        { status: 400 }
      );
    }

    console.log(`📝 Creating thread for session ${sessionId} with agent ${agentId}`);

    // Create thread via Coral Server debug API
    const response = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/sbf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadName: 'Pardon Simulator Chat',
          participantIds: [agentId, 'sbf'],
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

    console.log('✅ Thread created:', threadId);

    return NextResponse.json({
      threadId,
    });

  } catch (error: any) {
    console.error('❌ Thread creation error:', error);
    return NextResponse.json(
      { error: 'failed_to_create_thread', message: error.message },
      { status: 500 }
    );
  }
}


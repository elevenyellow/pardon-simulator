import { NextRequest, NextResponse } from 'next/server';

// ✅ Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * GET /api/chat/messages?sessionId=xxx&threadId=yyy
 * Get message history for a thread
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const threadId = searchParams.get('threadId');

    if (!sessionId || !threadId) {
      return NextResponse.json(
        { error: 'Missing required parameters: sessionId, threadId' },
        { status: 400 }
      );
    }

    // Get messages from Coral Server
    const response = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Thread not found or no messages yet
        return NextResponse.json({ messages: [] });
      }
      
      const errorText = await response.text();
      console.error('Coral Server error:', errorText);
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      messages: data.messages || [],
    });

  } catch (error: any) {
    console.error('❌ Get messages error:', error);
    return NextResponse.json(
      { error: 'internal_error', message: error.message },
      { status: 500 }
    );
  }
}


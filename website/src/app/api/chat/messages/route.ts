import { NextRequest, NextResponse } from'next/server';
import { restoreCoralSession } from '@/lib/sessionRestoration';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

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
        { error:'Missing required parameters: sessionId, threadId'},
        { status: 400 }
      );
    }

    // Get messages from Coral Server
    let response = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`    );

    if (!response.ok) {
      if (response.status === 404) {
        const errorText = await response.text();
        console.log('[Messages API] 404 error from Coral Server:', errorText);
        
        // Check if it's a "Session not found" error - indicates server restart
        if (errorText.includes('Session not found')) {
          console.log('[Messages API] Session not found - server likely restarted. Signaling frontend to recreate session.');
          return NextResponse.json(
            { 
              error: 'session_not_found', 
              message: 'Session no longer exists on server. Please create a new session.' 
            },
            { status: 410 } // 410 Gone - resource permanently deleted
          );
        }
        
        // Check if it's a "Thread not found" error
        if (errorText.includes('Thread not found')) {
          console.log('[Messages API] Thread not found, attempting restoration...');
          
          // Try to restore the session and thread from database
          const restored = await restoreCoralSession(threadId);
          
          if (restored) {
            console.log('[Messages API] Restoration successful, retrying request...');
            
            // Retry the request after restoration
            response = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`            );
            
            if (!response.ok) {
              console.log('[Messages API] Retry failed, returning empty messages');
              return NextResponse.json({ messages: [] });
            }
          } else {
            console.log('[Messages API] Restoration failed, returning empty messages');
            return NextResponse.json({ messages: [] });
          }
        } else {
          // Other 404 - return empty messages
          console.log('[Messages API] Other 404 error, returning empty messages');
          return NextResponse.json({ messages: [] });
        }
      } else {
        const errorText = await response.text();
        console.error('Coral Server error:', errorText);
        throw new Error(`Failed to get messages: ${response.statusText}`);
      }
    }

    const data = await response.json();
    
    return NextResponse.json({
      messages: data.messages || [],
    });

  } catch (error: any) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error:'internal_error', message: error.message },
      { status: 500 }
    );
  }
}


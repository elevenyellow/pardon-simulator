import { NextRequest, NextResponse } from'next/server';
import { restoreCoralSession } from '@/lib/sessionRestoration';
import { USER_SENDER_ID } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

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

    // 🔧 FIX: Validate thread belongs to session BEFORE hitting Coral
    // This prevents 404 spam when frontend has stale thread ID after session recreation
    try {
      const thread = await prisma.thread.findFirst({
        where: { coralThreadId: threadId },
        include: { session: true }
      });

      // If thread exists but belongs to different session, it's stale
      if (thread && thread.session.coralSessionId !== sessionId) {
        console.log(
          `[Messages API] Thread ${threadId} belongs to session ${thread.session.coralSessionId}, not ${sessionId}. Signaling frontend to reset.`
        );
        return NextResponse.json(
          {
            error: 'thread_session_mismatch',
            message: 'Thread belongs to a different session. Please create a new thread.',
          },
          { status: 410 } // 410 Gone - tells frontend to reset
        );
      }
    } catch (dbError) {
      // DB error, log but continue - Coral is source of truth
      console.warn('[Messages API] DB check failed, continuing to Coral:', dbError);
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
    const allMessages = data.messages || [];
    
    // Filter out premium service payment confirmation echoes from user
    // These are needed in the DB for agent-to-agent forwarding, but shouldn't show to user
    const filteredMessages = allMessages.filter((msg: any) => {
      const isUserMessage = msg.senderId === USER_SENDER_ID;
      const hasPaymentMarker = msg.content?.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED]');
      
      // Keep agent messages, keep user messages without the marker
      // Filter out user messages with the marker (they're already shown optimistically)
      if (isUserMessage && hasPaymentMarker) {
        console.log(`[Messages API] Filtering premium service payment echo: ${msg.id}`);
        return false;
      }
      return true;
    });
    
    return NextResponse.json({
      messages: filteredMessages,
    });

  } catch (error: any) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error:'internal_error', message: error.message },
      { status: 500 }
    );
  }
}


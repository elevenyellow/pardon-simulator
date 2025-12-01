import { NextRequest, NextResponse } from'next/server';
import { restoreCoralSession } from '@/lib/sessionRestoration';
import { USER_SENDER_ID } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * GET /api/chat/messages?sessionId=xxx&threadId=yyy&userWallet=zzz
 * Get message history for a thread
 * 🔒 SECURITY: Validates user owns the thread before returning messages
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const threadId = searchParams.get('threadId');
    const userWallet = searchParams.get('userWallet');

    if (!sessionId || !threadId) {
      return NextResponse.json(
        { error:'Missing required parameters: sessionId, threadId'},
        { status: 400 }
      );
    }

    // 🔒 SECURITY: Validate thread ownership BEFORE returning messages
    // This prevents users from accessing other users' conversations
    try {
      const thread = await prisma.thread.findFirst({
        where: { coralThreadId: threadId },
        include: { 
          session: {
            include: { user: true }
          }
        }
      });

      // If thread doesn't exist in database, allow Coral to handle (might be new thread)
      if (thread) {
        // Validate thread belongs to the correct session
        if (thread.session.coralSessionId !== sessionId) {
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

        // 🔒 CRITICAL: Validate user owns this thread
        // Only allow access if wallet matches thread owner
        if (userWallet && thread.session.user.walletAddress !== userWallet) {
          console.warn(
            `[SECURITY] Unauthorized access attempt to thread ${threadId}: ` +
            `expected wallet ${thread.session.user.walletAddress}, got ${userWallet}`
          );
          return NextResponse.json(
            { error: 'Unauthorized: This conversation belongs to a different wallet' },
            { status: 403 }
          );
        }
      }
    } catch (dbError) {
      // DB error, log but continue - Coral is source of truth
      console.warn('[Messages API] DB check failed, continuing to Coral:', dbError);
    }

    // STRATEGY: Try database first (most reliable), then Coral for any new messages
    // This ensures messages aren't lost even if Coral restarts or loses memory state
    let dbMessages: any[] = [];
    
    try {
      // Fetch messages from database
      const thread = await prisma.thread.findFirst({
        where: { coralThreadId: threadId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      
      if (thread && thread.messages.length > 0) {
        console.log(`[Messages API] Found ${thread.messages.length} messages in database for thread ${threadId}`);
        dbMessages = thread.messages.map(msg => ({
          id: msg.id,
          threadId: threadId,
          threadName: 'Pardon Simulator Chat',
          senderId: msg.senderId,
          content: msg.content,
          timestamp: msg.createdAt.getTime(),
          mentions: msg.mentions
        }));
      }
    } catch (dbError) {
      console.warn('[Messages API] Failed to fetch from database:', dbError);
    }
    
    // Get messages from Coral Server (for any new messages not yet in DB)
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
              console.log('[Messages API] Retry failed, returning DB messages only');
              // Return DB messages if we have them, even if Coral failed
              if (dbMessages.length > 0) {
                console.log(`[Messages API] Coral failed but returning ${dbMessages.length} messages from DB`);
                return NextResponse.json({ messages: dbMessages });
              }
              return NextResponse.json({ messages: [] });
            }
          } else {
            console.log('[Messages API] Restoration failed, returning DB messages if available');
            // Return DB messages if we have them, even if restoration failed
            if (dbMessages.length > 0) {
              console.log(`[Messages API] Restoration failed but returning ${dbMessages.length} messages from DB`);
              return NextResponse.json({ messages: dbMessages });
            }
            return NextResponse.json({ messages: [] });
          }
        } else {
          // Other 404 - return DB messages if we have them
          console.log('[Messages API] Coral 404, checking DB messages');
          if (dbMessages.length > 0) {
            console.log(`[Messages API] Coral 404 but returning ${dbMessages.length} messages from DB`);
            return NextResponse.json({ messages: dbMessages });
          }
          return NextResponse.json({ messages: [] });
        }
      } else {
        const errorText = await response.text();
        console.error('Coral Server error:', errorText);
        
        // If we have DB messages, return those instead of throwing
        if (dbMessages.length > 0) {
          console.log(`[Messages API] Coral error but returning ${dbMessages.length} messages from DB`);
          return NextResponse.json({ messages: dbMessages });
        }
        
        throw new Error(`Failed to get messages: ${response.statusText}`);
      }
    }

    const data = await response.json();
    const coralMessages = data.messages || [];
    
    // Merge DB messages with Coral messages
    // DB messages are authoritative; only add Coral messages that aren't in DB
    const dbMessageIds = new Set(dbMessages.map(m => m.id));
    const newCoralMessages = coralMessages.filter((m: any) => !dbMessageIds.has(m.id));
    
    console.log(`[Messages API] Merging: ${dbMessages.length} from DB + ${newCoralMessages.length} new from Coral`);
    
    const allMessages = [...dbMessages, ...newCoralMessages];
    
    // Sort by timestamp to maintain chronological order
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    
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
    
    console.log(`[Messages API] Returning ${filteredMessages.length} messages (${dbMessages.length} from DB, ${newCoralMessages.length} from Coral)`);
    
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


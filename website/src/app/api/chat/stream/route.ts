import { NextRequest } from 'next/server';
import { USER_SENDER_ID } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-retry';
import { 
  checkSSEConnection, 
  registerSSEConnection, 
  unregisterSSEConnection,
  updateConnectionActivity 
} from '@/lib/middleware/sse-protection';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';
const DEBUG_SSE = process.env.NODE_ENV === 'development';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Helper to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  
  return 'unknown';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');
  const threadId = searchParams.get('threadId');
  
  if (!sessionId || !threadId) {
    return new Response('Missing sessionId or threadId', { status: 400 });
  }

  // 🛡️ PROTECTION: Check if connection should be allowed
  const clientIP = getClientIP(request);
  const connectionCheck = checkSSEConnection(sessionId, threadId, clientIP);
  
  if (!connectionCheck.allowed) {
    console.warn(`🚫 [SSE] Connection blocked: ${connectionCheck.reason}`);
    return new Response(
      JSON.stringify({ 
        error: 'connection_limit_exceeded',
        message: connectionCheck.reason,
        retryAfter: connectionCheck.retryAfter 
      }), 
      { 
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': connectionCheck.retryAfter?.toString() || '10'
        }
      }
    );
  }

  // 🛡️ PROTECTION: Register this connection
  const connectionId = registerSSEConnection(sessionId, threadId, clientIP);

  const encoder = new TextEncoder();
  let timeoutId: NodeJS.Timeout;
  let coralPollTimeoutId: NodeJS.Timeout;
  let heartbeatId: NodeJS.Timeout;
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`));
      
      // Track last known message count from Coral (for bridging)
      let lastCoralMessageCount = 0;
      // Track message IDs we've already sent to frontend (for PostgreSQL polling)
      const sentMessageIds = new Set<string>();
      
      let pollInterval = 500; // Start with 500ms polling
      let consecutiveEmptyPolls = 0;
      let pollCount = 0;
      
      // ═══════════════════════════════════════════════════════════════════
      // CORAL BRIDGE: Poll Coral to save new agent messages to PostgreSQL
      // This runs independently and doesn't send messages to frontend
      // ═══════════════════════════════════════════════════════════════════
      const pollCoralForBridge = async () => {
        try {
          const response = await fetch(
            `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`,
            { signal: AbortSignal.timeout(10000) }
          );
          
          if (response.ok) {
            const data = await response.json();
            const messages = data.messages || [];
            
            if (messages.length > lastCoralMessageCount) {
              const newMessages = messages.slice(lastCoralMessageCount);
              lastCoralMessageCount = messages.length;
              
              // Save agent messages to database (the bridge)
              const agentMessages = newMessages.filter((msg: any) => msg.senderId !== USER_SENDER_ID);
              
              if (agentMessages.length > 0) {
                if (DEBUG_SSE) {
                  console.log(`[SSE Bridge] Saving ${agentMessages.length} agent message(s) from Coral to PostgreSQL`);
                }
                await Promise.allSettled(
                  agentMessages.map((msg: any) => {
                    // Compute isIntermediary: true if message is agent-to-agent (not involving user)
                    const isFromUser = msg.senderId === USER_SENDER_ID;
                    const mentionsUser = msg.mentions?.includes(USER_SENDER_ID);
                    const isIntermediary = !isFromUser && !mentionsUser;
                    
                    return saveAgentMessageToDatabase({
                      threadId,
                      sessionId,
                      coralMessageId: msg.id,
                      senderId: msg.senderId,
                      content: msg.content,
                      mentions: msg.mentions || [],
                      isIntermediary,
                      timestamp: msg.timestamp
                    });
                  })
                );
              }
            }
          }
        } catch (err) {
          // Timeout errors are expected, silently ignore
          if (err instanceof Error && err.name !== 'TimeoutError') {
            console.error('[SSE Bridge] Coral poll error:', err);
          }
        }
        
        // Continue polling Coral for bridge (every 500ms)
        coralPollTimeoutId = setTimeout(pollCoralForBridge, 500);
      };
      
      // ═══════════════════════════════════════════════════════════════════
      // POSTGRESQL POLL: Stream messages from PostgreSQL to frontend
      // This is the SINGLE SOURCE OF TRUTH for the frontend
      // ═══════════════════════════════════════════════════════════════════
      const pollPostgreSQL = async () => {
        try {
          pollCount++;
          
          // 🛡️ PROTECTION: Update connection activity
          updateConnectionActivity(sessionId, threadId);
          
          // Find the thread and get all messages from PostgreSQL
          const thread = await prisma.thread.findFirst({
            where: { coralThreadId: threadId },
            include: {
              messages: {
                orderBy: { createdAt: 'asc' }
              }
            }
          });
          
          if (!thread) {
            // Thread not in DB yet, continue polling
            coralPollTimeoutId = coralPollTimeoutId || setTimeout(pollCoralForBridge, 100);
            timeoutId = setTimeout(pollPostgreSQL, pollInterval);
            return;
          }
          
          if (DEBUG_SSE && pollCount % 20 === 0) {
            console.log(`[SSE Poll] Thread ${threadId.slice(0, 8)}... - ${pollCount} polls, ${thread.messages.length} messages in DB`);
          }
          
          // Find messages we haven't sent yet
          const newMessages = thread.messages.filter(msg => !sentMessageIds.has(msg.id));
          
          if (newMessages.length > 0) {
            // Mark as sent
            newMessages.forEach(msg => sentMessageIds.add(msg.id));
            
            // Filter out premium service payment confirmation echoes
            const filteredMessages = newMessages.filter(msg => {
              const isUserMessage = msg.senderId === USER_SENDER_ID;
              const hasPaymentMarker = msg.content?.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED]');
              return !(isUserMessage && hasPaymentMarker);
            });
            
            if (filteredMessages.length > 0) {
              // Format messages for frontend (matching previous format)
              const formattedMessages = filteredMessages.map(msg => ({
                id: msg.id,
                threadId: threadId,
                senderId: msg.senderId,
                content: msg.content,
                timestamp: msg.createdAt.getTime(),
                mentions: msg.mentions,
                isIntermediary: msg.isIntermediary
              }));
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'messages', 
                  messages: formattedMessages 
                })}\n\n`)
              );
              
              // Reset to faster polling when new messages arrive
              pollInterval = 500;
              consecutiveEmptyPolls = 0;
              
              if (DEBUG_SSE) {
                console.log(`[SSE Poll] Sent ${formattedMessages.length} new message(s) to frontend`);
              }
            }
          } else {
            // No new messages - back off polling
            consecutiveEmptyPolls++;
            
            if (consecutiveEmptyPolls < 10) {
              pollInterval = 500;
            } else if (consecutiveEmptyPolls < 30) {
              pollInterval = 1000;
            } else if (consecutiveEmptyPolls < 90) {
              pollInterval = 2000;
            } else {
              // Close after 3 minutes idle
              console.log(`[SSE Poll] Closing stream - 3 minutes idle (thread: ${threadId.slice(0, 8)})`);
              clearTimeout(timeoutId);
              clearTimeout(coralPollTimeoutId);
              clearInterval(heartbeatId);
              unregisterSSEConnection(sessionId, threadId);
              controller.close();
              return;
            }
          }
        } catch (err) {
          console.error('[SSE] PostgreSQL poll error:', err);
          pollInterval = 3000;
        }
        
        // Schedule next poll
        timeoutId = setTimeout(pollPostgreSQL, pollInterval);
      };
      
      // Start both polling loops
      pollCoralForBridge(); // Bridge: Coral → PostgreSQL
      pollPostgreSQL();     // Stream: PostgreSQL → Frontend
      
      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
        updateConnectionActivity(sessionId, threadId);
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        clearTimeout(coralPollTimeoutId);
        clearInterval(heartbeatId);
        unregisterSSEConnection(sessionId, threadId);
        controller.close();
      });
    },
    cancel() {
      if (timeoutId) clearTimeout(timeoutId);
      if (coralPollTimeoutId) clearTimeout(coralPollTimeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
      unregisterSSEConnection(sessionId, threadId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function saveAgentMessageToDatabase(params: {
  threadId: string;
  sessionId: string;
  coralMessageId: string;
  senderId: string;
  content: string;
  mentions: string[];
  isIntermediary: boolean;
  timestamp: number;
}): Promise<void> {
  await withRetry(async () => {
    // Find the Thread record by coralThreadId
    const thread = await prisma.thread.findFirst({
      where: { coralThreadId: params.threadId }
    });
    
    if (!thread) {
      console.warn(`[SSE Poll] Thread ${params.threadId} not found in DB, skipping agent message save`);
      return;
    }
    
    // Use upsert with unique constraint on (threadId, coralMessageId) to prevent duplicates
    // This is atomic and race-condition safe
    await prisma.message.upsert({
      where: {
        threadId_coralMessageId: {
          threadId: thread.id,
          coralMessageId: params.coralMessageId
        }
      },
      create: {
        threadId: thread.id,
        senderId: params.senderId,
        content: params.content,
        mentions: params.mentions,
        isIntermediary: params.isIntermediary,
        coralMessageId: params.coralMessageId,
        metadata: {
          coralMessageId: params.coralMessageId // Keep for backwards compatibility
        }
      },
      update: {} // No update needed, just skip if exists
    });
    
    if (DEBUG_SSE) {
      console.log(`[SSE Poll] ✅ Saved agent message from ${params.senderId} to database`);
    }
  }, { maxRetries: 3, initialDelay: 500 });
}


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
  let heartbeatId: NodeJS.Timeout;
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`));
      
      let lastMessageCount = 0;
      let pollInterval = 500; // Start with 500ms polling
      let consecutiveEmptyPolls = 0;
      let pollCount = 0;
      
      const poll = async () => {
        try {
          pollCount++;
          
          // 🛡️ PROTECTION: Update connection activity
          updateConnectionActivity(sessionId, threadId);
          
          const response = await fetch(
            `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`,
            { signal: AbortSignal.timeout(10000) } // 🛡️ 10s timeout
          );
          
          if (response.ok) {
            const data = await response.json();
            const messages = data.messages || [];
            
            if (DEBUG_SSE && pollCount % 20 === 0) {
              // Only log every 20th poll to reduce noise
              console.log(`[SSE Poll] Thread ${threadId.slice(0, 8)}... - ${pollCount} polls, ${messages.length} messages`);
            }
            
            if (messages.length > lastMessageCount) {
              const newMessages = messages.slice(lastMessageCount);
              
              // Batch save agent messages to database
              const agentMessages = newMessages.filter((msg: any) => msg.senderId !== USER_SENDER_ID);
              
              if (agentMessages.length > 0) {
                // Use Promise.allSettled so one failure doesn't block others
                await Promise.allSettled(
                  agentMessages.map((msg: any) => 
                    saveAgentMessageToDatabase({
                      threadId,
                      sessionId,
                      coralMessageId: msg.id, // Use Coral's UUID for deduplication
                      senderId: msg.senderId,
                      content: msg.content,
                      mentions: msg.mentions || [],
                      isIntermediary: msg.isIntermediary || false,
                      timestamp: msg.timestamp
                    })
                  )
                );
              }
              
              // Filter out premium service payment confirmation echoes
              const filteredMessages = newMessages.filter((msg: any) => {
                const isUserMessage = msg.senderId === USER_SENDER_ID;
                const hasPaymentMarker = msg.content?.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED]');
                return !(isUserMessage && hasPaymentMarker);
              });
              
            // CRITICAL FIX: Always update lastMessageCount and send ALL new messages
            // even if some are filtered, to prevent silent message loss
            lastMessageCount = messages.length;
            
            if (filteredMessages.length > 0) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'messages', 
                  messages: filteredMessages 
                })}\n\n`)
              );
              
              // Reset to faster polling when new messages arrive
              pollInterval = 500;
              consecutiveEmptyPolls = 0;
            } else {
              // All filtered out, still update count (moved above)
              // Log for debugging to track when messages are filtered
              if (DEBUG_SSE) {
                console.log(`[SSE Poll] All ${newMessages.length} new message(s) were filtered out`);
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
                clearInterval(heartbeatId);
                unregisterSSEConnection(sessionId, threadId); // 🛡️ Cleanup
                controller.close();
                return;
              }
            }
          } else {
            console.error(`[SSE Poll] Fetch failed: ${response.status}`);
            pollInterval = 3000;
          }
        } catch (err) {
          // Timeout errors are expected during slow operations (e.g., payment settlement)
          if (err instanceof Error && err.name !== 'TimeoutError') {
            console.error('[SSE] Poll error:', err);
          }
          pollInterval = 3000;
        }
        
        // Schedule next poll with current interval
        timeoutId = setTimeout(poll, pollInterval);
      };
      
      // Start polling
      poll();
      
      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
        updateConnectionActivity(sessionId, threadId); // 🛡️ Update on heartbeat
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        clearInterval(heartbeatId);
        unregisterSSEConnection(sessionId, threadId); // 🛡️ Cleanup on abort
        controller.close();
      });
    },
    cancel() {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
      unregisterSSEConnection(sessionId, threadId); // 🛡️ Cleanup on cancel
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
    
    // Check if message already exists by Coral message ID (prevent duplicates)
    // Use metadata field to store and check Coral's UUID
    const existing = await prisma.message.findFirst({
      where: {
        threadId: thread.id,
        metadata: {
          path: ['coralMessageId'],
          equals: params.coralMessageId
        }
      }
    });
    
    if (existing) {
      // Message already saved, skip
      if (DEBUG_SSE) {
        console.log(`[SSE Poll] Message ${params.coralMessageId.substring(0, 8)}... already exists, skipping`);
      }
      return;
    }
    
    // Save agent message with Coral's message ID in metadata
    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: params.senderId,
        content: params.content,
        mentions: params.mentions,
        isIntermediary: params.isIntermediary,
        metadata: {
          coralMessageId: params.coralMessageId
        }
      }
    });
    
    console.log(`[SSE Poll] ✅ Saved agent message from ${params.senderId} to database`);
  }, { maxRetries: 3, initialDelay: 500 });
}


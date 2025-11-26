import { NextRequest } from 'next/server';
import { USER_SENDER_ID } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-retry';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');
  const threadId = searchParams.get('threadId');
  
  if (!sessionId || !threadId) {
    return new Response('Missing sessionId or threadId', { status: 400 });
  }

  const encoder = new TextEncoder();
  let timeoutId: NodeJS.Timeout;
  let heartbeatId: NodeJS.Timeout;
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
      
      let lastMessageCount = 0;
      let pollInterval = 300; // Start with fast polling (300ms)
      let consecutiveEmptyPolls = 0;
      
      const poll = async () => {
        try {
          const response = await fetch(
            `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`
          );
          
          if (response.ok) {
            const data = await response.json();
            const messages = data.messages || [];
            
            console.log(`[SSE Poll] Thread ${threadId.slice(0, 8)}... has ${messages.length} messages (lastCount: ${lastMessageCount})`);
            
            if (messages.length > lastMessageCount) {
              const newMessages = messages.slice(lastMessageCount);
              console.log(`[SSE Poll] Detected ${newMessages.length} NEW messages, sending to client`);
              
              // Save agent messages to database
              for (const msg of newMessages) {
                // Only save agent messages (user messages already saved in send route)
                if (msg.senderId !== USER_SENDER_ID) {
                  try {
                    await saveAgentMessageToDatabase({
                      threadId,
                      sessionId,
                      senderId: msg.senderId,
                      content: msg.content,
                      mentions: msg.mentions || [],
                      isIntermediary: msg.isIntermediary || false,
                      timestamp: msg.timestamp
                    });
                  } catch (err) {
                    console.error('[SSE Poll] Failed to save agent message to DB:', err);
                    // Don't fail the stream if DB save fails
                  }
                }
              }
              
              // Filter out premium service payment confirmation echoes from user
              // These are needed in the DB for agent-to-agent forwarding, but shouldn't show to user
              const filteredMessages = newMessages.filter((msg: any) => {
                const isUserMessage = msg.senderId === USER_SENDER_ID;
                const hasPaymentMarker = msg.content?.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED]');
                
                // Keep agent messages, keep user messages without the marker
                // Filter out user messages with the marker (they're already shown optimistically)
                if (isUserMessage && hasPaymentMarker) {
                  console.log(`[SSE Poll] Filtering premium service payment echo: ${msg.id}`);
                  return false;
                }
                return true;
              });
              
              if (filteredMessages.length > 0) {
                filteredMessages.forEach((msg: any, idx: number) => {
                  console.log(`[SSE Poll]   New message ${idx + 1}: from=${msg.senderId}, id=${msg.id}, content=${msg.content.substring(0, 50)}...`);
                });
                
                lastMessageCount = messages.length; // Update count with ALL messages (not just filtered)
                
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'messages', 
                    messages: filteredMessages 
                  })}\n\n`)
                );
                console.log(`[SSE Poll] Sent ${filteredMessages.length} messages to client via SSE (filtered ${newMessages.length - filteredMessages.length})`);
                
                // Reset to fast polling when new messages arrive
                pollInterval = 300;
                consecutiveEmptyPolls = 0;
              } else {
                // All messages were filtered out, but update count to avoid re-processing
                lastMessageCount = messages.length;
                console.log(`[SSE Poll] All ${newMessages.length} new messages were filtered out`);
              }
            } else {
              // No new messages - adjust polling interval based on idle time
              consecutiveEmptyPolls++;
              
              if (consecutiveEmptyPolls < 10) {
                // First 5 seconds: poll every 500ms
                pollInterval = 500;
              } else if (consecutiveEmptyPolls < 30) {
                // Next 20 seconds: poll every 1000ms
                pollInterval = 1000;
              } else {
                // After 30 seconds: poll every 2000ms
                pollInterval = 2000;
              }
            }
          } else {
            console.error(`[SSE Poll] Failed to fetch messages: ${response.status} ${response.statusText}`);
            // Back off on errors
            pollInterval = 2000;
          }
        } catch (err) {
          console.error('[SSE] Error polling messages:', err);
          // Back off on errors
          pollInterval = 2000;
        }
        
        // Schedule next poll with current interval
        timeoutId = setTimeout(poll, pollInterval);
      };
      
      // Start polling
      poll();
      
      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        clearInterval(heartbeatId);
        controller.close();
      });
    },
    cancel() {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function saveAgentMessageToDatabase(params: {
  threadId: string;
  sessionId: string;
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
    
    // Check if message already exists (prevent duplicates on reconnects)
    const existing = await prisma.message.findFirst({
      where: {
        threadId: thread.id,
        senderId: params.senderId,
        content: params.content,
        createdAt: {
          gte: new Date(Date.now() - 10000) // Within last 10 seconds
        }
      }
    });
    
    if (existing) {
      // Message already saved, skip
      return;
    }
    
    // Save agent message
    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: params.senderId,
        content: params.content,
        mentions: params.mentions,
        isIntermediary: params.isIntermediary
      }
    });
    
    console.log(`[SSE Poll] ✅ Saved agent message from ${params.senderId} to database`);
  }, { maxRetries: 3, initialDelay: 500 });
}


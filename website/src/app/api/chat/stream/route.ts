import { NextRequest } from 'next/server';

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
              newMessages.forEach((msg: any, idx: number) => {
                console.log(`[SSE Poll]   New message ${idx + 1}: from=${msg.senderId}, id=${msg.id}, content=${msg.content.substring(0, 50)}...`);
              });
              lastMessageCount = messages.length;
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'messages', 
                  messages: newMessages 
                })}\n\n`)
              );
              console.log(`[SSE Poll] Sent ${newMessages.length} messages to client via SSE`);
              
              // Reset to fast polling when new messages arrive
              pollInterval = 300;
              consecutiveEmptyPolls = 0;
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


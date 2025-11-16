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
  let intervalId: NodeJS.Timeout;
  let heartbeatId: NodeJS.Timeout;
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
      
      let lastMessageCount = 0;
      
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(
            `${CORAL_SERVER_URL}/api/v1/debug/thread/app/debug/${sessionId}/${threadId}/messages`
          );
          
          if (response.ok) {
            const data = await response.json();
            const messages = data.messages || [];
            
            if (messages.length > lastMessageCount) {
              const newMessages = messages.slice(lastMessageCount);
              lastMessageCount = messages.length;
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'messages', 
                  messages: newMessages 
                })}\n\n`)
              );
            }
          }
        } catch (err) {
          console.error('[SSE] Error polling messages:', err);
        }
      }, 1000);
      
      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        clearInterval(heartbeatId);
        controller.close();
      });
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
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


import { NextRequest, NextResponse } from'next/server';
import { USER_SENDER_ID } from'@/lib/constants';
import { prisma } from'@/lib/prisma';
import { withRetry } from'@/lib/db-retry';
import { verifyWalletSignature } from'@/lib/wallet-verification';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * POST /api/chat/thread
 * Create a new thread for conversation with an agent
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, agentId, userWallet, walletSignature, walletMessage } = await request.json();

    if (!sessionId || !agentId) {
      return NextResponse.json(
        { error:'Missing required fields: sessionId, agentId'},
        { status: 400 }
      );
    }

    // Verify wallet ownership if signature provided
    let walletVerified = false;
    if (userWallet && walletSignature && walletMessage) {
      walletVerified = verifyWalletSignature({
        walletAddress: userWallet,
        signature: walletSignature,
        message: walletMessage
      });
      
      if (!walletVerified) {
        console.warn('[Security] Invalid wallet signature for:', userWallet);
        // For now, allow but log. Future: return 401
      } else {
        console.log('[Security] Wallet signature verified for:', userWallet);
      }
    }

    console.log(`Creating thread for session ${sessionId} with agent ${agentId}`);

    // NOTE: Coral Server doesn't have a REST API endpoint to check agent registration
    // Agents auto-register when they connect via SSE, so we proceed with thread creation
    // If the agent isn't registered yet, thread creation will fail with appropriate error

    // Create thread via Coral Server debug API
    // NOTE: User always plays as SBF - this is the fixed player identity in the game
    const response = await fetch(
`${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${sessionId}/${USER_SENDER_ID}`,
      {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          threadName:'Pardon Simulator Chat',
          participantIds: [agentId, USER_SENDER_ID],
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

    console.log('Thread created:', threadId);

    // 🔧 FIX: Verify thread is actually accessible before returning
    // Small delay + verification to ensure Coral has committed the thread
    // This prevents race conditions in production pool architecture
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify thread exists by fetching it
    const verifyResponse = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/${threadId}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!verifyResponse.ok) {
      console.warn(`Thread ${threadId} created but not immediately accessible, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // One more check
      const retryVerify = await fetch(
        `${CORAL_SERVER_URL}/api/v1/debug/thread/${threadId}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      
      if (!retryVerify.ok) {
        console.error(`Thread ${threadId} still not accessible after retry`);
        // Don't fail the request, but log for monitoring
      } else {
        console.log(`Thread ${threadId} verified after retry`);
      }
    } else {
      console.log(`Thread ${threadId} verified immediately`);
    }

    // 🔧 FIX: Save thread to database immediately so it can be restored if coral server restarts
    try {
      await withRetry(async () => {
        // Check if thread already exists
        const existingThread = await prisma.thread.findFirst({
          where: { coralThreadId: threadId }
        });

        if (!existingThread) {
          // Get or create session in database
          let session = await prisma.session.findFirst({
            where: { 
              OR: [
                { coralSessionId: sessionId },
                { id: sessionId }
              ]
            }
          });

          // If session doesn't exist and we have a wallet, create it
          if (!session && userWallet) {
            const user = await prisma.user.upsert({
              where: { walletAddress: userWallet },
              update: {},
              create: {
                walletAddress: userWallet,
                username:`Player_${userWallet.slice(0, 8)}`
              }
            });
            
            const weekId = getCurrentWeekId();
            session = await prisma.session.upsert({
              where: {
                userId_weekId: {
                  userId: user.id,
                  weekId
                }
              },
              update: {
                coralSessionId: sessionId,
                walletVerified: walletVerified || undefined,
                walletVerifiedAt: walletVerified ? new Date() : undefined,
                walletSignature: walletSignature || undefined
              },
              create: {
                userId: user.id,
                weekId,
                coralSessionId: sessionId,
                currentScore: 0,
                walletVerified,
                walletVerifiedAt: walletVerified ? new Date() : undefined,
                walletSignature
              }
            });
          }

          // Create thread in database if we have a session
          if (session) {
            await prisma.thread.create({
              data: {
                sessionId: session.id,
                coralThreadId: threadId,
                agentId: agentId
              }
            });
            console.log(`Thread ${threadId} saved to database for restoration`);
          } else {
            console.warn(`Could not save thread ${threadId} to database - no session found and no wallet provided`);
          }
        }
      });
    } catch (dbError) {
      // Don't fail the request if database save fails, but log it
      console.error('Error saving thread to database:', dbError);
    }

    return NextResponse.json({
      threadId,
    });

  } catch (error: any) {
    console.error('Thread creation error:', error);
    return NextResponse.json(
      { error:'failed_to_create_thread', message: error.message },
      { status: 500 }
    );
  }
}

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return`${year}-W${weekNumber.toString().padStart(2,'0')}`;
}

import { NextRequest, NextResponse } from'next/server';
import { USER_SENDER_ID } from'@/lib/constants';
import { prisma } from'@/lib/prisma';
import { verifyWalletSignature } from'@/lib/wallet-verification';
import { sanitizeWalletAddress, sanitizeText } from'@/lib/security/sanitize';

//  Backend-only Coral Server URL (never exposed to browser)
const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL ||'http://localhost:5555';

/**
 * POST /api/chat/thread
 * Create a new thread for conversation with an agent
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    // Extract and sanitize all fields
    const sessionId = rawBody.sessionId ? sanitizeText(rawBody.sessionId) : '';
    const agentId = rawBody.agentId ? sanitizeText(rawBody.agentId) : '';
    const userWallet = rawBody.userWallet ? sanitizeWalletAddress(rawBody.userWallet) : null;
    const walletSignature = rawBody.walletSignature;
    const walletMessage = rawBody.walletMessage;

    if (!sessionId || !agentId) {
      return NextResponse.json(
        { error:'Missing required fields: sessionId, agentId'},
        { status: 400 }
      );
    }

    // Verify wallet signature if provided
    if (walletSignature && walletMessage && userWallet) {
      const isValid = verifyWalletSignature({
        walletAddress: userWallet,
        signature: walletSignature,
        message: walletMessage
      });
      
      if (!isValid) {
        console.warn('[Thread Creation] Invalid wallet signature:', userWallet);
        return NextResponse.json(
          { error: 'Invalid wallet signature' },
          { status: 401 }
        );
      }
      
      console.log('[Thread Creation] Wallet signature verified:', userWallet);
    }

    console.log(`[Thread Creation] Creating thread for session ${sessionId} with agent ${agentId}`);

    // CRITICAL: Check if the agent is actually registered in this session
    // This prevents "Thread not found" errors when agent hasn't connected yet
    try {
      const agentsCheck = await fetch(
        `${CORAL_SERVER_URL}/api/v1/sessions/${sessionId}/agents`,
        { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (agentsCheck.ok) {
        const agentsData = await agentsCheck.json();
        const availableAgents = agentsData.agents || [];
        
        if (!availableAgents.includes(agentId)) {
          console.error(`Agent ${agentId} not available in session ${sessionId}. Available: ${availableAgents.join(', ')}`);
          return NextResponse.json(
            { 
              error: 'agent_not_available', 
              message: `Agent ${agentId} is not connected to this session. Please try again in a moment.`,
              availableAgents 
            },
            { status: 503 }
          );
        }
        
        console.log(`✓ Agent ${agentId} is available in session ${sessionId}`);
      } else {
        console.warn(`Could not verify agent availability: ${agentsCheck.status}`);
        // Proceed anyway - if it fails, thread creation will fail with appropriate error
      }
    } catch (checkError) {
      console.warn('Agent availability check failed, proceeding anyway:', checkError);
      // Non-blocking - proceed with thread creation
    }

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

    console.log('[Thread Creation] Thread created in Coral Server:', threadId);

    // CRITICAL: Save thread to database immediately (not waiting for first message)
    // This makes threads restorable if Coral Server restarts or sessions get cleaned up
    if (userWallet) {
      try {
        await saveThreadToDatabase({
          threadId,
          sessionId,
          agentId,
          userWallet
        });
        console.log('[Thread Creation] ✅ Thread saved to database');
      } catch (dbError: any) {
        console.error('[Thread Creation] Failed to save thread to database:', dbError);
        // Don't fail the request - thread exists in Coral Server
        // Worst case: restoration won't work, but thread creation succeeded
      }
    } else {
      console.warn('[Thread Creation] No wallet provided, thread not saved to database (not restorable)');
    }

    return NextResponse.json({
      threadId,
    });

  } catch (error: any) {
    console.error('[Thread Creation] Thread creation error:', error);
    return NextResponse.json(
      { error:'failed_to_create_thread', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Save thread to database immediately on creation
 * This enables thread restoration if Coral Server fails/restarts
 */
async function saveThreadToDatabase(params: {
  threadId: string;
  sessionId: string;
  agentId: string;
  userWallet: string;
}) {
  // Check if thread already exists (idempotency)
  const existingThread = await prisma.thread.findFirst({
    where: { coralThreadId: params.threadId }
  });

  if (existingThread) {
    console.log('[Thread Creation] Thread already exists in database');
    return;
  }

  // Upsert user
  const user = await prisma.user.upsert({
    where: { walletAddress: params.userWallet },
    update: {},
    create: {
      walletAddress: params.userWallet,
      username: `Player_${params.userWallet.slice(0, 8)}`
    }
  });

  // Get current week ID
  const weekId = getCurrentWeekId();

  // Upsert session
  const session = await prisma.session.upsert({
    where: {
      userId_weekId: {
        userId: user.id,
        weekId
      }
    },
    update: {
      coralSessionId: params.sessionId
    },
    create: {
      userId: user.id,
      weekId,
      coralSessionId: params.sessionId,
      currentScore: 0
    }
  });

  // Create thread
  await prisma.thread.create({
    data: {
      sessionId: session.id,
      coralThreadId: params.threadId,
      agentId: params.agentId
    }
  });
}

function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}


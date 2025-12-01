import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/chat/threads?userWallet=xxx&sessionId=yyy
 * Get all threads for a user in the current week's session
 * Returns mapping of agentId → threadId
 * 
 * 🔒 CRITICAL: Only returns threads from current week to prevent
 * week-crossing issues with scoring and session management
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userWallet = searchParams.get('userWallet');
    const sessionId = searchParams.get('sessionId');

    if (!userWallet) {
      return NextResponse.json(
        { error: 'Missing required parameter: userWallet' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { walletAddress: userWallet }
    });

    if (!user) {
      // User doesn't exist yet - no threads
      return NextResponse.json({ threads: {} });
    }

    // Get current week ID
    const weekId = getCurrentWeekId();

    // Build query conditions - CRITICAL: Filter by current week
    const whereConditions: any = {
      session: {
        userId: user.id,
        weekId: weekId  // ✅ Only current week's threads
      }
    };

    // Optionally filter by Coral session ID
    if (sessionId) {
      whereConditions.session.coralSessionId = sessionId;
    }

    // Get threads for this user in current week
    const threads = await prisma.thread.findMany({
      where: whereConditions,
      select: {
        coralThreadId: true,
        agentId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Convert to agentId → threadId mapping
    // If multiple threads per agent, use most recent
    const agentThreadMap: Record<string, string> = {};
    for (const thread of threads) {
      if (!agentThreadMap[thread.agentId]) {
        agentThreadMap[thread.agentId] = thread.coralThreadId;
      }
    }

    console.log(`[Threads API] Found ${threads.length} threads for user in week ${weekId}`);

    return NextResponse.json({ 
      threads: agentThreadMap,
      count: threads.length,
      weekId  // Return week ID for debugging
    });

  } catch (error: any) {
    console.error('Get threads error:', error);
    return NextResponse.json(
      { error: 'internal_error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get current week ID in format "YYYY-Www"
 * Matches the week ID used in session creation
 */
function getCurrentWeekId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}


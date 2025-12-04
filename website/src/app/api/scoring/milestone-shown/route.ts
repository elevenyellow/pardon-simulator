import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentWeekId } from '@/lib/utils/week';
import { withRetry } from '@/lib/db-retry';

/**
 * POST /api/scoring/milestone-shown
 * Marks the milestone popup as shown for the user's current week session.
 * This prevents the popup from showing again on other devices/sessions.
 */
export async function POST(request: NextRequest) {
  try {
    const { userWallet } = await request.json();
    
    if (!userWallet || typeof userWallet !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid userWallet parameter' },
        { status: 400 }
      );
    }
    
    // Validate wallet address format
    if (userWallet.length < 32 || userWallet === 'sbf') {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }
    
    const weekId = getCurrentWeekId();
    
    // Find user by wallet address
    const user = await withRetry(
      () => prisma.user.findUnique({
        where: { walletAddress: userWallet }
      }),
      { maxRetries: 2, initialDelay: 200 }
    );
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Update the session's milestoneShown flag
    const result = await withRetry(
      () => prisma.session.updateMany({
        where: {
          userId: user.id,
          weekId,
        },
        data: {
          milestoneShown: true,
        },
      }),
      { maxRetries: 2, initialDelay: 200 }
    );
    
    if (result.count === 0) {
      console.warn(`[Milestone] No session found for user ${userWallet.substring(0, 8)}... in week ${weekId}`);
      return NextResponse.json(
        { error: 'Session not found for current week' },
        { status: 404 }
      );
    }
    
    console.log(`[Milestone] Marked popup as shown for user ${userWallet.substring(0, 8)}... in week ${weekId}`);
    
    return NextResponse.json({
      success: true,
      message: 'Milestone popup marked as shown',
    });
    
  } catch (error: any) {
    console.error('[Milestone] Error marking popup as shown:', error);
    
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}


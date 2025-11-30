import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/middleware';
import { scoringRepository } from '@/lib/scoring/repository';
import { getCurrentWeekId } from '@/lib/utils/week';

/**
 * GET /api/admin/leaderboard
 * 
 * Admin endpoint to view leaderboard for any week
 * Shows ALL users regardless of score (no 90-point filter)
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  const { admin, error } = await requireAdminAuth(request);
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId') || getCurrentWeekId();
    
    console.log(`[Admin Leaderboard] Fetching for week: ${weekId}`);
    
    // Get all sessions for the week (no filtering by score)
    const sessions = await scoringRepository.getLeaderboard(weekId, 1000);
    
    console.log(`[Admin Leaderboard] Found ${sessions.length} sessions for week ${weekId}`);
    
    // Map to leaderboard entries (no 90-point filter - show ALL users)
    const entries = sessions.map((session, index) => ({
      id: `${session.userId}-${weekId}`,
      userId: session.userId,
      weekId,
      finalScore: session.currentScore,
      rank: index + 1,
      prizeAmount: session.currentScore >= 90 ? calculatePrizeAmount(index + 1, sessions.length) : null,
      user: {
        username: session.user.username,
        walletAddress: session.user.walletAddress,
      },
    }));
    
    console.log(`[Admin Leaderboard] Returning ${entries.length} entries, ${entries.filter(e => e.finalScore >= 90).length} prize eligible`);
    
    return NextResponse.json({
      success: true,
      weekId,
      totalPlayers: entries.length,
      prizeEligible: entries.filter(e => e.finalScore >= 90).length,
      leaderboard: entries,
    });
    
  } catch (error: any) {
    console.error('Admin leaderboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Calculate prize amount based on rank
 * Only called for users with 90+ score
 */
function calculatePrizeAmount(rank: number, totalWinners: number): string | null {
  if (rank > 10) return null;
  
  const prizePool = 10000; // 10,000 $PARDON tokens per week
  
  switch (rank) {
    case 1:
      return (prizePool * 0.5).toFixed(4); // 50%
    case 2:
      return (prizePool * 0.2).toFixed(4); // 20%
    case 3:
      return (prizePool * 0.1).toFixed(4); // 10%
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10:
      return ((prizePool * 0.2) / 7).toFixed(4); // Split 20% among ranks 4-10
    default:
      return null;
  }
}


import { NextResponse } from 'next/server';
import { scoringRepository } from '@/lib/scoring/repository';
import { getCurrentWeekId, formatWeekId } from '@/lib/utils/week';

export async function GET() {
  try {
    const weekId = getCurrentWeekId();
    const sessions = await scoringRepository.getLeaderboard(weekId, 100);
    
    const entries = sessions.map((session, index) => ({
      rank: index + 1,
      username: session.user.username,
      walletAddress: session.user.walletAddress,
      score: session.currentScore,
      prizeEligible: session.currentScore >= 80,
    }));
    
    return NextResponse.json({
      success: true,
      weekId,
      weekDisplay: formatWeekId(weekId),
      totalPlayers: entries.length,
      prizeEligible: entries.filter(e => e.prizeEligible).length,
      entries,
    });
    
  } catch (error: any) {
    console.error('❌ Leaderboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}


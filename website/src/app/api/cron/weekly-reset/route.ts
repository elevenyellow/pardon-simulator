import { NextRequest, NextResponse } from'next/server';
import { prisma } from'@/lib/prisma';
import { getCurrentWeekId, getLastWeekId } from'@/lib/utils/week';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel Cron authentication)
  const authHeader = request.headers.get('authorization');
  if (authHeader !==`Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return NextResponse.json({ error:'Unauthorized'}, { status: 401 });
  }
  
  try {
    console.log('Starting weekly reset...');
    
    const lastWeekId = getLastWeekId();
    const currentWeekId = getCurrentWeekId();
    
    console.log(`Last week: ${lastWeekId}`);
    console.log(`Current week: ${currentWeekId}`);
    
    // Get all sessions from last week
    const sessions = await prisma.session.findMany({
      where: { weekId: lastWeekId },
      include: { user: true },
      orderBy: { currentScore:'desc'},
    });
    
    console.log(`Found ${sessions.length} sessions from last week`);
    
    if (sessions.length === 0) {
      console.log('No sessions to process, skipping reset');
      return NextResponse.json({
        success: true,
        message:'No sessions to process',
        lastWeek: lastWeekId,
        currentWeek: currentWeekId,
      });
    }
    
    // Create leaderboard entries in a transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        
        // Check if entry already exists
        const existing = await tx.leaderboardEntry.findUnique({
          where: {
            userId_weekId: {
              userId: session.userId,
              weekId: lastWeekId,
            },
          },
        });
        
        if (existing) {
          console.log(`Skipping existing entry for user ${session.user.username}`);
          continue;
        }
        
        // Calculate prize amount if applicable
        const prizeAmount = calculatePrizeAmount(i + 1, session.currentScore, sessions.length);
        
        await tx.leaderboardEntry.create({
          data: {
            userId: session.userId,
            weekId: lastWeekId,
            finalScore: session.currentScore,
            rank: i + 1,
            prizeAmount: prizeAmount || null,
          },
        });
        
        console.log(`Created leaderboard entry: Rank ${i + 1} - ${session.user.username} (Score: ${session.currentScore})`);
      }
    });
    
    // Calculate prize distribution (90+ scorers qualify)
    const winners = sessions.filter(s => s.currentScore >= 90);
    const totalPrizePool = 10000; // 10,000 $PARDON tokens per week
    
    console.log(`Winners (90+ score): ${winners.length}`);
    
    if (winners.length > 0) {
      const prizeDistribution = calculatePrizeDistribution(winners, totalPrizePool);
      console.log('Prize distribution:');
      prizeDistribution.forEach((prize, index) => {
        console.log(`${index + 1}. ${prize.username} - ${prize.prizeAmount} PARDON (Rank ${prize.rank})`);
      });
      
      // TODO: Call smart contract to distribute prizes
      // await distributePrizes(prizeDistribution);
    }
    
    // Close ended sessions
    await prisma.session.updateMany({
      where: {
        weekId: lastWeekId,
        endTime: null,
      },
      data: {
        endTime: new Date(),
      },
    });
    
    console.log('Weekly reset complete');
    
    return NextResponse.json({
      success: true,
      lastWeek: lastWeekId,
      currentWeek: currentWeekId,
      totalPlayers: sessions.length,
      winners: winners.length,
      prizePool: totalPrizePool,
      message:'Weekly reset completed successfully',
    });
    
  } catch (error: any) {
    console.error('Weekly reset error:', error);
    return NextResponse.json(
      { 
        error:'Internal server error', 
        message: error.message,
        stack: process.env.NODE_ENV ==='development'? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate prize amount for a given rank and score
 * 
 * Prize distribution:
 * - 1st place: 50% of pool
 * - 2nd place: 20% of pool
 * - 3rd place: 10% of pool
 * - 4th-10th: Share remaining 20%
 * - Must have score >= 90 to qualify for prizes
 */
function calculatePrizeAmount(rank: number, score: number, totalPlayers: number): number | null {
  // Must qualify with 90+ score
  if (score < 90) return null;
  
  const PRIZE_POOL = 10000; // 10,000 $PARDON
  
  switch (rank) {
    case 1:
      return PRIZE_POOL * 0.5; // 50%
    case 2:
      return PRIZE_POOL * 0.2; // 20%
    case 3:
      return PRIZE_POOL * 0.1; // 10%
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10:
      // Split remaining 20% among 4th-10th place
      return (PRIZE_POOL * 0.2) / 7;
    default:
      return null;
  }
}

/**
 * Calculate full prize distribution for winners
 */
interface PrizeWinner {
  userId: string;
  username: string;
  walletAddress: string;
  rank: number;
  score: number;
  prizeAmount: number;
}

function calculatePrizeDistribution(
  winners: Array<{ userId: string; user: { username: string; walletAddress: string }; currentScore: number }>,
  totalPrizePool: number
): PrizeWinner[] {
  return winners
    .sort((a, b) => b.currentScore - a.currentScore) // Ensure sorted by score
    .map((session, index) => {
      const rank = index + 1;
      const prizeAmount = calculatePrizeAmount(rank, session.currentScore, winners.length);
      
      return {
        userId: session.userId,
        username: session.user.username,
        walletAddress: session.user.walletAddress,
        rank,
        score: session.currentScore,
        prizeAmount: prizeAmount || 0,
      };
    })
    .filter(w => w.prizeAmount > 0); // Only return winners with prizes
}


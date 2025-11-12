import { NextRequest, NextResponse } from 'next/server';
import { scoringRepository, ScoreCategory } from '@/lib/scoring/repository';
import { getCurrentWeekId } from '@/lib/utils/week';
import { withRetry } from '@/lib/db-retry';
import { strictRateLimiter } from '@/lib/middleware/rate-limit';
import { sanitizeScoringRequest } from '@/lib/security/sanitize';
import { getClientIP, logSuspiciousActivity } from '@/lib/security/monitoring';

async function handlePOST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    // Sanitize and validate input (SECURITY: Prevent XSS and injection)
    const sanitizationResult = sanitizeScoringRequest(rawBody);
    if (!sanitizationResult.valid) {
      console.warn(`⚠️ Scoring request validation failed: ${sanitizationResult.error}`);
      
      // Log suspicious activity
      const ip = getClientIP(request.headers);
      logSuspiciousActivity(
        ip,
        '/api/scoring/update',
        `Invalid scoring request: ${sanitizationResult.error}`,
        { rawBody: JSON.stringify(rawBody).substring(0, 200) }
      );
      
      return NextResponse.json(
        { error: sanitizationResult.error },
        { status: 400 }
      );
    }
    
    const { 
      userWallet, 
      delta, 
      reason, 
      category, 
      subcategory,
      agentId,
      messageId,
    } = sanitizationResult.sanitized!;
    
    // Extract additional fields not sanitized
    const { coralSessionId, threadId } = rawBody;
    
    console.log(`📥 Scoring API received (sanitized): userWallet="${userWallet}", delta=${delta}, reason="${reason}"`);
    console.log(`✅ Using wallet for scoring: "${userWallet.substring(0, 8)}...${userWallet.substring(userWallet.length - 8)}"`);
    
    // Get or create user and session for current week (with retry logic)
    const weekId = getCurrentWeekId();
    const { userId, sessionId, currentScore: oldScore} = await withRetry(
      () => scoringRepository.getOrCreateUserSession(
        userWallet,
        weekId,
        coralSessionId || undefined
      ),
      { maxRetries: 3, initialDelay: 300 }
    );
    
    // Add score with new fields (with retry logic)
    const result = await withRetry(
      () => scoringRepository.addScore({
        userId,
        sessionId,
        delta,
        reason,
        category: category as ScoreCategory,
        subcategory: subcategory || undefined,
        agentId: agentId || undefined,
        messageId: messageId || undefined,
      }),
      { maxRetries: 3, initialDelay: 300 }
    );
    
    // Get user rank (with retry logic)
    const rank = await withRetry(
      () => scoringRepository.getUserRank(userId, weekId),
      { maxRetries: 2, initialDelay: 200 }
    );
    
    // Generate contextual feedback
    const feedback = generateFeedback(result.newScore, delta);
    
    return NextResponse.json({
      success: true,
      newScore: result.newScore,
      oldScore,
      delta: result.scoreRecord.delta, // Use randomized delta
      reason,
      category,
      subcategory: result.scoreRecord.subcategory,
      agentId: result.scoreRecord.agentId,
      messageId: result.scoreRecord.messageId,
      rank,
      feedback,
      scoreId: result.scoreRecord.id,
      timestamp: result.scoreRecord.timestamp,
    });
    
  } catch (error: any) {
    console.error('❌ Scoring error:', error);
    
    // Graceful degradation: If database is down, still return success but warn
    if (error.code === 'P1001' || error.code === 'P1017' || error.message?.includes('database') || error.message?.includes('connection')) {
      console.warn('⚠️  Database unavailable, score update not persisted');
      return NextResponse.json({
        success: true,
        newScore: 0,
        oldScore: 0,
        delta: 0,
        reason: 'Database unavailable',
        category: 'penalty',
        subcategory: null,
        agentId: null,
        rank: null,
        feedback: 'Database temporarily unavailable - score not persisted',
        warning: 'Database temporarily unavailable - score not persisted'
      });
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Apply rate limiting to POST endpoint
export async function POST(request: NextRequest) {
  return strictRateLimiter(request, handlePOST);
}

/**
 * Get current user score (no update)
 */
async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userWallet = searchParams.get('userWallet');
    
    if (!userWallet) {
      return NextResponse.json(
        { error: 'Missing userWallet parameter' },
        { status: 400 }
      );
    }
    
    const weekId = getCurrentWeekId();
    const { userId, sessionId, currentScore } = await withRetry(
      () => scoringRepository.getOrCreateUserSession(
        userWallet,
        weekId
      ),
      { maxRetries: 3, initialDelay: 300 }
    );
    
    const rank = await withRetry(
      () => scoringRepository.getUserRank(userId, weekId),
      { maxRetries: 2, initialDelay: 200 }
    );
    const scoreHistory = await withRetry(
      () => scoringRepository.getScoreHistory(userId, weekId),
      { maxRetries: 2, initialDelay: 200 }
    );
    
    return NextResponse.json({
      success: true,
      currentScore,
      rank,
      weekId,
      scoreHistory: scoreHistory.slice(0, 10), // Last 10 changes
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching score:', error);
    
    // Graceful degradation: Return default values if database is down
    if (error.code === 'P1001' || error.code === 'P1017' || error.message?.includes('database') || error.message?.includes('connection')) {
      console.warn('⚠️  Database unavailable, returning default score');
      return NextResponse.json({
        success: true,
        currentScore: 0,
        rank: null,
        weekId: getCurrentWeekId(),
        scoreHistory: [],
        warning: 'Database temporarily unavailable - score may not be up to date'
      });
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Apply rate limiting to GET endpoint
export async function GET(request: NextRequest) {
  return strictRateLimiter(request, handleGET);
}

/**
 * Generate contextual feedback based on score
 */
function generateFeedback(score: number, delta: number): string {
  if (score >= 80) {
    return "🏆 Excellent progress! You're in the prize zone. Keep pushing for 100!";
  } else if (score >= 60) {
    const pointsNeeded = 80 - score;
    return `💪 Good work! ${pointsNeeded} more points to qualify for prizes.`;
  } else if (score >= 40) {
    return "📈 Making progress. Try different strategies—maybe use intermediaries?";
  } else if (score >= 20) {
    return "🎯 Slow start. Consider paying for intel or introductions to build momentum.";
  } else {
    return "🔄 You need a new strategy. Talk to Melania first, then approach Trump with leverage.";
  }
}


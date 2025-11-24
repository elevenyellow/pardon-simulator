import { NextRequest, NextResponse } from'next/server';
import { scoringRepository, ScoreCategory } from'@/lib/scoring/repository';
import { getCurrentWeekId } from'@/lib/utils/week';
import { withRetry } from'@/lib/db-retry';
import { strictRateLimiter } from'@/lib/middleware/rate-limit';
import { sanitizeScoringRequest } from'@/lib/security/sanitize';
import { getClientIP, logSuspiciousActivity } from'@/lib/security/monitoring';
import { verifyWalletSignature } from'@/lib/wallet-verification';

async function handlePOST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    
    // Sanitize and validate input (SECURITY: Prevent XSS and injection)
    const sanitizationResult = sanitizeScoringRequest(rawBody);
    if (!sanitizationResult.valid) {
      console.warn(`[scoring] Validation failed: ${sanitizationResult.error}`);
      
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
    
    // SECURITY: REQUIRE authentication (either wallet signature OR agent API key)
    const walletSignature = rawBody.walletSignature;
    const walletMessage = rawBody.walletMessage;
    const agentApiKey = request.headers.get('X-Agent-API-Key');
    
    // Check if this is an agent request
    const isAgentRequest = !!agentApiKey;
    
    if (isAgentRequest) {
      // Validate agent API key
      const expectedAgentKey = process.env.AGENT_API_KEY || process.env.CORAL_AGENT_API_KEY;
      
      if (!expectedAgentKey) {
        console.error('[Security] AGENT_API_KEY not configured in environment');
        return NextResponse.json(
          { error: 'Agent authentication not configured' },
          { status: 500 }
        );
      }
      
      if (agentApiKey !== expectedAgentKey) {
        console.warn('[Security] Invalid agent API key from IP:', getClientIP(request.headers));
        logSuspiciousActivity(
          getClientIP(request.headers),
          '/api/scoring/update',
          'invalid_agent_api_key',
          { userWallet: userWallet.substring(0, 8) + '...' }
        );
        return NextResponse.json(
          { error: 'Invalid agent API key' },
          { status: 401 }
        );
      }
      
      console.log('[Security] Agent API key verified for scoring update:', userWallet.substring(0, 8) + '...');
    } else {
      // User request - require wallet signature
      if (!walletSignature || !walletMessage) {
        console.warn('[Security] Scoring update attempt without signature from IP:', getClientIP(request.headers));
        logSuspiciousActivity(
          getClientIP(request.headers),
          '/api/scoring/update',
          'missing_wallet_signature',
          { userWallet: userWallet.substring(0, 8) + '...' }
        );
        return NextResponse.json(
          { error: 'Wallet signature required for scoring updates' },
          { status: 401 }
        );
      }
      
      const isValid = verifyWalletSignature({
        walletAddress: userWallet,
        signature: walletSignature,
        message: walletMessage
      });
      
      if (!isValid) {
        console.warn('[Security] Invalid wallet signature for scoring update from IP:', getClientIP(request.headers));
        logSuspiciousActivity(
          getClientIP(request.headers),
          '/api/scoring/update',
          'invalid_wallet_signature',
          { userWallet: userWallet.substring(0, 8) + '...' }
        );
        return NextResponse.json(
          { error: 'Invalid wallet signature' },
          { status: 401 }
        );
      }
      
      console.log('[Security] Wallet signature verified for scoring update:', userWallet.substring(0, 8) + '...');
    }
    
    // Extract additional fields (some not sanitized)
    const { coralSessionId, threadId } = rawBody;
    
    // Extract and validate evaluation score and premium service payment
    let evaluationScore = 2.0;
    if (rawBody.evaluationScore !== undefined) {
      evaluationScore = parseFloat(rawBody.evaluationScore);
      if (isNaN(evaluationScore) || evaluationScore < -3.0 || evaluationScore > 3.0) {
        console.warn(`[scoring] Invalid evaluation score ${rawBody.evaluationScore}, clamping to range -3.0 to 3.0`);
        evaluationScore = Math.max(-3.0, Math.min(3.0, evaluationScore));
      }
    }
    
    let premiumServicePayment = 0;
    if (rawBody.premiumServicePayment !== undefined) {
      premiumServicePayment = parseFloat(rawBody.premiumServicePayment);
      if (isNaN(premiumServicePayment) || premiumServicePayment < 0) {
        premiumServicePayment = 0;
      }
    }
    
    console.log(`Scoring API received (sanitized): userWallet="${userWallet}", delta=${delta}, reason="${reason}"`);
    console.log(`[scoring] Using wallet: ${userWallet.substring(0, 8)}...${userWallet.substring(userWallet.length - 8)}`);
    
    // Get or create user and session for current week (with retry logic)
    const weekId = getCurrentWeekId();
    const { userId, sessionId, currentScore: oldScore} = await withRetry(
      () => scoringRepository.getOrCreateUserSession(
        userWallet,
        weekId,
        coralSessionId || undefined
      ),
      { maxRetries: 2, initialDelay: 200 }
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
        evaluationScore,
        premiumServicePayment,
      }),
      { maxRetries: 2, initialDelay: 200 }
    );
    
    // Rank calculation disabled for performance (not shown in score toast)
    // Move to separate /api/leaderboard endpoint if needed
    let rank = null;
    
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
    console.error('Scoring error:', error);
    
    // Graceful degradation: If database is down, still return success but warn
    if (error.code ==='P1001'|| error.code ==='P1017'|| error.message?.includes('database') || error.message?.includes('connection')) {
      console.warn('Database unavailable, score update not persisted');
      return NextResponse.json({
        success: true,
        newScore: 0,
        oldScore: 0,
        delta: 0,
        reason:'Database unavailable',
        category:'penalty',
        subcategory: null,
        agentId: null,
        rank: null,
        feedback:'Database temporarily unavailable - score not persisted',
        warning:'Database temporarily unavailable - score not persisted'      });
    }
    
    return NextResponse.json(
      { error:'Internal server error', message: error.message },
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
        { error:'Missing userWallet parameter'},
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
    console.error('Error fetching score:', error);
    
    // Graceful degradation: Return default values if database is down
    if (error.code ==='P1001'|| error.code ==='P1017'|| error.message?.includes('database') || error.message?.includes('connection')) {
      console.warn('Database unavailable, returning default score');
      return NextResponse.json({
        success: true,
        currentScore: 0,
        rank: null,
        weekId: getCurrentWeekId(),
        scoreHistory: [],
        warning:'Database temporarily unavailable - score may not be up to date'      });
    }
    
    return NextResponse.json(
      { error:'Internal server error', message: error.message },
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
 * Updated for increased difficulty (40-50 messages to win)
 */
function generateFeedback(score: number, delta: number): string {
  if (score >= 90) {
    return"Qualified for prizes! You've reached 90+ points. Keep pushing for the top spot!";
  } else if (score >= 70) {
    const pointsNeeded = 90 - score;
    return`Almost there! ${pointsNeeded} more points to qualify. Make sure you've talked to at least 3 different agents.`;
  } else if (score >= 50) {
    return`Halfway there! Focus on quality interactions and try talking to multiple agents for bonus points.`;
  } else if (score >= 30) {
    return"Building momentum. Premium services can accelerate your progress significantly.";
  } else if (score >= 15) {
    return"Slow start. Try different agents - Melania or CZ might be good entry points.";
  } else {
    return"You need a stronger strategy. Focus on quality over quantity and consider premium intel.";
  }
}


import { prisma } from'@/lib/prisma';
import { serviceUsageRepository } from'@/lib/premium-services/usage-repository';
import { getServiceLimit, ServiceLimitType } from'@/lib/premium-services/service-limits';

export type ScoreCategory ='payment'|'negotiation'|'milestone'|'penalty';

export type ScoreSubcategory = 
  // Penalty subcategories
  |'insult'  |'spam'  |'time_waste'  |'poor_strategy'  |'validation_fail'  |'payment_fail'  // Quality subcategories
  |'strategic_thinking'  |'agent_alignment'  |'clever_negotiation'  |'relationship_building'  |'high_quality'  |'good_quality'  |'medium_quality'  |'low_quality'  // Bonus subcategories
  |'combo'  |'streak'  |'milestone_achievement';

export interface AddScoreParams {
  userId: string;
  sessionId: string;
  threadId?: string;
  delta: number;
  reason: string;
  category: ScoreCategory;
  subcategory?: ScoreSubcategory | string;
  agentId?: string;
  messageId?: string;
  evaluationScore?: number;
  premiumServicePayment?: number;
  premiumServiceType?: string;  // NEW: Track which service was purchased
}

export interface ScoreResult {
  newScore: number;
  scoreRecord: {
    id: string;
    delta: number;
    currentScore: number;
    reason: string;
    category: string;
    subcategory?: string | null;
    agentId?: string | null;
    messageId?: string | null;
    timestamp: Date;
  };
}

export class ScoringRepository {
  /**
   * Add score delta to user's session with evaluation score and speed multipliers
   */
  async addScore(params: AddScoreParams): Promise<ScoreResult> {
    const { 
      userId, sessionId, threadId, delta, reason, category, subcategory, 
      agentId, messageId, evaluationScore = 2.0, premiumServicePayment = 0,
      premiumServiceType
    } = params;
    
    // Move everything inside transaction to prevent race conditions
    // Increased timeout from 5s to 20s for testing (handles slower operations during concurrent tests)
    const result = await prisma.$transaction(async (tx) => {
      // Fetch session data first (needed by other calculations)
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { currentScore: true, startTime: true, weekId: true, finalScore: true, messageCount: true },
      });
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Check if score is already locked (user has crossed 90 threshold)
      if (session.finalScore !== null) {
        console.log(`[Scoring] User score locked at ${session.finalScore} - no further changes allowed`);
        // Return the locked score without making any changes
        const lockedScoreRecord = {
          id: 'locked',
          delta: 0,
          currentScore: session.finalScore,
          reason: 'Score locked at prize-eligible level',
          category: category,
          subcategory: null,
          agentId: agentId || null,
          messageId: messageId || null,
          timestamp: new Date(),
        };
        return { 
          scoreRecord: lockedScoreRecord, 
          newScore: session.finalScore, 
          premiumBonusApplied: 0, 
          weekId: session.weekId,
          isLocked: true
        };
      }
      
      // Parallel calculation of multipliers (now that we have session data)
      const [speedMultiplier, multiAgentMod] = await Promise.all([
        delta >= 0 ? this.calculateSpeedMultiplier(session.startTime, sessionId, userId, tx) : Promise.resolve(1.0),
        delta >= 0 ? this.calculateMultiAgentModifier(sessionId, agentId, 0, tx) : Promise.resolve({ modifier: 1.0, canProgress: true })
      ]);
      
      // Recalculate multiAgentMod with actual current score for gate check
      const multiAgentModWithScore = delta >= 0 
        ? await this.calculateMultiAgentModifier(sessionId, agentId, session.currentScore, tx)
        : { modifier: 1.0, canProgress: true };
      
      // Calculate final delta with new system: (evaluation ± random) × speed × multiAgent + premium
      let finalDelta: number;
      let finalReason = reason;
      let premiumBonusApplied = 0;
      
      if (delta < 0) {
        // Penalties: apply random variance but no speed multiplier
        const randomVariance = this.getRandomVariance();
        finalDelta = Math.round((delta + randomVariance) * 10) / 10;
      } else {
        // Positive scores: agent's evaluation (1.0-2.0) with random variance
        const clampedEvaluation = Math.max(1.0, Math.min(2.0, evaluationScore));
        const randomVariance = this.getRandomVariance();
        
        // Calculate premium service bonus with diminishing returns
        let premiumBonus = 0;
        if (premiumServicePayment > 0 && premiumServiceType && agentId) {
          premiumBonus = await this.calculatePremiumBonusWithDiminishing(
            premiumServicePayment,
            premiumServiceType,
            userId,
            session.weekId,
            agentId
          );
          premiumBonusApplied = premiumBonus;
        }
        
        // Final calculation: (evaluation ± 0.1 random) × speed × multiAgent + premium bonus
        finalDelta = Math.round(((clampedEvaluation + randomVariance) * speedMultiplier * multiAgentModWithScore.modifier + premiumBonus) * 10) / 10;
        
        // Add warning message if hitting gate
        if (!multiAgentModWithScore.canProgress && session.currentScore >= 70) {
          finalReason += " [WARNING: Need 3+ agents to progress past 70 points]";
        }
      }
      
      // Calculate preliminary new score
      const preliminaryScore = session.currentScore + finalDelta;
      
      // Check if user is crossing the 90-point threshold
      const crossingThreshold = session.currentScore < 90 && preliminaryScore >= 90;
      
      let newScore: number;
      let isFinalEvaluation = false;
      let sessionUpdateData: any = {};
      
      if (crossingThreshold) {
        // User is crossing 90 points - apply final evaluation and lock score
        const finalBonus = await this.calculateFinalEvaluation(sessionId, userId, session.weekId, tx);
        newScore = Math.round((90 + finalBonus) * 100) / 100; // Round to 2 decimal places
        isFinalEvaluation = true;
        finalReason = `PARDON GRANTED! Final score: ${newScore.toFixed(2)} points`;
        
        // Set the locked final score and timestamp
        sessionUpdateData = { 
          currentScore: newScore,
          finalScore: newScore,
          finalScoreAt: new Date()
        };
        
        console.log(`[Final Evaluation] User ${userId} crossed 90: ${session.currentScore.toFixed(2)} -> ${newScore.toFixed(2)}`);
      } else {
        // Normal scoring - cap at 89.99 to prevent reaching threshold without evaluation
        newScore = Math.max(0, Math.min(89.99, preliminaryScore));
        sessionUpdateData = { currentScore: newScore };
      }
      
      // Parallel: create score record, update session, and update user totalScore
      const [scoreRecord] = await Promise.all([
        tx.score.create({
          data: {
            userId,
            sessionId,
            threadId,
            delta: isFinalEvaluation ? (newScore - session.currentScore) : finalDelta,
            currentScore: newScore,
            reason: finalReason,
            category: isFinalEvaluation ? 'milestone' : category,
            subcategory: isFinalEvaluation ? 'pardon_granted' : (subcategory || null),
            agentId: agentId || null,
            messageId: messageId || null,
          },
        }),
        tx.session.update({
          where: { id: sessionId },
          data: sessionUpdateData,
        }),
        // Update user's totalScore by incrementing with the delta
        tx.user.update({
          where: { id: userId },
          data: { 
            totalScore: { increment: isFinalEvaluation ? (newScore - session.currentScore) : finalDelta },
            lastActiveAt: new Date()
          },
        })
      ]);
      
      return { scoreRecord, newScore, premiumBonusApplied, weekId: session.weekId, crossedThreshold: crossingThreshold };
    }, {
      timeout: 20000, // 20 seconds (increased from default 5s for test environments)
    });
    
    // Record service usage AFTER transaction (outside to avoid deadlocks)
    if (premiumServicePayment > 0 && premiumServiceType && agentId && result.premiumBonusApplied > 0) {
      try {
        await serviceUsageRepository.recordServiceUsage(
          userId,
          sessionId,
          result.weekId,
          premiumServiceType,
          agentId,
          result.premiumBonusApplied
        );
        console.log(`[Service Usage] Recorded ${premiumServiceType} usage for user ${userId}`);
      } catch (error) {
        console.error('[Service Usage] Failed to record usage:', error);
        // Don't fail the entire scoring operation if usage recording fails
      }
    }
    
    // 🎮 Update service cooldown counters (points) - DEFENSIVE: never fails main flow
    // Only update for positive scores (rewards), not penalties
    if (result.newScore > 0 && result.scoreRecord.delta > 0) {
      try {
        await serviceUsageRepository.updateCooldowns(
          userId,
          sessionId,
          result.weekId,
          0,          // messageIncrement (handled in chat/send)
          result.scoreRecord.delta  // pointsIncrement
        );
        console.log(`[Service Cooldowns] Incremented points counter by ${result.scoreRecord.delta.toFixed(2)} for user ${userId}`);
      } catch (cooldownError) {
        // CRITICAL: Don't fail scoring if cooldown update fails
        console.error('[Service Cooldowns] Failed to update points counter (non-fatal):', cooldownError);
      }
    }
    
    return {
      newScore: result.newScore,
      scoreRecord: {
        id: result.scoreRecord.id,
        delta: result.scoreRecord.delta,
        currentScore: result.scoreRecord.currentScore,
        reason: result.scoreRecord.reason,
        category: result.scoreRecord.category,
        subcategory: result.scoreRecord.subcategory,
        agentId: result.scoreRecord.agentId,
        messageId: result.scoreRecord.messageId,
        timestamp: result.scoreRecord.timestamp,
      },
    };
  }
  
  /**
   * Calculate speed multiplier based on message timing and session duration
   * Rewards faster play with higher multipliers
   */
  private async calculateSpeedMultiplier(
    sessionStartTime: Date,
    sessionId: string,
    userId: string,
    tx: any
  ): Promise<number> {
    
    // Get user's last score timestamp
    const lastUserScore = await tx.score.findFirst({
      where: { sessionId, userId },
      orderBy: { timestamp: 'desc' }
    });
    
    const now = Date.now();
    const sessionAge = now - sessionStartTime.getTime();
    const messageGap = lastUserScore 
      ? now - lastUserScore.timestamp.getTime() 
      : 0;
    
    // Individual message speed (faster = higher multiplier)
    // < 30 sec = 1.1x, > 30 sec = 1.0x (reduced from 1.3x for game balance)
    let messageSpeedMult = 1.0;
    if (messageGap > 0) {
      if (messageGap < 30000) messageSpeedMult = 1.1;
    }
    
    // Overall session speed (faster completion = higher multiplier)
    // < 10 min = 1.1x, > 10 min = 1.0x (reduced from 1.3x for game balance)
    let sessionSpeedMult = 1.0;
    if (sessionAge < 600000) sessionSpeedMult = 1.1;
    
    // Combine both (multiplicative) - Max 1.21x (~1.2x), Min 1.0x (reduced from 1.69x)
    return messageSpeedMult * sessionSpeedMult;
  }
  
  /**
   * Get random variance for score calculation (±0.1)
   * Prevents exact point values and adds natural variance
   */
  private getRandomVariance(): number {
    // Returns a random value between -0.1 and +0.1
    return (Math.random() * 0.2) - 0.1;
  }
  
  /**
   * Calculate premium service bonus points based on payment amount
   * Linear interpolation from 2 points (min) to 10 points (max)
   * Updated for new pricing: $1-$10 range (10x from original)
   */
  private calculatePremiumBonus(paymentUsdc: number): number {
    // Updated for PARDON pricing: 1000-10000 range
    const MIN_PAYMENT = 1000;    // insider_info = 2 pts
    const MAX_PAYMENT = 10000;    // pardon_recommendation = 10 pts
    
    if (paymentUsdc <= 0) return 0;
    if (paymentUsdc <= MIN_PAYMENT) return 2;
    if (paymentUsdc >= MAX_PAYMENT) return 10;
    
    // Linear interpolation between 2 and 10 points
    const ratio = (paymentUsdc - MIN_PAYMENT) / (MAX_PAYMENT - MIN_PAYMENT);
    return Math.round(2 + (ratio * 8)); // 2-10 point range
  }
  
  /**
   * Calculate premium bonus with diminishing returns for applicable services
   * Checks service usage and applies multiplier if necessary
   */
  private async calculatePremiumBonusWithDiminishing(
    paymentUsdc: number,
    serviceType: string,
    userId: string,
    weekId: string,
    agentId: string
  ): Promise<number> {
    // Calculate base bonus
    const baseBonus = this.calculatePremiumBonus(paymentUsdc);
    
    // Check if this service has diminishing returns
    const limit = getServiceLimit(serviceType);
    if (limit.type !== ServiceLimitType.DIMINISHING) {
      return baseBonus; // No diminishing returns for this service
    }
    
    // Get current usage count
    const usageCount = await serviceUsageRepository.getUsageCount(
      userId,
      weekId,
      serviceType,
      agentId
    );
    
    // Apply diminishing returns multiplier
    const adjustedBonus = serviceUsageRepository.calculateDiminishingBonus(
      baseBonus,
      usageCount + 1  // +1 because this is the next use
    );
    
    console.log(`[Diminishing Returns] ${serviceType}: base=${baseBonus}, adjusted=${adjustedBonus} (usage=${usageCount})`);
    
    return adjustedBonus;
  }
  
  /**
   * Calculate multi-agent interaction bonus/penalty
   * Encourages players to interact with multiple agents
   * Hard gate: Can't reach 70+ with fewer than 3 agents
   */
  private async calculateMultiAgentModifier(
    sessionId: string, 
    agentId: string | undefined,
    currentScore: number,
    tx: any
  ): Promise<{ modifier: number; canProgress: boolean }> {
    if (!agentId) return { modifier: 1.0, canProgress: true };
    
    // Get unique agents interacted with in this session
    const uniqueAgents = await tx.score.groupBy({
      by: ['agentId'],
      where: { sessionId, agentId: { not: null } },
      _count: { agentId: true }
    });
    
    const agentCount = uniqueAgents.length;
    const currentAgentData = uniqueAgents.find((a: { agentId: string | null; _count: { agentId: number } }) => a.agentId === agentId);
    const currentAgentMessages = currentAgentData?._count.agentId || 0;
    
    // Hard gate: Can't reach 70+ with fewer than 3 agents
    if (currentScore >= 70 && agentCount < 3) {
      return { modifier: 0.5, canProgress: false }; // 50% penalty
    }
    
    // Diminishing returns after 5 messages to same agent
    if (currentAgentMessages >= 5) {
      const penalty = Math.min(0.5, (currentAgentMessages - 4) * 0.1);
      return { modifier: 1.0 - penalty, canProgress: true }; // Up to 50% reduction
    }
    
    // Bonus for agent diversity (3+ agents)
    if (agentCount >= 3) {
      return { modifier: 1.15, canProgress: true }; // 15% bonus
    }
    
    return { modifier: 1.0, canProgress: true };
  }
  
  /**
   * Calculate final evaluation when user crosses 90 points
   * Distributes users in 90-99.99 range based on gameplay quality
   * 
   * Factors:
   * - Speed (30%): How fast they completed the game
   * - Diversity (25%): How many unique agents they interacted with
   * - Premium (25%): How many premium services they used
   * - Efficiency (20%): Points per message ratio
   */
  private async calculateFinalEvaluation(
    sessionId: string,
    userId: string,
    weekId: string,
    tx: any
  ): Promise<number> {
    // Fetch session data for speed calculation
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true, messageCount: true }
    });
    
    if (!session) {
      console.warn('[Final Evaluation] Session not found, returning minimum bonus');
      return 0;
    }
    
    // 1. Speed Factor (0.0 - 1.0): How fast did they complete?
    // Best: <2 hours = 1.0, Worst: >24 hours = 0.0
    const sessionDuration = Date.now() - session.startTime.getTime();
    const hoursPlayed = sessionDuration / (1000 * 60 * 60);
    const speedFactor = Math.max(0, Math.min(1, 1 - (hoursPlayed - 2) / 22));
    
    // 2. Agent Diversity Factor (0.0 - 1.0): How many unique agents?
    // Best: 5+ agents = 1.0, Minimum: 3 agents = 0.33
    const uniqueAgents = await tx.score.groupBy({
      by: ['agentId'],
      where: { sessionId, agentId: { not: null } },
      _count: { agentId: true }
    });
    const agentCount = uniqueAgents.length;
    const diversityFactor = Math.max(0, Math.min(1, (agentCount - 2) / 3));
    
    // 3. Premium Service Factor (0.0 - 1.0): How many premium services used?
    // Best: 10+ services = 1.0
    const premiumUsage = await tx.serviceUsage.count({
      where: { userId, weekId }
    });
    const premiumFactor = Math.min(1, premiumUsage / 10);
    
    // 4. Message Efficiency Factor (0.0 - 1.0): Points per message ratio
    // Best: >2 points/msg = 1.0, Worst: <0.5 points/msg = 0.0
    const totalMessages = session.messageCount || 1;
    const pointsPerMessage = 90 / totalMessages;
    const efficiencyFactor = Math.max(0, Math.min(1, (pointsPerMessage - 0.5) / 1.5));
    
    // Weighted combination
    const weights = {
      speed: 0.30,
      diversity: 0.25,
      premium: 0.25,
      efficiency: 0.20
    };
    
    const finalRatio = 
      speedFactor * weights.speed +
      diversityFactor * weights.diversity +
      premiumFactor * weights.premium +
      efficiencyFactor * weights.efficiency;
    
    // Calculate final bonus: 0 to 9.99 (never exactly 10 to leave room)
    const finalBonus = Math.min(9.99, finalRatio * 9.99);
    
    console.log(`[Final Evaluation] User ${userId}: ` +
      `speed=${speedFactor.toFixed(2)} (${hoursPlayed.toFixed(1)}h), ` +
      `diversity=${diversityFactor.toFixed(2)} (${agentCount} agents), ` +
      `premium=${premiumFactor.toFixed(2)} (${premiumUsage} services), ` +
      `efficiency=${efficiencyFactor.toFixed(2)} (${pointsPerMessage.toFixed(2)} pts/msg) ` +
      `=> bonus=${finalBonus.toFixed(2)}`);
    
    return finalBonus;
  }
  
  /**
   * Get user's score history for current week
   */
  async getScoreHistory(userId: string, weekId: string) {
    return prisma.score.findMany({
      where: {
        userId,
        session: { weekId },
      },
      orderBy: { timestamp:'desc'},
      take: 50,
      select: {
        id: true,
        delta: true,
        currentScore: true,
        reason: true,
        category: true,
        subcategory: true,
        agentId: true,
        messageId: true,
        timestamp: true,
      },
    });
  }
  
  /**
   * Get score breakdown by category for a user's week
   */
  async getScoreBreakdown(userId: string, weekId: string) {
    const scores = await prisma.score.findMany({
      where: {
        userId,
        session: { weekId },
      },
      select: {
        delta: true,
        category: true,
        subcategory: true,
      },
    });
    
    const breakdown = {
      payment: 0,
      negotiation: 0,
      milestone: 0,
      penalty: 0,
      total: 0,
    };
    
    scores.forEach(score => {
      breakdown[score.category as keyof typeof breakdown] = 
        (breakdown[score.category as keyof typeof breakdown] || 0) + score.delta;
      breakdown.total += score.delta;
    });
    
    return breakdown;
  }
  
  /**
   * Get penalty details for a user's week
   */
  async getPenaltyDetails(userId: string, weekId: string) {
    return prisma.score.findMany({
      where: {
        userId,
        session: { weekId },
        category:'penalty',
      },
      orderBy: { timestamp:'desc'},
      select: {
        delta: true,
        reason: true,
        subcategory: true,
        agentId: true,
        timestamp: true,
      },
    });
  }
  
  /**
   * Get current week leaderboard
   */
  async getLeaderboard(weekId: string, limit = 100) {
    return prisma.session.findMany({
      where: { weekId },
      orderBy: { currentScore:'desc'},
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            walletAddress: true,
          },
        },
      },
    });
  }
  
  /**
   * Get user's current session for week
   */
  async getUserSessionForWeek(userId: string, weekId: string) {
    return prisma.session.findFirst({
      where: {
        userId,
        weekId,
      },
      select: {
        id: true,
        currentScore: true,
        startTime: true,
        coralSessionId: true,
      },
    });
  }
  
  /**
   * Get user's wallet address from their Coral session
   * This allows agents to use agent IDs (like"sbf") and resolve to actual wallets
   */
  async getWalletFromSession(coralSessionId: string): Promise<string | null> {
    try {
      // Find session by Coral ID
      const session = await prisma.session.findFirst({
        where: { coralSessionId },
        include: { user: true },
      });
      
      if (session && session.user) {
        return session.user.walletAddress;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting wallet from session:', error);
      return null;
    }
  }
  
  /**
   * Get user's wallet address from a thread (via session)
   * This allows agents to use agent IDs and resolve via threadId
   */
  async getWalletFromThread(coralThreadId: string): Promise<string | null> {
    try {
      // Find thread, then get session, then get user
      const thread = await prisma.thread.findFirst({
        where: { coralThreadId },
        include: {
          session: {
            include: { user: true },
          },
        },
      });
      
      if (thread && thread.session && thread.session.user) {
        return thread.session.user.walletAddress;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting wallet from thread:', error);
      return null;
    }
  }
  
  /**
   * Get or create user's session for current week
   * Uses upsert to safely handle concurrent requests and prevent duplicates
   */
  async getOrCreateUserSession(
    walletAddress: string,
    weekId: string,
    coralSessionId?: string
  ): Promise<{ userId: string; sessionId: string; currentScore: number }> {
    // SECURITY: Prevent creating user records with agent IDs as wallet addresses
    // SBF is a proxy agent, not a real user
    if (walletAddress === 'sbf' || walletAddress.length < 32) {
      throw new Error(`Invalid wallet address: ${walletAddress}`);
    }
    
    // Find or create user (upsert for safety)
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: {
        walletAddress,
        username: this.generateUsername(walletAddress),
      },
    });
    
    //  Use upsert with unique constraint [userId, weekId] to prevent duplicates
    // This is safe for concurrent requests - database will ensure only one session per user+week
    const session = await prisma.session.upsert({
      where: {
        userId_weekId: {
          userId: user.id,
          weekId,
        },
      },
      update: {
        // Update coralSessionId if provided and current value is empty
        ...(coralSessionId && { coralSessionId }),
      },
      create: {
        userId: user.id,
        weekId,
        coralSessionId: coralSessionId ||'',
      },
    });
    
    return {
      userId: user.id,
      sessionId: session.id,
      currentScore: session.currentScore,
    };
  }
  
  /**
   * Update session's coral session ID
   */
  async updateCoralSessionId(sessionId: string, coralSessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { coralSessionId },
    });
  }
  
  /**
   * Get user rank in current week
   */
  async getUserRank(userId: string, weekId: string): Promise<number | null> {
    const session = await prisma.session.findFirst({
      where: { userId, weekId },
    });
    
    if (!session) return null;
    
    const higherScoreSessions = await prisma.session.count({
      where: {
        weekId,
        currentScore: { gt: session.currentScore },
      },
    });
    
    return higherScoreSessions + 1; // Rank is 1-indexed
  }
  
  /**
   * Generate username from wallet address
   */
  private generateUsername(walletAddress: string): string {
    const prefix = walletAddress.slice(0, 6);
    const suffix = walletAddress.slice(-4);
    return`Player_${prefix}...${suffix}`;
  }
}

// Singleton instance
export const scoringRepository = new ScoringRepository();


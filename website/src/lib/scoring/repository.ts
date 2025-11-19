import { prisma } from'@/lib/prisma';

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
      agentId, messageId, evaluationScore = 2.0, premiumServicePayment = 0 
    } = params;
    
    // Move everything inside transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Parallel fetch: session data and multipliers calculation
      const [session, speedMultiplier, multiAgentMod] = await Promise.all([
        tx.session.findUnique({
          where: { id: sessionId },
          select: { currentScore: true, startTime: true },
        }),
        delta >= 0 ? this.calculateSpeedMultiplier(sessionId, userId, tx) : Promise.resolve(1.0),
        delta >= 0 ? this.calculateMultiAgentModifier(sessionId, agentId, 0, tx) : Promise.resolve({ modifier: 1.0, canProgress: true })
      ]);
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Recalculate multiAgentMod with actual current score for gate check
      const multiAgentModWithScore = delta >= 0 
        ? await this.calculateMultiAgentModifier(sessionId, agentId, session.currentScore, tx)
        : { modifier: 1.0, canProgress: true };
      
      // Calculate final delta with new system: (evaluation ± random) × speed × multiAgent + premium
      let finalDelta: number;
      let finalReason = reason;
      
      if (delta < 0) {
        // Penalties: apply random variance but no speed multiplier
        const randomVariance = this.getRandomVariance();
        finalDelta = Math.round((delta + randomVariance) * 10) / 10;
      } else {
        // Positive scores: agent's evaluation (1.0-2.0) with random variance
        const clampedEvaluation = Math.max(1.0, Math.min(2.0, evaluationScore));
        const randomVariance = this.getRandomVariance();
        
        // Calculate premium service bonus
        const premiumBonus = this.calculatePremiumBonus(premiumServicePayment);
        
        // Final calculation: (evaluation ± 0.1 random) × speed × multiAgent + premium bonus
        finalDelta = Math.round(((clampedEvaluation + randomVariance) * speedMultiplier * multiAgentModWithScore.modifier + premiumBonus) * 10) / 10;
        
        // Add warning message if hitting gate
        if (!multiAgentModWithScore.canProgress && session.currentScore >= 70) {
          finalReason += " [WARNING: Need 3+ agents to progress past 70 points]";
        }
      }
      
      // Calculate new score (capped at 0-100, prize eligibility at 90+)
      const newScore = Math.max(0, Math.min(100, session.currentScore + finalDelta));
      
      // Parallel: create score record and update session
      const [scoreRecord] = await Promise.all([
        tx.score.create({
          data: {
            userId,
            sessionId,
            threadId,
            delta: finalDelta,
            currentScore: newScore,
            reason: finalReason,
            category,
            subcategory: subcategory || null,
            agentId: agentId || null,
            messageId: messageId || null,
          },
        }),
        tx.session.update({
          where: { id: sessionId },
          data: { currentScore: newScore },
        })
      ]);
      
      return { scoreRecord, newScore };
    });
    
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
    sessionId: string,
    userId: string,
    tx: any
  ): Promise<number> {
    // Get session start time
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { startTime: true }
    });
    
    if (!session) return 1.0;
    
    // Get user's last score timestamp
    const lastUserScore = await tx.score.findFirst({
      where: { sessionId, userId },
      orderBy: { timestamp: 'desc' }
    });
    
    const now = Date.now();
    const sessionAge = now - session.startTime.getTime();
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
   * Linear interpolation from 1 point (min) to 5 points (max)
   * Reduced from 2-10 for better game balance
   */
  private calculatePremiumBonus(paymentUsdc: number): number {
    // Map from premium_services.json prices
    const MIN_PAYMENT = 0.0005;  // insider_info = 1 pt (was 2)
    const MAX_PAYMENT = 0.01;     // pardon_recommendation = 5 pts (was 10)
    
    if (paymentUsdc <= 0) return 0;
    if (paymentUsdc <= MIN_PAYMENT) return 1;  // was 2
    if (paymentUsdc >= MAX_PAYMENT) return 5;  // was 10
    
    // Linear interpolation between 1 and 5 points (was 2-10)
    const ratio = (paymentUsdc - MIN_PAYMENT) / (MAX_PAYMENT - MIN_PAYMENT);
    return Math.round(1 + (ratio * 4)); // 1-5 point range (was 2-10)
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


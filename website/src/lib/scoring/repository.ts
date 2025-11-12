import { prisma } from '@/lib/prisma';

export type ScoreCategory = 'payment' | 'negotiation' | 'milestone' | 'penalty';

export type ScoreSubcategory = 
  // Penalty subcategories
  | 'insult'
  | 'spam'
  | 'time_waste'
  | 'poor_strategy'
  | 'validation_fail'
  | 'payment_fail'
  // Quality subcategories
  | 'strategic_thinking'
  | 'agent_alignment'
  | 'clever_negotiation'
  | 'relationship_building'
  | 'high_quality'
  | 'good_quality'
  | 'medium_quality'
  | 'low_quality'
  // Bonus subcategories
  | 'combo'
  | 'streak'
  | 'milestone_achievement';

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
   * Add score delta to user's session
   */
  async addScore(params: AddScoreParams): Promise<ScoreResult> {
    const { userId, sessionId, threadId, delta, reason, category, subcategory, agentId, messageId } = params;
    
    // FIX: Move everything inside transaction to prevent race conditions
    // Previously, reading the score outside the transaction caused concurrent requests
    // to overwrite each other's updates, leading to lost points
    const result = await prisma.$transaction(async (tx) => {
      // Get current session score with row lock (prevents concurrent updates)
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { currentScore: true },
      });
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Apply randomization to delta (±10% variance)
      const randomizedDelta = this.applyRandomization(delta, userId);
      
      // Calculate new score (capped at 0-100)
      const newScore = Math.max(0, Math.min(100, session.currentScore + randomizedDelta));
      
      // Create score record
      const scoreRecord = await tx.score.create({
        data: {
          userId,
          sessionId,
          threadId,
          delta: randomizedDelta,
          currentScore: newScore,
          reason,
          category,
          subcategory: subcategory || null,
          agentId: agentId || null,
          messageId: messageId || null,
        },
      });
      
      // Update session score atomically
      await tx.session.update({
        where: { id: sessionId },
        data: { currentScore: newScore },
      });
      
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
   * Apply ±10% randomization to score delta based on user ID
   * This prevents exact gaming while keeping outcomes predictable
   */
  private applyRandomization(delta: number, userId: string): number {
    // Skip randomization for penalties (always exact)
    if (delta < 0) return delta;
    
    // Skip randomization for very small deltas
    if (Math.abs(delta) <= 2) return delta;
    
    // Generate deterministic random from user ID
    const seed = parseInt(userId.slice(0, 8), 16);
    const random = (seed % 100) / 100; // 0.0 to 1.0
    
    // Apply ±10% variance (was ±20%)
    // random 0.0 → 0.9x, random 1.0 → 1.1x
    const variance = 0.9 + (random * 0.2); // 0.9 to 1.1
    
    return Math.round(delta * variance);
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
      orderBy: { timestamp: 'desc' },
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
        category: 'penalty',
      },
      orderBy: { timestamp: 'desc' },
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
      orderBy: { currentScore: 'desc' },
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
   * This allows agents to use agent IDs (like "sbf") and resolve to actual wallets
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
    
    // ✅ Use upsert with unique constraint [userId, weekId] to prevent duplicates
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
        coralSessionId: coralSessionId || '',
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
    return `Player_${prefix}...${suffix}`;
  }
}

// Singleton instance
export const scoringRepository = new ScoringRepository();


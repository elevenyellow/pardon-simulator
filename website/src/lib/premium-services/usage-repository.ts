/**
 * Service Usage Repository
 * 
 * Handles tracking and validation of premium service usage,
 * enforcing limits and calculating diminishing returns.
 */

import { prisma } from '@/lib/prisma';
import {
  ServiceLimitType,
  getServiceLimit,
  getDiminishingMultiplier,
  isCooldownMet,
  getUnavailableMessage,
} from './service-limits';

export interface ServiceAvailability {
  available: boolean;
  reason?: string;
  usageCount?: number;
  nextAvailableAfter?: {
    messages?: number;
    points?: number;
  };
  bonusMultiplier?: number; // For diminishing returns services
}

export class ServiceUsageRepository {
  /**
   * Check if a service is available for purchase
   * Returns availability status and reason if unavailable
   */
  async checkServiceAvailability(
    userId: string,
    sessionId: string,
    weekId: string,
    serviceType: string,
    agentId: string
  ): Promise<ServiceAvailability> {
    const limit = getServiceLimit(serviceType);
    
    // REPEATABLE services are always available
    if (limit.type === ServiceLimitType.REPEATABLE) {
      return { available: true };
    }
    
    // Check existing usage
    const usage = await this.getServiceUsage(userId, weekId, serviceType, agentId);
    
    if (!usage) {
      // First time using this service - always available
      return { available: true, usageCount: 0 };
    }
    
    // Apply limit logic based on service type
    switch (limit.type) {
      case ServiceLimitType.ONE_TIME:
        // Already used once - not available
        return {
          available: false,
          reason: getUnavailableMessage(serviceType, limit, usage.usageCount),
          usageCount: usage.usageCount,
        };
      
      case ServiceLimitType.COOLDOWN:
        // Check if max uses reached (if specified)
        if (limit.maxUses && usage.usageCount >= limit.maxUses) {
          return {
            available: false,
            reason: getUnavailableMessage(serviceType, limit, usage.usageCount),
            usageCount: usage.usageCount,
          };
        }
        
        // Check cooldown requirements
        const cooldownMet = isCooldownMet(
          limit,
          usage.messagesSinceUse,
          usage.pointsSinceUse
        );
        
        if (cooldownMet) {
          return { available: true, usageCount: usage.usageCount };
        }
        
        // Still on cooldown
        const messagesNeeded = limit.cooldownMessages 
          ? Math.max(0, limit.cooldownMessages - usage.messagesSinceUse)
          : 0;
        const pointsNeeded = limit.cooldownPoints
          ? Math.max(0, limit.cooldownPoints - usage.pointsSinceUse)
          : 0;
        
        return {
          available: false,
          reason: getUnavailableMessage(
            serviceType,
            limit,
            usage.usageCount,
            usage.messagesSinceUse,
            usage.pointsSinceUse
          ),
          usageCount: usage.usageCount,
          nextAvailableAfter: {
            messages: messagesNeeded > 0 ? messagesNeeded : undefined,
            points: pointsNeeded > 0 ? pointsNeeded : undefined,
          },
        };
      
      case ServiceLimitType.DIMINISHING:
        // Always available, but return bonus multiplier
        const multiplier = getDiminishingMultiplier(usage.usageCount + 1);
        return {
          available: true,
          usageCount: usage.usageCount,
          bonusMultiplier: multiplier,
        };
      
      default:
        return { available: true, usageCount: usage.usageCount };
    }
  }
  
  /**
   * Record a service usage
   * Creates new record or updates existing one
   */
  async recordServiceUsage(
    userId: string,
    sessionId: string,
    weekId: string,
    serviceType: string,
    agentId: string,
    scoreBonus: number
  ): Promise<void> {
    const existing = await this.getServiceUsage(userId, weekId, serviceType, agentId);
    
    if (existing) {
      // Update existing usage record
      await prisma.serviceUsage.update({
        where: {
          userId_weekId_serviceType_agentId: {
            userId,
            weekId,
            serviceType,
            agentId,
          },
        },
        data: {
          usageCount: existing.usageCount + 1,
          lastUsedAt: new Date(),
          lastScoreBonus: scoreBonus,
          messagesSinceUse: 0,  // Reset cooldown counters
          pointsSinceUse: 0,
        },
      });
    } else {
      // Create new usage record
      await prisma.serviceUsage.create({
        data: {
          userId,
          sessionId,
          weekId,
          serviceType,
          agentId,
          usageCount: 1,
          firstUsedAt: new Date(),
          lastUsedAt: new Date(),
          lastScoreBonus: scoreBonus,
          messagesSinceUse: 0,
          pointsSinceUse: 0,
        },
      });
    }
  }
  
  /**
   * Get service usage record for a user
   */
  async getServiceUsage(
    userId: string,
    weekId: string,
    serviceType: string,
    agentId: string
  ) {
    return await prisma.serviceUsage.findUnique({
      where: {
        userId_weekId_serviceType_agentId: {
          userId,
          weekId,
          serviceType,
          agentId,
        },
      },
    });
  }
  
  /**
   * Update cooldown counters when user sends a message or gains points
   * Should be called after each user message and score update
   */
  async updateCooldowns(
    userId: string,
    sessionId: string,
    weekId: string,
    messageIncrement: number = 1,
    pointsIncrement: number = 0
  ): Promise<void> {
    // Update all cooldown services for this user in this week
    await prisma.serviceUsage.updateMany({
      where: {
        userId,
        weekId,
        sessionId,
      },
      data: {
        messagesSinceUse: {
          increment: messageIncrement,
        },
        pointsSinceUse: {
          increment: pointsIncrement,
        },
      },
    });
  }
  
  /**
   * Get all service usage for a user in a given week
   * Useful for displaying usage history
   */
  async getUserServiceUsage(userId: string, weekId: string) {
    return await prisma.serviceUsage.findMany({
      where: {
        userId,
        weekId,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });
  }
  
  /**
   * Calculate adjusted bonus for diminishing returns services
   */
  calculateDiminishingBonus(baseBonus: number, usageCount: number): number {
    const multiplier = getDiminishingMultiplier(usageCount);
    return Math.round(baseBonus * multiplier * 10) / 10; // Round to 1 decimal
  }
  
  /**
   * Check if a specific service has been used by a user
   */
  async hasUsedService(
    userId: string,
    weekId: string,
    serviceType: string,
    agentId: string
  ): Promise<boolean> {
    const usage = await this.getServiceUsage(userId, weekId, serviceType, agentId);
    return usage !== null;
  }
  
  /**
   * Get usage count for a service
   */
  async getUsageCount(
    userId: string,
    weekId: string,
    serviceType: string,
    agentId: string
  ): Promise<number> {
    const usage = await this.getServiceUsage(userId, weekId, serviceType, agentId);
    return usage?.usageCount || 0;
  }
}

// Export singleton instance
export const serviceUsageRepository = new ServiceUsageRepository();


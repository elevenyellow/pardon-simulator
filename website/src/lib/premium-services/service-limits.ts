/**
 * Premium Service Usage Limitations
 * 
 * Loads service restrictions from JSON configuration file.
 * In production, this is fetched from S3 at runtime.
 */

import serviceLimitsData from './service-limits.json';

export enum ServiceLimitType {
  ONE_TIME = 'one_time',        // Can only be purchased once per week
  COOLDOWN = 'cooldown',         // Can repeat after cooldown period
  DIMINISHING = 'diminishing',   // Repeatable but with decreasing bonus points
  REPEATABLE = 'repeatable'      // Fully repeatable with no restrictions
}

export interface ServiceLimit {
  type: ServiceLimitType;
  cooldownMessages?: number;  // Number of messages required before reuse (for cooldown type)
  cooldownPoints?: number;    // Points required to gain before reuse (alternative cooldown metric)
  maxUses?: number;           // Maximum uses per week (optional, for cooldown services)
  description?: string;       // Human-readable description of the limit
}

/**
 * Service Limitation Configuration
 * Loaded from service-limits.json (kept private, uploaded to S3)
 * 
 * Services not listed default to REPEATABLE type.
 */
export const SERVICE_LIMITS: Record<string, ServiceLimit> = serviceLimitsData as Record<string, ServiceLimit>;

/**
 * Get service limit configuration for a given service type
 * Returns REPEATABLE type if service is not configured
 */
export function getServiceLimit(serviceType: string): ServiceLimit {
  return SERVICE_LIMITS[serviceType] || {
    type: ServiceLimitType.REPEATABLE,
    description: 'Fully repeatable service (no restrictions)'
  };
}

/**
 * Calculate diminishing returns multiplier based on usage count
 * 1st use: 100% (1.0x)
 * 2nd use: 50% (0.5x)
 * 3rd+ uses: 25% (0.25x)
 */
export function getDiminishingMultiplier(usageCount: number): number {
  if (usageCount <= 1) return 1.0;   // First use: full bonus
  if (usageCount === 2) return 0.5;  // Second use: half bonus
  return 0.25;                        // Third+ use: quarter bonus
}

/**
 * Check if a service requires cooldown and if cooldown requirements are met
 */
export function isCooldownMet(
  limit: ServiceLimit,
  messagesSinceUse: number,
  pointsSinceUse: number
): boolean {
  if (limit.type !== ServiceLimitType.COOLDOWN) {
    return true; // Not a cooldown service
  }
  
  // Check if either cooldown requirement is met (messages OR points)
  const messagesOk = !limit.cooldownMessages || messagesSinceUse >= limit.cooldownMessages;
  const pointsOk = !limit.cooldownPoints || pointsSinceUse >= limit.cooldownPoints;
  
  return messagesOk || pointsOk;
}

/**
 * Get user-friendly error message for service unavailability
 */
export function getUnavailableMessage(
  serviceType: string,
  limit: ServiceLimit,
  usageCount: number,
  messagesSinceUse?: number,
  pointsSinceUse?: number
): string {
  switch (limit.type) {
    case ServiceLimitType.ONE_TIME:
      return `You've already received the "${serviceType}" service. This is a one-time opportunity per week.`;
    
    case ServiceLimitType.COOLDOWN:
      const messagesNeeded = limit.cooldownMessages ? limit.cooldownMessages - (messagesSinceUse || 0) : 0;
      const pointsNeeded = limit.cooldownPoints ? limit.cooldownPoints - (pointsSinceUse || 0) : 0;
      
      if (limit.maxUses && usageCount >= limit.maxUses) {
        return `You've reached the maximum uses (${limit.maxUses}) for "${serviceType}" this week.`;
      }
      
      const parts = [];
      if (messagesNeeded > 0) {
        parts.push(`${messagesNeeded} more messages`);
      }
      if (pointsNeeded > 0 && pointsNeeded > 0) {
        parts.push(`${pointsNeeded.toFixed(1)} more points`);
      }
      
      const requirement = parts.join(' or ');
      return `The "${serviceType}" service is on cooldown. You need ${requirement} before using it again.`;
    
    case ServiceLimitType.DIMINISHING:
      const multiplier = getDiminishingMultiplier(usageCount + 1);
      const percentage = Math.round(multiplier * 100);
      return `You can use "${serviceType}" again, but you'll only receive ${percentage}% of the bonus points (used ${usageCount} times already).`;
    
    default:
      return `The "${serviceType}" service is currently unavailable.`;
  }
}

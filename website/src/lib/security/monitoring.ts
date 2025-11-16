/**
 * Security Monitoring and Logging
 * 
 * Logs security-related events for monitoring and alerting.
 * In production, this should integrate with a proper logging service.
 */

export enum SecurityEventType {
  RATE_LIMIT_EXCEEDED ='rate_limit_exceeded',
  INVALID_INPUT ='invalid_input',
  INJECTION_ATTEMPT ='injection_attempt',
  AUTH_FAILURE ='auth_failure',
  SUSPICIOUS_ACTIVITY ='suspicious_activity',
  XSS_ATTEMPT ='xss_attempt',
  SQL_INJECTION_ATTEMPT ='sql_injection_attempt',
  CORS_VIOLATION ='cors_violation',
  INVALID_SIGNATURE ='invalid_signature',
  REPEATED_FAILURES ='repeated_failures',
}

export enum SecurityLevel {
  LOW ='low',
  MEDIUM ='medium',
  HIGH ='high',
  CRITICAL ='critical',
}

interface SecurityEvent {
  type: SecurityEventType;
  level: SecurityLevel;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  userId?: string;
  walletAddress?: string;
}

/**
 * Log security event
 */
export function logSecurityEvent(event: Omit<SecurityEvent,'timestamp'>): void {
  const fullEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Format log message
  const logPrefix = getLogPrefix(event.level);
  const logMessage =`${logPrefix} [${event.type.toUpperCase()}] ${event.message}`;

  // Console logging (in production, send to logging service)
  console.warn(logMessage, {
    ...fullEvent.details,
    ip: fullEvent.ip,
    endpoint: fullEvent.endpoint,
  });

  // In production, send to monitoring service
  if (process.env.NODE_ENV ==='production') {
    sendToMonitoringService(fullEvent);
  }

  // Store in database for audit trail
  if (shouldStoreInDatabase(event.level)) {
    storeSecurityEvent(fullEvent).catch(err => {
      console.error('Failed to store security event:', err);
    });
  }
}

/**
 * Get log prefix based on severity level
 */
function getLogPrefix(level: SecurityLevel): string {
  switch (level) {
    case SecurityLevel.LOW:
      return'[LOW]';
    case SecurityLevel.MEDIUM:
      return'[MEDIUM]';
    case SecurityLevel.HIGH:
      return'[HIGH]';
    case SecurityLevel.CRITICAL:
      return'[CRITICAL]';
    default:
      return'[WARNING]';
  }
}

/**
 * Check if event should be stored in database
 */
function shouldStoreInDatabase(level: SecurityLevel): boolean {
  // Store medium and above in database
  return level === SecurityLevel.MEDIUM || 
         level === SecurityLevel.HIGH || 
         level === SecurityLevel.CRITICAL;
}

/**
 * Store security event in database
 */
async function storeSecurityEvent(event: SecurityEvent): Promise<void> {
  // TODO: Implement database storage
  // For now, just log that we would store it
  if (process.env.NODE_ENV ==='development') {
    console.log('Would store security event in database:', event.type);
  }
}

/**
 * Send event to external monitoring service
 */
function sendToMonitoringService(event: SecurityEvent): void {
  // TODO: Implement integration with monitoring service
  // Examples: Datadog, New Relic, Sentry, etc.
  if (process.env.MONITORING_WEBHOOK_URL) {
    fetch(process.env.MONITORING_WEBHOOK_URL, {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(event),
    }).catch(err => {
      console.error('Failed to send to monitoring service:', err);
    });
  }
}

/**
 * Helper functions for common security events
 */

export function logRateLimitExceeded(
  ip: string,
  endpoint: string,
  attempts: number
): void {
  logSecurityEvent({
    type: SecurityEventType.RATE_LIMIT_EXCEEDED,
    level: attempts > 100 ? SecurityLevel.HIGH : SecurityLevel.MEDIUM,
    message:`Rate limit exceeded from IP ${ip}`,
    ip,
    endpoint,
    details: { attempts },
  });
}

export function logInjectionAttempt(
  ip: string,
  endpoint: string,
  input: string,
  detectedPattern: string
): void {
  logSecurityEvent({
    type: SecurityEventType.INJECTION_ATTEMPT,
    level: SecurityLevel.HIGH,
    message:`Potential injection attempt detected`,
    ip,
    endpoint,
    details: {
      input: input.substring(0, 100), // Limit logged input
      detectedPattern,
    },
  });
}

export function logXSSAttempt(
  ip: string,
  endpoint: string,
  input: string
): void {
  logSecurityEvent({
    type: SecurityEventType.XSS_ATTEMPT,
    level: SecurityLevel.HIGH,
    message:`Potential XSS attempt detected`,
    ip,
    endpoint,
    details: {
      input: input.substring(0, 100), // Limit logged input
    },
  });
}

export function logAuthFailure(
  ip: string,
  endpoint: string,
  reason: string,
  walletAddress?: string
): void {
  logSecurityEvent({
    type: SecurityEventType.AUTH_FAILURE,
    level: SecurityLevel.MEDIUM,
    message:`Authentication failure: ${reason}`,
    ip,
    endpoint,
    walletAddress,
    details: { reason },
  });
}

export function logInvalidSignature(
  ip: string,
  endpoint: string,
  walletAddress?: string
): void {
  logSecurityEvent({
    type: SecurityEventType.INVALID_SIGNATURE,
    level: SecurityLevel.MEDIUM,
    message:`Invalid transaction signature provided`,
    ip,
    endpoint,
    walletAddress,
  });
}

export function logSuspiciousActivity(
  ip: string,
  endpoint: string,
  description: string,
  details?: Record<string, any>
): void {
  logSecurityEvent({
    type: SecurityEventType.SUSPICIOUS_ACTIVITY,
    level: SecurityLevel.MEDIUM,
    message:`Suspicious activity: ${description}`,
    ip,
    endpoint,
    details,
  });
}

export function logCORSViolation(
  ip: string,
  origin: string,
  endpoint: string
): void {
  logSecurityEvent({
    type: SecurityEventType.CORS_VIOLATION,
    level: SecurityLevel.LOW,
    message:`CORS violation from origin ${origin}`,
    ip,
    endpoint,
    details: { origin },
  });
}

/**
 * Extract IP from request (works with various proxy setups)
 */
export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = headers.get('cf-connecting-ip'); // Cloudflare
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  return'unknown';
}

/**
 * Threat scoring system - tracks repeated suspicious activities
 */
const threatScores = new Map<string, { score: number; lastSeen: number }>();

export function updateThreatScore(
  identifier: string, // IP or wallet address
  points: number
): number {
  const now = Date.now();
  const existing = threatScores.get(identifier);

  if (existing) {
    // Decay score over time (1 point per hour)
    const hoursSinceLastSeen = (now - existing.lastSeen) / (1000 * 60 * 60);
    const decayedScore = Math.max(0, existing.score - Math.floor(hoursSinceLastSeen));
    
    const newScore = decayedScore + points;
    threatScores.set(identifier, { score: newScore, lastSeen: now });
    
    // Alert on high threat scores
    if (newScore >= 100) {
      logSecurityEvent({
        type: SecurityEventType.REPEATED_FAILURES,
        level: SecurityLevel.CRITICAL,
        message:`High threat score detected for ${identifier}`,
        details: { identifier, threatScore: newScore },
      });
    }
    
    return newScore;
  } else {
    threatScores.set(identifier, { score: points, lastSeen: now });
    return points;
  }
}

/**
 * Check if identifier should be blocked based on threat score
 */
export function shouldBlock(identifier: string, threshold: number = 100): boolean {
  const threat = threatScores.get(identifier);
  return threat ? threat.score >= threshold : false;
}

/**
 * Clean up old threat scores (run periodically)
 */
export function cleanupThreatScores(): void {
  const now = Date.now();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  for (const [identifier, data] of threatScores.entries()) {
    if (data.lastSeen < oneWeekAgo) {
      threatScores.delete(identifier);
    }
  }
}

// Clean up every 6 hours
setInterval(cleanupThreatScores, 6 * 60 * 60 * 1000);


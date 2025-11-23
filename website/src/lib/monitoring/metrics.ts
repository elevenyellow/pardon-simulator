/**
 * Performance Metrics Tracking
 * 
 * Provides comprehensive per-hop performance tracking for the entire
 * message pipeline from frontend to agents and back.
 */

import { prisma } from '@/lib/prisma';

type PipelineHop = 
  | 'frontend_to_backend'
  | 'backend_to_coral'
  | 'coral_to_agent'
  | 'agent_processing'
  | 'agent_to_backend'
  | 'backend_to_frontend';

interface TrackAgentResponseParams {
  agentId: string;
  messageId: string;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
  fastPath?: boolean;
}

interface TrackPipelineHopParams {
  hop: PipelineHop;
  messageId: string;
  durationMs: number;
  metadata?: Record<string, any>;
}

export class PerformanceMetrics {
  
  /**
   * Track agent response time
   */
  static async trackAgentResponse(params: TrackAgentResponseParams): Promise<void> {
    const { agentId, messageId, startTime, endTime, success, error, fastPath } = params;
    const duration = endTime - startTime;
    
    // Log structured metrics
    console.log(JSON.stringify({
      metric: 'agent_response_time',
      agent_id: agentId,
      message_id: messageId,
      duration_ms: duration,
      success,
      error,
      fast_path: fastPath,
      timestamp: new Date().toISOString()
    }));
    
    // TODO: Store in dedicated metrics table for analytics
    // For now, log to console which can be ingested by CloudWatch/Datadog
  }
  
  /**
   * Track individual pipeline hop latency
   */
  static async trackPipelineHop(params: TrackPipelineHopParams): Promise<void> {
    const { hop, messageId, durationMs, metadata } = params;
    
    console.log(JSON.stringify({
      metric: 'pipeline_hop',
      hop,
      message_id: messageId,
      duration_ms: durationMs,
      metadata,
      timestamp: new Date().toISOString()
    }));
  }
  
  /**
   * Track SLA violations
   */
  static async trackSLAViolation(params: {
    agentId: string;
    messageId: string;
    expectedMs: number;
    actualMs: number;
    isPremium: boolean;
  }): Promise<void> {
    const { agentId, messageId, expectedMs, actualMs, isPremium } = params;
    
    console.error(JSON.stringify({
      metric: 'sla_violation',
      agent_id: agentId,
      message_id: messageId,
      expected_ms: expectedMs,
      actual_ms: actualMs,
      is_premium: isPremium,
      overage_ms: actualMs - expectedMs,
      timestamp: new Date().toISOString()
    }));
  }
  
  /**
   * Get performance statistics for a time period
   */
  static async getStats(since: Date): Promise<{
    totalMessages: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
  }> {
    // TODO: Implement when we have dedicated metrics storage
    // For now, return placeholder
    return {
      totalMessages: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0
    };
  }
  
  /**
   * Start tracking a message through the pipeline
   */
  static startMessageTracking(messageId: string): MessageTracker {
    return new MessageTracker(messageId);
  }
}

/**
 * Tracks a single message through the entire pipeline
 */
export class MessageTracker {
  private messageId: string;
  private startTime: number;
  private hops: Map<PipelineHop, number>;
  
  constructor(messageId: string) {
    this.messageId = messageId;
    this.startTime = Date.now();
    this.hops = new Map();
  }
  
  /**
   * Mark the start of a pipeline hop
   */
  startHop(hop: PipelineHop): void {
    this.hops.set(hop, Date.now());
  }
  
  /**
   * Mark the end of a pipeline hop and track duration
   */
  async endHop(hop: PipelineHop, metadata?: Record<string, any>): Promise<void> {
    const startTime = this.hops.get(hop);
    if (!startTime) {
      console.warn(`[MessageTracker] No start time for hop: ${hop}`);
      return;
    }
    
    const duration = Date.now() - startTime;
    await PerformanceMetrics.trackPipelineHop({
      hop,
      messageId: this.messageId,
      durationMs: duration,
      metadata
    });
  }
  
  /**
   * Get total elapsed time since start
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
  
  /**
   * Get summary of all hops
   */
  getSummary(): {
    messageId: string;
    totalMs: number;
    hops: Array<{ hop: string; durationMs: number }>;
  } {
    const summary = {
      messageId: this.messageId,
      totalMs: this.getElapsedMs(),
      hops: [] as Array<{ hop: string; durationMs: number }>
    };
    
    // Calculate duration for each hop
    const hopEntries = Array.from(this.hops.entries());
    for (let i = 0; i < hopEntries.length; i++) {
      const [hop, startTime] = hopEntries[i];
      const nextStartTime = i < hopEntries.length - 1 ? hopEntries[i + 1][1] : Date.now();
      summary.hops.push({
        hop,
        durationMs: nextStartTime - startTime
      });
    }
    
    return summary;
  }
}

/**
 * Middleware helper for tracking API route performance
 */
export function withMetrics<T>(
  routeName: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  return handler()
    .then(result => {
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        metric: 'api_route_duration',
        route: routeName,
        duration_ms: duration,
        success: true,
        timestamp: new Date().toISOString()
      }));
      return result;
    })
    .catch(error => {
      const duration = Date.now() - startTime;
      console.error(JSON.stringify({
        metric: 'api_route_duration',
        route: routeName,
        duration_ms: duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }));
      throw error;
    });
}


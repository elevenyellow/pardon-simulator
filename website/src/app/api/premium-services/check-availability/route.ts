/**
 * Premium Service Availability Check API
 * 
 * Validates if a user can purchase a premium service based on usage limits.
 * Called by agents before creating payment requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serviceUsageRepository } from '@/lib/premium-services/usage-repository';
import { scoringRepository } from '@/lib/scoring/repository';
import { getCurrentWeekId } from '@/lib/utils/week';
import { getClientIP, logSuspiciousActivity } from '@/lib/security/monitoring';

interface AvailabilityRequest {
  userWallet: string;
  serviceType: string;
  agentId: string;
  coralSessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AvailabilityRequest = await request.json();
    
    // Validate required fields
    if (!body.userWallet || !body.serviceType || !body.agentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: userWallet, serviceType, agentId',
        },
        { status: 400 }
      );
    }
    
    const { userWallet, serviceType, agentId, coralSessionId } = body;
    
    // Get current week ID
    const weekId = getCurrentWeekId();
    
    // Get or create user and session
    const { userId, sessionId } = await scoringRepository.getOrCreateUserSession(
      userWallet,
      weekId,
      coralSessionId
    );
    
    // Check service availability
    const availability = await serviceUsageRepository.checkServiceAvailability(
      userId,
      sessionId,
      weekId,
      serviceType,
      agentId
    );
    
    // Log the check
    console.log(`[Premium Service] Availability check for ${serviceType} by ${agentId}: ${availability.available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    if (!availability.available) {
      console.log(`[Premium Service] Reason: ${availability.reason}`);
    }
    
    return NextResponse.json({
      success: true,
      available: availability.available,
      reason: availability.reason,
      usageCount: availability.usageCount,
      nextAvailableAfter: availability.nextAvailableAfter,
      bonusMultiplier: availability.bonusMultiplier,
    });
    
  } catch (error: any) {
    console.error('[Premium Service] Availability check error:', error);
    
    // Log suspicious activity for security monitoring
    const ip = getClientIP(request.headers);
    logSuspiciousActivity(
      ip,
      '/api/premium-services/check-availability',
      `Error during availability check: ${error.message}`,
      { error: error.stack }
    );
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check service availability',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}


import { NextRequest, NextResponse } from'next/server';
import { prisma } from'@/lib/prisma';

/**
 * Update payment with x402scan data
 * PATCH /api/payments/[signature]/x402
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ signature: string }> }
) {
  try {
    // SECURITY: Require agent API key authentication
    const agentApiKey = request.headers.get('X-Agent-API-Key');
    const expectedAgentKey = process.env.AGENT_API_KEY || process.env.CORAL_AGENT_API_KEY;
    
    if (!expectedAgentKey) {
      console.error('[Payment x402 API] AGENT_API_KEY not configured');
      return NextResponse.json(
        { error: 'Agent authentication not configured' },
        { status: 500 }
      );
    }
    
    if (agentApiKey !== expectedAgentKey) {
      console.warn('[Payment x402 API] Invalid agent API key');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { signature } = await params;
    const data = await request.json();
    
    const payment = await prisma.payment.update({
      where: { signature },
      data: {
        x402Registered: data.x402Registered || true,
        x402ScanUrl: data.x402ScanUrl,
        x402ScanId: data.x402ScanId,
        x402RegisteredAt: data.x402RegisteredAt ? new Date(data.x402RegisteredAt * 1000) : new Date()
      }
    });
    
    return NextResponse.json({ success: true, payment });
    
  } catch (error: any) {
    console.error('x402 data update error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { intermediaryStateStorage } from '@/lib/intermediary-state-storage';

/**
 * Dynamic route for GET and DELETE operations on intermediary state
 * 
 * GET /api/agent/intermediary-state/[agentId]/[threadId] - Retrieve state
 * DELETE /api/agent/intermediary-state/[agentId]/[threadId] - Clear state
 */

/**
 * Verify agent API key authentication
 */
function verifyAgentAuth(request: NextRequest): NextResponse | null {
  const agentApiKey = request.headers.get('X-Agent-API-Key');
  const expectedAgentKey = process.env.AGENT_API_KEY || process.env.CORAL_AGENT_API_KEY;
  
  if (!expectedAgentKey) {
    console.error('[IntermediaryState API] AGENT_API_KEY not configured');
    return NextResponse.json(
      { error: 'Agent authentication not configured' },
      { status: 500 }
    );
  }
  
  if (agentApiKey !== expectedAgentKey) {
    console.warn('[IntermediaryState API] Invalid agent API key');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  return null; // Auth successful
}

/**
 * GET /api/agent/intermediary-state/[agentId]/[threadId]
 * Retrieve intermediary state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; threadId: string }> }
) {
  try {
    // SECURITY: Require agent API key authentication
    const authError = verifyAgentAuth(request);
    if (authError) return authError;
    
    const { agentId, threadId } = await params;
    
    if (!agentId || !threadId) {
      return NextResponse.json(
        { error: 'Missing agentId or threadId in path' },
        { status: 400 }
      );
    }
    
    const state = await intermediaryStateStorage.get(agentId, threadId);
    
    if (!state) {
      return NextResponse.json(
        { error: 'State not found or expired' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(state);
  } catch (error) {
    console.error('[IntermediaryState API] Error retrieving state:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve state' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/intermediary-state/[agentId]/[threadId]
 * Clear intermediary state
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; threadId: string }> }
) {
  try {
    // SECURITY: Require agent API key authentication
    const authError = verifyAgentAuth(request);
    if (authError) return authError;
    
    const { agentId, threadId } = await params;
    
    if (!agentId || !threadId) {
      return NextResponse.json(
        { error: 'Missing agentId or threadId in path' },
        { status: 400 }
      );
    }
    
    const existed = await intermediaryStateStorage.delete(agentId, threadId);
    
    console.log(`[IntermediaryState API] Deleted: ${agentId}:${threadId} (existed: ${existed})`);
    
    return NextResponse.json({ success: true, existed });
  } catch (error) {
    console.error('[IntermediaryState API] Error deleting state:', error);
    return NextResponse.json(
      { error: 'Failed to delete state' },
      { status: 500 }
    );
  }
}


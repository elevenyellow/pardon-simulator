import { NextRequest, NextResponse } from 'next/server';
import { intermediaryStateStorage } from '@/lib/intermediary-state-storage';

/**
 * Intermediary State API
 * 
 * Tracks when an agent is in "intermediary mode" - waiting for a response after
 * using contact_agent() to reach another agent on behalf of the user.
 * 
 * POST /api/agent/intermediary-state - Store state
 */

/**
 * POST /api/agent/intermediary-state
 * Store intermediary state
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require agent API key authentication
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
    
    const state = await request.json();
    
    if (!state.agent_id || !state.thread_id) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id, thread_id' },
        { status: 400 }
      );
    }
    
    await intermediaryStateStorage.set(state.agent_id, state.thread_id, state);
    
    console.log(`[IntermediaryState API] Stored: ${state.agent_id} waiting for ${state.target_agent}`);
    
    return NextResponse.json({ 
      success: true, 
      key: `${state.agent_id}:${state.thread_id}` 
    });
  } catch (error) {
    console.error('[IntermediaryState API] Error storing state:', error);
    return NextResponse.json(
      { error: 'Failed to store state' },
      { status: 500 }
    );
  }
}


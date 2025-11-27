import { NextRequest, NextResponse } from 'next/server';
import { intermediaryStateStorage } from '@/lib/intermediary-state-storage';

/**
 * Dynamic route for GET and DELETE operations on intermediary state
 * 
 * GET /api/agent/intermediary-state/[agentId]/[threadId] - Retrieve state
 * DELETE /api/agent/intermediary-state/[agentId]/[threadId] - Clear state
 */

/**
 * GET /api/agent/intermediary-state/[agentId]/[threadId]
 * Retrieve intermediary state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; threadId: string }> }
) {
  try {
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


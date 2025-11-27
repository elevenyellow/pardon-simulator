import { prisma } from './prisma';

export interface IntermediaryState {
  agent_id: string;
  thread_id: string;
  target_agent: string;
  purpose: string;
  timestamp: number;      // Unix timestamp (for agent compatibility)
  expires_at: number;     // Unix timestamp (for agent compatibility)
}

export const intermediaryStateStorage = {
  /**
   * Store intermediary state in database
   */
  async set(agentId: string, threadId: string, state: IntermediaryState): Promise<void> {
    try {
      // Convert Unix timestamps to Date objects
      const expiresAt = new Date(state.expires_at * 1000);
      
      await prisma.intermediaryState.upsert({
        where: {
          agentId_threadId: {
            agentId,
            threadId
          }
        },
        update: {
          targetAgent: state.target_agent,
          purpose: state.purpose,
          expiresAt
        },
        create: {
          agentId,
          threadId,
          targetAgent: state.target_agent,
          purpose: state.purpose,
          expiresAt
        }
      });
      
      console.log(`[IntermediaryState] Stored: ${agentId} waiting for ${state.target_agent}`);
    } catch (error) {
      console.error('[IntermediaryState] Database error during set:', error);
      throw error;
    }
  },

  /**
   * Retrieve intermediary state from database
   */
  async get(agentId: string, threadId: string): Promise<IntermediaryState | undefined> {
    try {
      const state = await prisma.intermediaryState.findUnique({
        where: {
          agentId_threadId: {
            agentId,
            threadId
          }
        }
      });

      if (!state) {
        return undefined;
      }

      // Check if expired
      const now = new Date();
      if (state.expiresAt < now) {
        // Delete expired state
        await this.delete(agentId, threadId);
        return undefined;
      }

      // Convert to Unix timestamps for agent compatibility
      return {
        agent_id: state.agentId,
        thread_id: state.threadId,
        target_agent: state.targetAgent,
        purpose: state.purpose,
        timestamp: Math.floor(state.timestamp.getTime() / 1000),
        expires_at: Math.floor(state.expiresAt.getTime() / 1000)
      };
    } catch (error) {
      console.error('[IntermediaryState] Database error during get:', error);
      return undefined;
    }
  },

  /**
   * Delete intermediary state from database
   */
  async delete(agentId: string, threadId: string): Promise<boolean> {
    try {
      await prisma.intermediaryState.delete({
        where: {
          agentId_threadId: {
            agentId,
            threadId
          }
        }
      });
      console.log(`[IntermediaryState] Deleted: ${agentId}:${threadId}`);
      return true;
    } catch (error) {
      // Record might not exist - this is not an error
      return false;
    }
  }
};

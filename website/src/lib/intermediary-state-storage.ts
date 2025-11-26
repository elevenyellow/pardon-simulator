/**
 * Shared in-memory storage for intermediary state
 * 
 * Uses a singleton pattern to ensure all API routes access the same Map instance.
 * In production with multiple instances, this should be replaced with Redis.
 */

interface IntermediaryState {
  agent_id: string;
  thread_id: string;
  target_agent: string;
  purpose: string;
  timestamp: number;
  expires_at: number;
}

class IntermediaryStateStorage {
  private static instance: IntermediaryStateStorage;
  private states: Map<string, IntermediaryState>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.states = new Map();
    this.startCleanup();
  }

  public static getInstance(): IntermediaryStateStorage {
    if (!IntermediaryStateStorage.instance) {
      IntermediaryStateStorage.instance = new IntermediaryStateStorage();
    }
    return IntermediaryStateStorage.instance;
  }

  private startCleanup() {
    // Cleanup expired states every 5 minutes
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        const now = Date.now() / 1000;
        let cleaned = 0;
        
        for (const [key, state] of this.states.entries()) {
          if (state.expires_at < now) {
            this.states.delete(key);
            cleaned++;
          }
        }
        
        if (cleaned > 0) {
          console.log(`[IntermediaryState] Cleaned up ${cleaned} expired state(s)`);
        }
      }, 5 * 60 * 1000);
    }
  }

  public set(agentId: string, threadId: string, state: IntermediaryState): void {
    const key = `${agentId}:${threadId}`;
    this.states.set(key, state);
  }

  public get(agentId: string, threadId: string): IntermediaryState | undefined {
    const key = `${agentId}:${threadId}`;
    const state = this.states.get(key);
    
    if (!state) {
      return undefined;
    }
    
    // Check if expired
    const now = Date.now() / 1000;
    if (state.expires_at < now) {
      this.states.delete(key);
      return undefined;
    }
    
    return state;
  }

  public delete(agentId: string, threadId: string): boolean {
    const key = `${agentId}:${threadId}`;
    return this.states.delete(key);
  }

  public size(): number {
    return this.states.size;
  }
}

// Export singleton instance
export const intermediaryStateStorage = IntermediaryStateStorage.getInstance();
export type { IntermediaryState };


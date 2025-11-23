/**
 * Test Environment Setup
 * Initialize and configure test environment
 */

import { getTestWallet, resetTestWallet } from '@/lib/testing/test-wallet';
import { getCurrentTestWallet } from '../fixtures/test-wallets';
import { APIClient } from '@/lib/api-client';
import { TEST_CONFIG } from '../../../test.config';

const shouldLogCleanup =
  process.env.TEST_LOG_CLEANUP === 'true' || process.env.TEST_DEBUG === 'true';

const cleanupLog = (message: string, ...args: unknown[]): void => {
  if (shouldLogCleanup) {
    console.log(message, ...args);
  }
};

export interface TestEnvironment {
  sessionId: string;
  threadId: string;
  userWallet: string;
  testWallet: ReturnType<typeof getTestWallet>;
  apiClient: APIClient;
}

/**
 * Setup test environment for a single test
 */
export async function setupTestEnvironment(): Promise<TestEnvironment> {
  console.log('[TEST_SETUP] Initializing test environment');

  // Reset wallet to ensure clean state
  resetTestWallet();

  // Get test wallet
  const testWallet = getTestWallet();
  const userWallet = testWallet.publicKey.toString();

  console.log('[TEST_SETUP] Test wallet:', userWallet);

  // Create API client with full URL for Node.js environment
  const apiClient = new APIClient(`${TEST_CONFIG.endpoints.backend}/api`);

  // Create session
  const sessionId = await createTestSession(userWallet, apiClient);
  console.log('[TEST_SETUP] Created session:', sessionId);

  // Skip session verification for fixed test session
  // The agents will auto-create the session when they connect in Coral dev mode
  const isFixedTestSession = sessionId === (TEST_CONFIG.endpoints.testSessionId || 'test-session-fixed');
  
  console.log('[TEST_SETUP] ✅ Using fixed test session (agents pre-connected)');

  // Add thread creation rate limit to prevent overwhelming Coral Server
  // This ensures we don't create too many threads simultaneously in one session
  await new Promise(resolve => setTimeout(resolve, 500));

  // PRODUCTION EMULATION: Wait for agents to initialize
  // In production, there's a natural delay between session creation and user interaction
  // This gives agents time to connect to the Coral session and subscribe to threads
  await waitForAgentsToInitialize(15000);

  // Create thread (will be created on first message, but we can prepare)
  const threadId = ''; // Will be set after first message

  const env: TestEnvironment = {
    sessionId,
    threadId,
    userWallet,
    testWallet,
    apiClient,
  };

  console.log('[TEST_SETUP] Test environment ready', env);

  return env;
}

/**
 * Create a test session
 * PRODUCTION SAFE: Uses fixed session ID for local testing when CORAL_SESSION_ID is set
 * This allows agents to connect to the same session as tests
 * Production is unaffected (doesn't use test framework)
 * 
 * FIX: Always use fixed session since agents are pre-connected to it
 * Thread cleanup is handled separately to prevent resource exhaustion
 */
export async function createTestSession(userWallet: string, apiClient: APIClient): Promise<string> {
  // For local testing with agents: use fixed session ID
  // Agents must be started with: export CORAL_SESSION_ID="test-session-fixed"
  const fixedSessionId = TEST_CONFIG.endpoints.testSessionId || 'test-session-fixed';
  
  console.log(`[TEST_SETUP] Using fixed session ID: ${fixedSessionId}`);
  console.log(`[TEST_SETUP] ⚠️  Agents must be started with: export CORAL_SESSION_ID="${fixedSessionId}"`);
  
  return fixedSessionId;
}

/**
 * Wait for agents to connect to the Coral session
 * PRODUCTION EMULATION: Simple time-based delay matching real user behavior
 * In production, there's a natural delay between session creation and user's first message
 */
export async function waitForAgentsToInitialize(delayMs: number = 15000): Promise<void> {
  console.log(`[TEST_SETUP] Waiting ${delayMs}ms for agents to connect and enter listening loop...`);
  console.log('[TEST_SETUP] NOTE: Agents must complete:');
  console.log('[TEST_SETUP]   1. SSE connection to Coral');
  console.log('[TEST_SETUP]   2. MCP server setup');
  console.log('[TEST_SETUP]   3. Agent executor creation');
  console.log('[TEST_SETUP]   4. First waitForMentions() call');
  await new Promise(resolve => setTimeout(resolve, delayMs));
  console.log('[TEST_SETUP] ✅ Agents should be in listening state');
}

/**
 * Verify session exists in Coral
 */
export async function verifySessionExists(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${TEST_CONFIG.endpoints.coral}/api/v1/sessions`);
    if (!response.ok) return false;
    
    const sessionIds = await response.json();
    const exists = sessionIds.includes(sessionId);
    console.log(`[TEST_SETUP] Session ${sessionId.slice(0, 8)}... ${exists ? 'EXISTS' : 'NOT FOUND'} in Coral`);
    return exists;
  } catch (error) {
    console.error('[TEST_SETUP] Session verification error:', error);
    return false;
  }
}

/**
 * Verify thread exists in Coral before sending messages
 * Enhanced to check participant status
 */
export async function verifyThreadInCoral(
  sessionId: string,
  threadId: string,
  expectedParticipants?: string[],
  baseUrl: string = TEST_CONFIG.endpoints.coral
): Promise<{ verified: boolean; participants?: string[] }> {
  try {
    console.log(`[TEST_SETUP] Verifying thread ${threadId.slice(0, 8)}...`);
    
    const response = await fetch(
      `${baseUrl}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    
    if (!response.ok) {
      return { verified: false };
    }
    
    // Get thread participants from Coral
    const participantsResponse = await fetch(
      `${baseUrl}/api/v1/sessions/${sessionId}/threads/${threadId}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    
    if (participantsResponse.ok) {
      const threadData = await participantsResponse.json();
      const participants = threadData.participantIds || [];
      
      console.log(`[TEST_SETUP] Thread participants: ${participants.join(', ')}`);
      
      if (expectedParticipants) {
        const allPresent = expectedParticipants.every(p => participants.includes(p));
        if (!allPresent) {
          console.error(`[TEST_SETUP] Missing participants. Expected: ${expectedParticipants.join(', ')}, Got: ${participants.join(', ')}`);
          return { verified: false, participants };
        }
      }
      
      return { verified: true, participants };
    }
    
    return { verified: true };
  } catch (error) {
    console.error('[TEST_SETUP] Thread verification error:', error);
    return { verified: false };
  }
}

/**
 * Wait for agent to be ready and listening
 */
export async function waitForAgentReady(
  sessionId: string,
  agentId: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;
  
  console.log(`[TEST_SETUP] Waiting for agent ${agentId} to be ready...`);
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(
        `${TEST_CONFIG.endpoints.coral}/api/v1/sessions/${sessionId}/agents`
      );
      
      if (response.ok) {
        const agents = await response.json();
        const agentIds = agents.map((a: any) => a.id || a);
        
        if (agentIds.includes(agentId)) {
          console.log(`[TEST_SETUP] ✅ Agent ${agentId} is ready`);
          return true;
        }
      }
    } catch (error) {
      // Continue polling
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  console.error(`[TEST_SETUP] ❌ Agent ${agentId} not ready after ${timeoutMs}ms`);
  return false;
}

/**
 * Create a test thread
 */
export async function createTestThread(
  sessionId: string,
  agentId: string,
  baseUrl: string = TEST_CONFIG.endpoints.backend
): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/api/chat/thread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        agentId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[TEST_SETUP] Created thread ${data.threadId.slice(0, 8)}... for agent ${agentId}`);
    
    // Verify thread exists in Coral
    const verified = await verifyThreadInCoral(sessionId, data.threadId);
    if (!verified) {
      throw new Error('Thread not initialized in Coral');
    }
    
    // PRODUCTION EMULATION: Delay after thread creation
    // In production, user takes time to type message after opening chat
    // Also gives Coral time to fully initialize the thread
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return data.threadId;
  } catch (error) {
    console.error('[TEST_SETUP] Error creating thread:', error);
    throw error;
  }
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  cleanupLog('[TEST_CLEANUP] Cleaning up test environment', {
    sessionId: env.sessionId,
    userWallet: env.userWallet,
  });

  try {
    // Import cleanup functions
    const { cleanupTestData, cleanupTestUser } = await import('./assert-database');

    // Clean up session data
    if (env.sessionId) {
      await cleanupTestData(env.sessionId);
    }

    // Clean up user data (optional, comment out to preserve data between test runs)
    // await cleanupTestUser(env.userWallet);

    // Reset wallet
    resetTestWallet();

    cleanupLog('[TEST_CLEANUP] Cleanup complete');
  } catch (error) {
    console.error('[TEST_CLEANUP] Error during cleanup:', error);
  }
}

/**
 * Wait for test environment to be ready
 */
export async function waitForEnvironmentReady(
  timeout: number = 10000
): Promise<boolean> {
  const startTime = Date.now();

  console.log('[TEST_SETUP] Waiting for environment to be ready...');

  while (Date.now() - startTime < timeout) {
    try {
      // Check if API is responsive
      const response = await fetch('/api/agents/balances');
      if (response.ok) {
        console.log('[TEST_SETUP] Environment is ready');
        return true;
      }
    } catch (error) {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.warn('[TEST_SETUP] Environment readiness check timed out');
  return false;
}

/**
 * Create test environment with specific agent
 */
export async function setupTestEnvironmentWithAgent(
  agentId: string
): Promise<TestEnvironment & { threadId: string }> {
  const env = await setupTestEnvironment();

  // Create thread with agent
  const threadId = await createTestThread(env.sessionId, agentId);

  return {
    ...env,
    threadId,
  };
}

/**
 * Get test configuration from environment
 */
export interface TestConfig {
  rpcUrl: string;
  backendUrl: string;
  coralServerUrl: string;
  testWalletPrivateKey: string;
  debugMode: boolean;
}

export function getTestConfig(): TestConfig {
  return {
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000',
    coralServerUrl: process.env.CORAL_SERVER_URL || 'http://localhost:5555',
    testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY || '',
    debugMode: process.env.TEST_DEBUG === 'true',
  };
}

/**
 * Log test information for debugging
 */
export function logTestInfo(testName: string, info: Record<string, any>): void {
  const config = getTestConfig();
  
  if (config.debugMode) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[TEST_INFO] ${testName}`);
    console.log(`${'='.repeat(80)}`);
    Object.entries(info).forEach(([key, value]) => {
      console.log(`  ${key}: ${JSON.stringify(value, null, 2)}`);
    });
    console.log(`${'='.repeat(80)}\n`);
  }
}


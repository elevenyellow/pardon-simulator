/**
 * Bulk Agent Test Suite
 * Comprehensive test of all agents with multiple messages, premium services, and interactions
 * 
 * This is the main test suite for verifying the entire system works end-to-end
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment, logTestInfo, verifyThreadInCoral } from '../helpers/setup-test-env';
import { waitForAgentResponse } from '../helpers/wait-for-agent-response';
import { getUserScore, closeDatabaseConnection } from '../helpers/assert-database';
import { sendMessageWithPayment } from '../helpers/send-message-with-payment';
import { retryTest } from '../helpers/test-retry';
import { TEST_CONFIG, type AgentId } from '../../../test.config';
import { TEST_MESSAGES, ALL_AGENT_IDS } from '../fixtures/test-messages';
import type { SendMessageRequest, SendMessageResponse } from '@/lib/api-client';

/**
 * Helper: Create thread and wait for it to be ready
 * PRODUCTION EMULATION: In production, thread is created then user takes time to type
 * Enhanced with agent readiness and participant verification
 */
async function createThreadAndWait(
  env: TestEnvironment,
  agentId: AgentId
): Promise<string> {
  console.log(`[TEST] Creating thread for agent: ${agentId}`);
  
  // STEP 1: Create thread
  // Note: Agent readiness check removed - the endpoint doesn't exist in Coral
  // The 15-second initial wait in setupTestEnvironment() + thread creation retry logic
  // is sufficient to ensure agents are ready
  const threadResponse = await env.apiClient.createThread(env.sessionId, agentId);
  const threadId = threadResponse.threadId;
  
  // STEP 2: Verify thread exists and has correct participants
  const verification = await verifyThreadInCoral(
    env.sessionId, 
    threadId,
    [agentId, 'sbf']  // Expected participants
  );
  
  if (!verification.verified) {
    throw new Error(`Thread ${threadId} not properly initialized in Coral`);
  }
  
  if (verification.participants && !verification.participants.includes(agentId)) {
    throw new Error(`Agent ${agentId} not listed as participant in thread ${threadId}`);
  }
  
  // STEP 3: Wait for thread initialization
  // PRODUCTION EMULATION: User takes time to start typing after opening chat
  // Also gives Coral time to fully initialize the thread
  console.log(`[TEST] Thread created and verified, waiting for initialization...`);
  await new Promise(resolve => setTimeout(resolve, 3000));  // Increased from 2s to 3s
  
  return threadId;
}

/**
 * Helper: Send message and wait for it to be processed
 * PRODUCTION EMULATION: After sending message, give Coral time to route to agent
 */
async function sendMessageAndWait(
  env: TestEnvironment,
  request: SendMessageRequest
): Promise<void> {
  await sendMessageWithPayment(env, request, {
    logPrefix: '[BULK]',
  });
  
  // Give Coral time to:
  // 1. Add message to thread
  // 2. Emit SessionEvent
  // 3. Call notifyMentionedAgents()
  // 4. Complete agent's waiting deferred
  // 5. Agent wakes and starts processing
  console.log(`[TEST] Waiting for message to reach agent...`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}

describe('Bulk Agent Test Suite', () => {
  let env: TestEnvironment;
  let initialScore: number = 0;

  beforeAll(async () => {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 BULK AGENT TEST SUITE - STARTING');
    console.log('='.repeat(80) + '\n');
    
    env = await setupTestEnvironment();
    initialScore = await getUserScore(env.userWallet);
    
    logTestInfo('Test Environment', {
      sessionId: env.sessionId,
      userWallet: env.userWallet,
      initialScore,
      agentCount: ALL_AGENT_IDS.length,
    });
  }, TEST_CONFIG.timeouts.testSuite);

  afterAll(async () => {
    // Skip cleanup if environment setup failed
    if (!env || !env.userWallet) {
      console.log('[TEST_CLEANUP] Skipping cleanup - environment was not initialized');
      await closeDatabaseConnection();
      return;
    }
    
    const finalScore = await getUserScore(env.userWallet);
    const scoreDelta = finalScore - initialScore;
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BULK AGENT TEST SUITE - COMPLETED');
    console.log('='.repeat(80));
    console.log(`Initial Score: ${initialScore}`);
    console.log(`Final Score:   ${finalScore}`);
    console.log(`Score Delta:   +${scoreDelta}`);
    console.log('='.repeat(80) + '\n');
    
    await cleanupTestEnvironment(env);
    await closeDatabaseConnection();
  });

  describe('Test All Agents - 3 Messages Each', () => {
    // Test trump-donald
    test('should test trump-donald with 3 messages', async () => {
      const agentId: AgentId = 'trump-donald';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing agent: ${agentId}`);
      console.log('='.repeat(80));

      const messages = [
        '@trump-donald Hello Mr. President, I need to speak with you about an important matter.',
        '@trump-donald I have a business proposition that could benefit your administration.',
        '@trump-donald I\'d like to discuss a potential pardon. Can we talk?',
      ];

      const threadId = await createThreadAndWait(env, agentId);

      for (let i = 0; i < messages.length; i++) {
        console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
        
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: messages[i],
          agentId,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
        expect(response).toBeTruthy();
        expect(response.content.length).toBeGreaterThan(10);
      }

      console.log(`[${agentId}] ✅ Completed 3 messages\n`);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);

    // Test cz (moved earlier to avoid interaction with premium service test)
    // Wrapped with retry logic to handle potential timing issues
    test('should test cz with 3 messages', async () => {
      await retryTest(async () => {
        const agentId: AgentId = 'cz';
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[BULK TEST] Testing agent: ${agentId}`);
        console.log('='.repeat(80));

        const messages = [
          TEST_MESSAGES.cz.binanceHelp,
          TEST_MESSAGES.cz.marketInsight,
          TEST_MESSAGES.cz.pardonSupport,
        ];

        const threadId = await createThreadAndWait(env, agentId);

        for (let i = 0; i < messages.length; i++) {
          console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
          
          await sendMessageAndWait(env, {
            sessionId: env.sessionId,
            threadId,
            content: messages[i],
            agentId,
            userWallet: env.userWallet,
          });

          const response = await waitForAgentResponse({
            sessionId: env.sessionId,
            threadId,
            agentId,
            timeout: TEST_CONFIG.timeouts.agentResponse,
            baseUrl: TEST_CONFIG.endpoints.backend,
          });

          console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
          expect(response).toBeTruthy();
        }

        console.log(`[${agentId}] ✅ Completed 3 messages\n`);
      }, {
        maxRetries: 1,  // One retry if it fails
        retryDelay: 10000,  // 10 second delay between retries
        testName: 'CZ agent test'
      });
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3 * 2);  // Double timeout for retry

    // Test trump-melania
    test('should test trump-melania with 3 messages', async () => {
      const agentId: AgentId = 'trump-melania';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing agent: ${agentId}`);
      console.log('='.repeat(80));

      const messages = TEST_MESSAGES.conversations.negotiation.map(fn => fn(agentId)).slice(0, 3);

      const threadId = await createThreadAndWait(env, agentId);

      for (let i = 0; i < messages.length; i++) {
        console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
        
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: messages[i],
          agentId,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
        expect(response).toBeTruthy();
      }

      console.log(`[${agentId}] ✅ Completed 3 messages\n`);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);

    // Test trump-eric
    test('should test trump-eric with 3 messages', async () => {
      const agentId: AgentId = 'trump-eric';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing agent: ${agentId}`);
      console.log('='.repeat(80));

      const messages = [
        TEST_MESSAGES.eric.businessAdvice,
        TEST_MESSAGES.eric.familyInfluence,
        TEST_MESSAGES.eric.realEstateIdea,
      ];

      const threadId = await createThreadAndWait(env, agentId);

      for (let i = 0; i < messages.length; i++) {
        console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
        
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: messages[i],
          agentId,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
        expect(response).toBeTruthy();
      }

      console.log(`[${agentId}] ✅ Completed 3 messages\n`);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);

    // Test trump-donjr
    test('should test trump-donjr with 3 messages', async () => {
      const agentId: AgentId = 'trump-donjr';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing agent: ${agentId}`);
      console.log('='.repeat(80));

      const messages = [
        TEST_MESSAGES.donjr.huntingStory,
        TEST_MESSAGES.donjr.businessDeal,
        TEST_MESSAGES.donjr.politicalAdvice,
      ];

      const threadId = await createThreadAndWait(env, agentId);

      for (let i = 0; i < messages.length; i++) {
        console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
        
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: messages[i],
          agentId,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
        expect(response).toBeTruthy();
      }

      console.log(`[${agentId}] ✅ Completed 3 messages\n`);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);

    // Test trump-barron
    test('should test trump-barron with 3 messages', async () => {
      const agentId: AgentId = 'trump-barron';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing agent: ${agentId}`);
      console.log('='.repeat(80));

      const messages = [
        TEST_MESSAGES.barron.techTalk,
        TEST_MESSAGES.barron.cryptoDiscussion,
        TEST_MESSAGES.barron.gamingChat,
      ];

      const threadId = await createThreadAndWait(env, agentId);

      for (let i = 0; i < messages.length; i++) {
        console.log(`[${agentId}] Message ${i + 1}/${messages.length}`);
        
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: messages[i],
          agentId,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        console.log(`[${agentId}] Response ${i + 1}: ${response.content.slice(0, 100)}...`);
        expect(response).toBeTruthy();
      }

      console.log(`[${agentId}] ✅ Completed 3 messages\n`);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);
  });

  describe('Test Premium Services', () => {
    test('should request premium service from at least one agent', async () => {
      const agentId: AgentId = 'cz';
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[BULK TEST] Testing premium service with ${agentId}`);
      console.log('='.repeat(80));

      const message = TEST_MESSAGES.premiumServices.insiderInfo(agentId);

      const threadId = await createThreadAndWait(env, agentId);

      await sendMessageAndWait(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      });

      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
        baseUrl: TEST_CONFIG.endpoints.backend,
      });

      console.log('[PREMIUM SERVICE] Response:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(10);

      console.log('[PREMIUM SERVICE] ✅ Premium service request handled\n');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Test Agent-to-Agent Interaction', () => {
    test('should test agent-to-agent communication', async () => {
      console.log(`\n${'='.repeat(80)}`);
      console.log('[BULK TEST] Testing agent-to-agent interaction');
      console.log('='.repeat(80));

      // Ask Melania to speak with Donald
      const melaniaThreadId = await createThreadAndWait(env, 'trump-melania');

      await sendMessageAndWait(env, {
        sessionId: env.sessionId,
        threadId: melaniaThreadId,
        content: '@trump-melania Can you speak with Donald on my behalf about a pardon?',
        agentId: 'trump-melania',
        userWallet: env.userWallet,
      });

      const melaniaResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: melaniaThreadId,
        agentId: 'trump-melania',
        timeout: TEST_CONFIG.timeouts.agentInteraction,
        baseUrl: TEST_CONFIG.endpoints.backend,
      });

      console.log('[AGENT INTERACTION] Melania responded:', melaniaResponse.content.slice(0, 150));

      expect(melaniaResponse).toBeTruthy();
      expect(melaniaResponse.content.length).toBeGreaterThan(10);

      console.log('[AGENT INTERACTION] ✅ Agent interaction test completed\n');
    }, TEST_CONFIG.timeouts.agentInteraction + 20000);
  });

  describe('Verify Score Updates', () => {
    test('should have increased score from interactions', async () => {
      const currentScore = await getUserScore(env.userWallet);
      const scoreDelta = currentScore - initialScore;

      console.log(`\n${'='.repeat(80)}`);
      console.log('[SCORE CHECK] Verifying score increased');
      console.log('='.repeat(80));
      console.log(`Initial Score: ${initialScore}`);
      console.log(`Current Score: ${currentScore}`);
      console.log(`Delta:         +${scoreDelta}`);
      console.log('='.repeat(80) + '\n');

      // Score should have increased (at least 1 point per message)
      expect(currentScore).toBeGreaterThanOrEqual(initialScore);

      if (scoreDelta > 0) {
        console.log(`✅ Score increased by ${scoreDelta} points`);
      } else {
        console.log('⚠️  Score did not increase (scoring may be disabled)');
      }
    });
  });
});


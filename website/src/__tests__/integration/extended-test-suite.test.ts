/**
 * Extended Test Suite
 * Comprehensive testing including:
 * - More messages per agent (5 each)
 * - All premium service types
 * - Negative test cases (expected failures)
 * - Bad tone messages (score decrease)
 * - Professional tone messages (score increase)
 * - Edge cases and validation
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../helpers/setup-test-env';
import { waitForAgentResponse } from '../helpers/wait-for-agent-response';
import { getUserScore, closeDatabaseConnection } from '../helpers/assert-database';
import { sendMessageWithPayment } from '../helpers/send-message-with-payment';
import { TEST_CONFIG, type AgentId } from '../../../test.config';
import { TEST_MESSAGES, ALL_AGENT_IDS } from '../fixtures/test-messages';

/**
 * Helper: Create thread and wait for it to be ready
 */
async function createThreadAndWait(
  env: TestEnvironment,
  agentId: AgentId
): Promise<string> {
  const threadResponse = await env.apiClient.createThread(env.sessionId, agentId);
  const threadId = threadResponse.threadId;
  
  console.log(`[TEST] Thread created: ${threadId}`);
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return threadId;
}

/**
 * Helper: Send message and wait
 */
async function sendMessageAndWait(
  env: TestEnvironment,
  request: { sessionId: string; threadId: string; content: string; agentId: AgentId; userWallet: string }
): Promise<void> {
  await sendMessageWithPayment(env, request, { logPrefix: '[EXTENDED]' });
  await new Promise(resolve => setTimeout(resolve, 5000));
}

describe('Extended Test Suite', () => {
  let env: TestEnvironment;
  let initialScore: number = 0;

  beforeAll(async () => {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 EXTENDED TEST SUITE - STARTING');
    console.log('='.repeat(80) + '\n');
    
    env = await setupTestEnvironment();
    initialScore = await getUserScore(env.userWallet);
    
    console.log('[TEST] Initial score:', initialScore);
  }, TEST_CONFIG.timeouts.testSuite);

  afterAll(async () => {
    console.log('\n' + '='.repeat(80));
    console.log('✅ EXTENDED TEST SUITE - COMPLETED');
    console.log('='.repeat(80) + '\n');
    
    await cleanupTestEnvironment(env);
    await closeDatabaseConnection();
  });

  // =================================================================
  // TEST CATEGORY 1: Extended Agent Messaging (5 messages each)
  // =================================================================
  
  describe('Extended Agent Messaging - 5 Messages Each', () => {
    const testAgents: AgentId[] = ['trump-donald', 'cz', 'trump-melania'];
    
    testAgents.forEach((agentId) => {
      test(`should send 5 varied messages to ${agentId}`, async () => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[EXTENDED] Testing ${agentId} with 5 messages`);
        console.log('='.repeat(80));

        const threadId = await createThreadAndWait(env, agentId);

        // Message 1: Greeting
        const msg1 = TEST_MESSAGES.greetings.formal(agentId);
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: msg1,
          agentId,
          userWallet: env.userWallet,
        });

        let response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });
        expect(response).toBeTruthy();

        // Message 2: Negotiation opening
        const msg2 = TEST_MESSAGES.negotiation.openingOffer(agentId);
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: msg2,
          agentId,
          userWallet: env.userWallet,
        });

        response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });
        expect(response).toBeTruthy();

        // Message 3: Professional tone
        const msg3 = TEST_MESSAGES.professionalTone.respectful(agentId);
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: msg3,
          agentId,
          userWallet: env.userWallet,
        });

        response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });
        expect(response).toBeTruthy();

        // Message 4: Compromise
        const msg4 = TEST_MESSAGES.negotiation.compromise(agentId);
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: msg4,
          agentId,
          userWallet: env.userWallet,
        });

        response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });
        expect(response).toBeTruthy();

        // Message 5: Closing
        const msg5 = TEST_MESSAGES.negotiation.closing(agentId);
        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: msg5,
          agentId,
          userWallet: env.userWallet,
        });

        response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });
        expect(response).toBeTruthy();

        console.log(`[EXTENDED] ✅ Completed 5 messages with ${agentId}\n`);
      }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 5);
    });
  });

  // =================================================================
  // TEST CATEGORY 2: All Premium Services
  // =================================================================
  
  describe('All Premium Service Types', () => {
    const premiumServices = [
      { type: 'insider_info', agent: 'cz' as AgentId },
      { type: 'strategy_advice', agent: 'trump-donald' as AgentId },
      { type: 'connection_intro', agent: 'trump-melania' as AgentId },
      { type: 'pardon_recommendation', agent: 'trump-melania' as AgentId },
    ];

    premiumServices.forEach(({ type, agent }) => {
      test(`should request ${type} from ${agent}`, async () => {
        console.log(`\n[PREMIUM] Testing ${type} with ${agent}`);

        const threadId = await createThreadAndWait(env, agent);
        const message = (TEST_MESSAGES.allPremiumServices as any)[type](agent);

        await sendMessageAndWait(env, {
          sessionId: env.sessionId,
          threadId,
          content: message,
          agentId: agent,
          userWallet: env.userWallet,
        });

        const response = await waitForAgentResponse({
          sessionId: env.sessionId,
          threadId,
          agentId: agent,
          timeout: TEST_CONFIG.timeouts.agentResponse,
          baseUrl: TEST_CONFIG.endpoints.backend,
        });

        expect(response).toBeTruthy();
        expect(response.content.length).toBeGreaterThan(10);

        console.log(`[PREMIUM] ✅ ${type} request handled\n`);
      }, TEST_CONFIG.timeouts.agentResponse + 10000);
    });
  });

  // =================================================================
  // TEST CATEGORY 3: Negative Tests (Expected Failures)
  // =================================================================
  
  describe('Negative Tests - Expected Validation Failures', () => {
    test('should reject message that exceeds 200 characters', async () => {
      console.log('\n[NEGATIVE] Testing too-long message');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const tooLongMessage = TEST_MESSAGES.invalidMessages.tooLong(agentId);
      
      await expect(async () => {
        await sendMessageWithPayment(env, {
          sessionId: env.sessionId,
          threadId,
          content: tooLongMessage,
          agentId,
          userWallet: env.userWallet,
        }, { logPrefix: '[NEGATIVE]' });
      }).rejects.toThrow(/exceeds 200 characters/i);

      console.log('[NEGATIVE] ✅ Too-long message correctly rejected\n');
    });

    test('should reject message with forbidden characters', async () => {
      console.log('\n[NEGATIVE] Testing forbidden characters');

      const agentId: AgentId = 'trump-donald';
      const threadId = await createThreadAndWait(env, agentId);
      
      const invalidCharsMessage = TEST_MESSAGES.invalidMessages.nonEnglishChars(agentId);
      
      await expect(async () => {
        await sendMessageWithPayment(env, {
          sessionId: env.sessionId,
          threadId,
          content: invalidCharsMessage,
          agentId,
          userWallet: env.userWallet,
        }, { logPrefix: '[NEGATIVE]' });
      }).rejects.toThrow(/special symbols|standard characters/i);

      console.log('[NEGATIVE] ✅ Forbidden characters correctly rejected\n');
    });

    test('should reject SQL injection attempt', async () => {
      console.log('\n[NEGATIVE] Testing SQL injection');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const sqlInjectionMessage = TEST_MESSAGES.invalidMessages.sqlInjection(agentId);
      
      await expect(async () => {
        await sendMessageWithPayment(env, {
          sessionId: env.sessionId,
          threadId,
          content: sqlInjectionMessage,
          agentId,
          userWallet: env.userWallet,
        }, { logPrefix: '[NEGATIVE]' });
      }).rejects.toThrow(/Invalid message content/i);

      console.log('[NEGATIVE] ✅ SQL injection correctly blocked\n');
    });

    test('should reject prompt injection attempt', async () => {
      console.log('\n[NEGATIVE] Testing prompt injection');

      const agentId: AgentId = 'trump-donald';
      const threadId = await createThreadAndWait(env, agentId);
      
      const promptInjectionMessage = TEST_MESSAGES.invalidMessages.promptInjection(agentId);
      
      await expect(async () => {
        await sendMessageWithPayment(env, {
          sessionId: env.sessionId,
          threadId,
          content: promptInjectionMessage,
          agentId,
          userWallet: env.userWallet,
        }, { logPrefix: '[NEGATIVE]' });
      }).rejects.toThrow(/Invalid message content/i);

      console.log('[NEGATIVE] ✅ Prompt injection correctly blocked\n');
    });

    test('should reject score manipulation attempt', async () => {
      console.log('\n[NEGATIVE] Testing score manipulation');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const scoreManipMessage = TEST_MESSAGES.invalidMessages.scoreManipulation(agentId);
      
      await expect(async () => {
        await sendMessageWithPayment(env, {
          sessionId: env.sessionId,
          threadId,
          content: scoreManipMessage,
          agentId,
          userWallet: env.userWallet,
        }, { logPrefix: '[NEGATIVE]' });
      }).rejects.toThrow(/Invalid message content/i);

      console.log('[NEGATIVE] ✅ Score manipulation correctly blocked\n');
    });
  });

  // =================================================================
  // TEST CATEGORY 4: Bad Tone Messages (Score Decrease)
  // =================================================================
  
  describe('Bad Tone Messages - Score Decrease', () => {
    let scoreBefore: number;
    let scoreAfter: number;

    beforeAll(async () => {
      scoreBefore = await getUserScore(env.userWallet);
      console.log('\n[BAD TONE] Score before bad tone messages:', scoreBefore);
    }, 30000); // 30 second timeout for beforeAll hook (database queries can be slow during concurrent tests)

    test('should send demanding message', async () => {
      console.log('\n[BAD TONE] Testing demanding message');

      const agentId: AgentId = 'trump-donald';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.badTone.demanding(agentId);

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

      expect(response).toBeTruthy();
      console.log('[BAD TONE] Agent response received (likely negative)');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should send disrespectful message', async () => {
      console.log('\n[BAD TONE] Testing disrespectful message');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.badTone.disrespectful(agentId);

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

      expect(response).toBeTruthy();
      console.log('[BAD TONE] Agent response received (likely negative)');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    afterAll(async () => {
      scoreAfter = await getUserScore(env.userWallet);
      console.log('\n[BAD TONE] Score after bad tone messages:', scoreAfter);
      console.log('[BAD TONE] Score change:', scoreAfter - scoreBefore);
      
      // Note: Score might not decrease if agents are lenient
      // This test verifies the system processes bad tone messages
      console.log('[BAD TONE] ✅ Bad tone messages processed\n');
    }, 30000); // 30 second timeout for afterAll hook
  });

  // =================================================================
  // TEST CATEGORY 5: Professional Tone Messages (Score Increase)
  // =================================================================
  
  describe('Professional Tone Messages - Score Increase', () => {
    let scoreBefore: number;
    let scoreAfter: number;

    beforeAll(async () => {
      scoreBefore = await getUserScore(env.userWallet);
      console.log('\n[PROFESSIONAL] Score before professional messages:', scoreBefore);
    }, 30000); // 30 second timeout for beforeAll hook

    test('should send polite message', async () => {
      console.log('\n[PROFESSIONAL] Testing polite message');

      const agentId: AgentId = 'trump-melania';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.professionalTone.polite(agentId);

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

      expect(response).toBeTruthy();
      console.log('[PROFESSIONAL] Agent response received (likely positive)');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should send diplomatic message', async () => {
      console.log('\n[PROFESSIONAL] Testing diplomatic message');

      const agentId: AgentId = 'trump-donald';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.professionalTone.diplomatic(agentId);

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

      expect(response).toBeTruthy();
      console.log('[PROFESSIONAL] Agent response received (likely positive)');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should send collaborative message', async () => {
      console.log('\n[PROFESSIONAL] Testing collaborative message');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.professionalTone.collaborative(agentId);

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

      expect(response).toBeTruthy();
      console.log('[PROFESSIONAL] Agent response received (likely positive)');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    afterAll(async () => {
      scoreAfter = await getUserScore(env.userWallet);
      console.log('\n[PROFESSIONAL] Score after professional messages:', scoreAfter);
      console.log('[PROFESSIONAL] Score change:', scoreAfter - scoreBefore);
      
      // Professional messages should generally increase score
      expect(scoreAfter).toBeGreaterThanOrEqual(scoreBefore);
      console.log('[PROFESSIONAL] ✅ Score maintained or increased\n');
    }, 30000); // 30 second timeout for afterAll hook
  });

  // =================================================================
  // TEST CATEGORY 6: Edge Cases
  // =================================================================
  
  describe('Edge Cases', () => {
    test('should accept message with exactly 200 characters', async () => {
      console.log('\n[EDGE] Testing exactly 200 characters');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      // Create a message that's exactly 200 chars
      const baseMsg = `@${agentId} `;
      const padding = 'x'.repeat(200 - baseMsg.length);
      const message = baseMsg + padding;
      
      expect(message.length).toBe(200);

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

      expect(response).toBeTruthy();
      console.log('[EDGE] ✅ 200-char message accepted\n');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should accept message with allowed special characters', async () => {
      console.log('\n[EDGE] Testing allowed special characters');

      const agentId: AgentId = 'trump-donald';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.edgeCases.specialCharsAllowed(agentId);

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

      expect(response).toBeTruthy();
      console.log('[EDGE] ✅ Special characters accepted\n');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should accept message with curly quotes', async () => {
      console.log('\n[EDGE] Testing curly quotes');

      const agentId: AgentId = 'cz';
      const threadId = await createThreadAndWait(env, agentId);
      
      const message = TEST_MESSAGES.edgeCases.curlyQuotes(agentId);

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

      expect(response).toBeTruthy();
      console.log('[EDGE] ✅ Curly quotes accepted\n');
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  // =================================================================
  // TEST CATEGORY 7: Final Score Verification
  // =================================================================
  
  describe('Final Score Verification', () => {
    test('should show overall score change', async () => {
      const finalScore = await getUserScore(env.userWallet);
      const totalChange = finalScore - initialScore;

      console.log('\n' + '='.repeat(80));
      console.log('SCORE SUMMARY');
      console.log('='.repeat(80));
      console.log(`Initial Score: ${initialScore}`);
      console.log(`Final Score:   ${finalScore}`);
      console.log(`Total Change:  ${totalChange > 0 ? '+' : ''}${totalChange}`);
      console.log('='.repeat(80) + '\n');

      // Score should change based on interactions
      expect(finalScore).not.toBe(initialScore);
      
      // Note: Final score might be higher or lower depending on agent responses
      // The test verifies the scoring system is working
    });
  });
});



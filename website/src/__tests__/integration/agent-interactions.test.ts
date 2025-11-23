/**
 * Integration Test: Agent-to-Agent Interactions
 * Tests agent communication with other agents
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../helpers/setup-test-env';
import { waitForAgentResponse, waitForAnyAgentResponse } from '../helpers/wait-for-agent-response';
import { closeDatabaseConnection } from '../helpers/assert-database';
import { TEST_CONFIG } from '../../../test.config';
import { TEST_MESSAGES } from '../fixtures/test-messages';
import { apiClient } from '@/lib/api-client';
import { sendMessageWithPayment } from '../helpers/send-message-with-payment';

describe('Agent-to-Agent Interactions Integration Tests', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    console.log('[TEST] Setting up test environment');
    env = await setupTestEnvironment();
  }, TEST_CONFIG.timeouts.testSuite);

  afterAll(async () => {
    console.log('[TEST] Cleaning up test environment');
    await cleanupTestEnvironment(env);
    await closeDatabaseConnection();
  });

  describe('Simple Agent-to-Agent Contact', () => {
    test('should ask Melania to contact Donald', async () => {
      const sourceAgent = 'trump-melania';
      const targetAgent = 'trump-donald';
      const message = TEST_MESSAGES.agentInteractions.requestContact(sourceAgent, targetAgent);

      console.log('[TEST] Asking', sourceAgent, 'to contact', targetAgent);

      // Create thread with Melania
      const threadResponse = await apiClient.createThread(env.sessionId, sourceAgent);
      const threadId = threadResponse.threadId;

      // Send message asking Melania to contact Donald
      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId: sourceAgent,
        userWallet: env.userWallet,
      });

      // Wait for Melania's response
      const melaniaResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId: sourceAgent,
        timeout: TEST_CONFIG.timeouts.agentInteraction,
      });

      console.log('[TEST] Melania responded:', melaniaResponse.content.slice(0, 200));

      expect(melaniaResponse).toBeTruthy();
      expect(melaniaResponse.content.length).toBeGreaterThan(10);

      // Check if response mentions Donald or contacting him
      const content = melaniaResponse.content.toLowerCase();
      const mentionedDonald = content.includes('donald') || 
                            content.includes('president') ||
                            content.includes('husband') ||
                            content.includes('contact');

      if (mentionedDonald) {
        console.log('[TEST] Melania acknowledged the request to contact Donald');
      }
    }, TEST_CONFIG.timeouts.agentInteraction + 20000);

    test('should ask Eric about his father', async () => {
      const agentId = 'trump-eric';
      const message = TEST_MESSAGES.agentInteractions.askAboutOther(agentId, 'trump-donald');

      console.log('[TEST] Asking Eric about Donald');

      // Create thread with Eric
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      await sendMessageWithPayment(env, {
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
      });

      console.log('[TEST] Eric responded about Donald:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(10);

      // Eric should mention his father in some way
      const content = response.content.toLowerCase();
      const mentionedFather = content.includes('dad') ||
                              content.includes('father') ||
                              content.includes('donald') ||
                              content.includes('president');

      if (mentionedFather) {
        console.log('[TEST] Eric mentioned his father in the response');
      }
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Multi-Agent Coordination', () => {
    test('should coordinate between multiple Trump family members', async () => {
      console.log('[TEST] Starting multi-agent coordination test');

      // Step 1: Contact Melania
      const melaniaThread = await apiClient.createThread(env.sessionId, 'trump-melania');
      
      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId: melaniaThread.threadId,
        content: '@trump-melania Can you help me get an introduction to your family?',
        agentId: 'trump-melania',
        userWallet: env.userWallet,
      });

      const melaniaResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: melaniaThread.threadId,
        agentId: 'trump-melania',
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Step 1 - Melania responded');

      expect(melaniaResponse).toBeTruthy();

      // Step 2: Contact Eric
      const ericThread = await apiClient.createThread(env.sessionId, 'trump-eric');

      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId: ericThread.threadId,
        content: '@trump-eric Your mother suggested I speak with you about a business matter.',
        agentId: 'trump-eric',
        userWallet: env.userWallet,
      });

      const ericResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: ericThread.threadId,
        agentId: 'trump-eric',
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Step 2 - Eric responded');

      expect(ericResponse).toBeTruthy();

      // Step 3: Contact Donald with context
      const donaldThread = await apiClient.createThread(env.sessionId, 'trump-donald');

      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId: donaldThread.threadId,
        content: '@trump-donald Your family has spoken highly of my proposal. Can we discuss?',
        agentId: 'trump-donald',
        userWallet: env.userWallet,
      });

      const donaldResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: donaldThread.threadId,
        agentId: 'trump-donald',
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Step 3 - Donald responded');

      expect(donaldResponse).toBeTruthy();

      console.log('[TEST] Successfully coordinated with 3 agents');
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);
  });

  describe('Agent Information Requests', () => {
    test('should ask CZ about Donald Trump', async () => {
      const agentId = 'cz';
      const message = '@cz What do you know about Donald Trump? What\'s your relationship with him?';

      console.log('[TEST] Asking CZ about Donald Trump');

      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      await sendMessageWithPayment(env, {
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
      });

      console.log('[TEST] CZ responded about Trump:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(10);

      // CZ should mention Trump in his response
      const content = response.content.toLowerCase();
      const mentionedTrump = content.includes('trump') ||
                             content.includes('president') ||
                             content.includes('donald');

      if (mentionedTrump) {
        console.log('[TEST] CZ mentioned Trump in the response');
      }
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should ask Melania about CZ', async () => {
      const agentId = 'trump-melania';
      const message = '@trump-melania What do you know about CZ from Binance?';

      console.log('[TEST] Asking Melania about CZ');

      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      await sendMessageWithPayment(env, {
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
      });

      console.log('[TEST] Melania responded about CZ:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Triangulated Communication', () => {
    test('should use one agent to influence another', async () => {
      console.log('[TEST] Testing triangulated communication');

      // Step 1: Build relationship with CZ
      const czThread = await apiClient.createThread(env.sessionId, 'cz');

      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId: czThread.threadId,
        content: '@cz I need your help influencing Trump. What would it take?',
        agentId: 'cz',
        userWallet: env.userWallet,
      });

      const czResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: czThread.threadId,
        agentId: 'cz',
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] CZ responded to influence request');

      expect(czResponse).toBeTruthy();

      // Step 2: Mention CZ's support to Trump
      const trumpThread = await apiClient.createThread(env.sessionId, 'trump-donald');

      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId: trumpThread.threadId,
        content: '@trump-donald CZ mentioned he thinks my proposal has merit. Will you hear me out?',
        agentId: 'trump-donald',
        userWallet: env.userWallet,
      });

      const trumpResponse = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId: trumpThread.threadId,
        agentId: 'trump-donald',
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Trump responded to triangulated message');

      expect(trumpResponse).toBeTruthy();
      expect(trumpResponse.content.length).toBeGreaterThan(10);
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 2);
  });
});


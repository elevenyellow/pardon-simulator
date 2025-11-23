/**
 * Integration Test: Message Flow
 * Tests basic message sending and agent responses
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../helpers/setup-test-env';
import { waitForAgentResponse } from '../helpers/wait-for-agent-response';
import { sendMessageWithPayment } from '../helpers/send-message-with-payment';
import { assertMessageExists, closeDatabaseConnection } from '../helpers/assert-database';
import { TEST_CONFIG } from '../../../test.config';
import { TEST_MESSAGES, ALL_AGENT_IDS } from '../fixtures/test-messages';
import { apiClient } from '@/lib/api-client';

describe('Message Flow Integration Tests', () => {
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

  describe('Basic Message Sending', () => {
    test('should create session and thread', async () => {
      expect(env.sessionId).toBeTruthy();
      expect(env.userWallet).toBeTruthy();
      
      console.log('[TEST] Session ID:', env.sessionId);
      console.log('[TEST] User wallet:', env.userWallet);
    });

    test('should send message to trump-donald and receive response', async () => {
      const agentId = 'trump-donald';
      const message = TEST_MESSAGES.trump.dealProposal;

      console.log('[TEST] Sending message to', agentId);

      // Create thread if needed
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      env.threadId = threadId;
      console.log('[TEST] Thread ID:', threadId);

      // Send message
      const sendResponse = await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      });

      console.log('[TEST] Message sent, waiting for response...');

      // Wait for agent response
      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Received response from', agentId);
      console.log('[TEST] Response preview:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.senderId).toBe(agentId);
      expect(response.isAgent).toBe(true);
      expect(response.content.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeouts.agentResponse + 10000);

    test('should send message to cz and receive response', async () => {
      const agentId = 'cz';
      const message = TEST_MESSAGES.cz.marketInsight;

      console.log('[TEST] Sending message to', agentId);

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      // Send message
      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      });

      // Wait for response
      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Received response from', agentId);

      expect(response).toBeTruthy();
      expect(response.senderId).toBe(agentId);
      expect(response.content.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Multi-Message Conversations', () => {
    test('should handle 3-message conversation with trump-donald', async () => {
      const agentId = 'trump-donald';
      const messages = [
        '@trump-donald Hello Mr. President',
        '@trump-donald I have a business proposition',
        '@trump-donald What do you think about crypto?',
      ];

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      for (let i = 0; i < messages.length; i++) {
        console.log(`[TEST] Sending message ${i + 1}/${messages.length} to ${agentId}`);

        await sendMessageWithPayment(env, {
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
        });

        console.log(`[TEST] Received response ${i + 1}/${messages.length}`);

        expect(response).toBeTruthy();
        expect(response.content.length).toBeGreaterThan(5);
      }
    }, (TEST_CONFIG.timeouts.agentResponse + 10000) * 3);
  });

  describe('Message Mentions', () => {
    test('should correctly parse @ mentions', async () => {
      const agentId = 'trump-melania';
      const message = '@trump-melania Can you help me?';

      // Create thread
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

      expect(response).toBeTruthy();
      expect(response.mentions).toContain('sbf'); // Agent should mention user back
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });
});


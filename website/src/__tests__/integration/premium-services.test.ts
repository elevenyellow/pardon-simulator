/**
 * Integration Test: Premium Services
 * Tests premium service requests, payments, and service delivery
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { setupTestEnvironment, cleanupTestEnvironment, type TestEnvironment } from '../helpers/setup-test-env';
import { waitForAgentResponse, waitForResponseContaining } from '../helpers/wait-for-agent-response';
import { verifyPaymentViaBackend, waitForPaymentConfirmation } from '../helpers/verify-payment';
import { assertPaymentExists, closeDatabaseConnection } from '../helpers/assert-database';
import { TEST_CONFIG } from '../../../test.config';
import { TEST_MESSAGES } from '../fixtures/test-messages';
import { apiClient } from '@/lib/api-client';
import { sendMessageWithPayment } from '../helpers/send-message-with-payment';

function extractPaymentRequest(content: string): any | null {
  const match = content.match(/<x402_payment_request>([\s\S]*?)<\/x402_payment_request>/);
  if (!match) return null;

  let jsonStr = match[1].trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn('[TEST] Failed to parse payment request JSON', error);
    return null;
  }
}

describe('Premium Services Integration Tests', () => {
  let env: TestEnvironment;
  let connection: Connection;

  beforeAll(async () => {
    console.log('[TEST] Setting up test environment');
    env = await setupTestEnvironment();
    connection = new Connection(TEST_CONFIG.endpoints.rpc, 'confirmed');
  }, TEST_CONFIG.timeouts.testSuite);

  afterAll(async () => {
    console.log('[TEST] Cleaning up test environment');
    await cleanupTestEnvironment(env);
    await closeDatabaseConnection();
  });

  describe('Premium Service Request Flow', () => {
    test('should request insider_info service and receive 402 payment required', async () => {
      const agentId = 'cz';
      const message = TEST_MESSAGES.premiumServices.insiderInfo(agentId);

      console.log('[TEST] Requesting premium service from', agentId);

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      // Send message requesting service (handles message fee payment automatically)
      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      }, { logPrefix: '[PremiumService]' });

      // Wait for agent to respond with payment instructions
      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Received premium service response:', response.content.slice(0, 200));

      const paymentRequest = extractPaymentRequest(response.content);
      expect(paymentRequest).toBeTruthy();

      const amountUsdc =
        paymentRequest.amount_usdc ??
        (paymentRequest.amount?.currency === 'USDC'
          ? parseFloat(paymentRequest.amount.value) / Math.pow(10, paymentRequest.amount.decimals || 6)
          : undefined);

      expect(amountUsdc).toBe(TEST_CONFIG.amounts.insider_info);
      expect(paymentRequest.service_type || paymentRequest.serviceType).toBe('insider_info');
      expect(paymentRequest.recipient_address || paymentRequest.recipient?.address).toBeTruthy();
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Payment and Service Delivery', () => {
    test.skip('should pay for service and receive delivery (requires funded wallet)', async () => {
      // This test is skipped by default as it requires a funded test wallet
      // To run: ensure TEST_WALLET_PRIVATE_KEY is set and wallet has USDC
      
      const agentId = 'cz';
      const serviceType = 'insider_info';
      const amount = TEST_CONFIG.amounts.insider_info;

      console.log('[TEST] Full payment flow test');

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      // Request service
      const message = TEST_MESSAGES.premiumServices.insiderInfo(agentId);
      const sendResponse = await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      }, { logPrefix: '[PremiumService] Pay+Deliver' });

      // Check if payment required
      if (!sendResponse.paymentRequired) {
        console.log('[TEST] No payment required, skipping payment flow');
        return;
      }

      const paymentRequest = sendResponse.paymentRequired;
      console.log('[TEST] Payment request:', paymentRequest);

      // Create and sign payment transaction
      // Note: In real test, this would use the x402 facilitator endpoint
      // For now, we'll simulate the payment flow
      
      console.log('[TEST] Creating payment transaction...');
      
      // Call backend x402 endpoint to submit payment
      const paymentResponse = await fetch(`${TEST_CONFIG.endpoints.backend}/api/x402/submit-solana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentPayload: {
            // This would be the signed x402 payment payload
            // Generated using test wallet
          },
          paymentRequirements: {
            pay_to: paymentRequest.recipient_address,
            amount_usdc: amount,
            network: 'solana',
          },
        }),
      });

      if (!paymentResponse.ok) {
        console.error('[TEST] Payment submission failed');
        return;
      }

      const paymentResult = await paymentResponse.json();
      console.log('[TEST] Payment result:', paymentResult);

      expect(paymentResult.success).toBe(true);
      expect(paymentResult.transaction).toBeTruthy();

      const signature = paymentResult.transaction;

      // Wait for payment confirmation
      const confirmed = await waitForPaymentConfirmation(signature, TEST_CONFIG.timeouts.paymentConfirmation);
      expect(confirmed).toBe(true);

      // Send payment confirmation to agent
      const confirmMessage = TEST_MESSAGES.payments.paymentProof(agentId, signature);
      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: confirmMessage,
        agentId,
        userWallet: env.userWallet,
      }, { logPrefix: '[PremiumService] PaymentProof' });

      // Wait for service delivery
      const serviceResponse = await waitForResponseContaining({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.serviceDelivery,
      }, 'insider');

      console.log('[TEST] Service delivered:', serviceResponse.content.slice(0, 200));

      expect(serviceResponse).toBeTruthy();
      expect(serviceResponse.content.length).toBeGreaterThan(50);

      // Verify payment is in database
      const paymentInDb = await assertPaymentExists(signature);
      expect(paymentInDb).toBe(true);
    }, TEST_CONFIG.timeouts.serviceDelivery + 20000);
  });

  describe('Variable Amount Services', () => {
    test('should request donation with custom amount', async () => {
      const agentId = 'trump-donald';
      const amount = 0.01; // 0.01 USDC donation
      const message = TEST_MESSAGES.premiumServices.donation(agentId, amount);

      console.log('[TEST] Requesting donation service with custom amount');

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      // Send message
      const sendResponse = await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      }, { logPrefix: '[PremiumService] Donation' });

      // Agent should acknowledge or request payment
      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Response to donation request:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });

  describe('Service Error Handling', () => {
    test('should handle unknown service type gracefully', async () => {
      const agentId = 'cz';
      const message = `@${agentId} I'd like to purchase the "nonexistent_service" please`;

      // Create thread
      const threadResponse = await apiClient.createThread(env.sessionId, agentId);
      const threadId = threadResponse.threadId;

      await sendMessageWithPayment(env, {
        sessionId: env.sessionId,
        threadId,
        content: message,
        agentId,
        userWallet: env.userWallet,
      }, { logPrefix: '[PremiumService] Unknown Service' });

      const response = await waitForAgentResponse({
        sessionId: env.sessionId,
        threadId,
        agentId,
        timeout: TEST_CONFIG.timeouts.agentResponse,
      });

      console.log('[TEST] Response to unknown service:', response.content.slice(0, 200));

      expect(response).toBeTruthy();
      // Agent should explain the service doesn't exist or list available services
      expect(response.content.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeouts.agentResponse + 10000);
  });
});


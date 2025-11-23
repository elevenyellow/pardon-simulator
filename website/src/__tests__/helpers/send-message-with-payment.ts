import type { SendMessageRequest, SendMessageResponse } from '@/lib/api-client';
import type { TestEnvironment } from './setup-test-env';
import { submitPayment, waitForPaymentConfirmation } from './submit-payment';
import { TEST_CONFIG } from '../../../test.config';

export interface SendWithPaymentOptions {
  logPrefix?: string;
  paymentDescription?: string;
  maxRetries?: number;
}

/**
 * Send a message while automatically handling required payments.
 * Mirrors the browser flow:
 *   1. POST /api/chat/send (expect 402)
 *   2. Create + sign USDC transaction
 *   3. Retry /api/chat/send with X-PAYMENT header
 */
export async function sendMessageWithPayment(
  env: TestEnvironment,
  request: SendMessageRequest,
  options: SendWithPaymentOptions = {}
): Promise<SendMessageResponse> {
  const {
    logPrefix = '[PaymentHelper]',
    paymentDescription = 'message fee',
    maxRetries = 2,
  } = options;

  const requestWithWallet: SendMessageRequest = {
    ...request,
    userWallet: request.userWallet || env.userWallet,
  };

  let attempts = 0;
  let response = await env.apiClient.sendMessage(requestWithWallet);
  attempts++;

  while (response.paymentRequired) {
    if (attempts >= maxRetries) {
      throw new Error(`${logPrefix} Too many payment retries (${attempts}).`);
    }

    console.log(`${logPrefix} 💳 Payment required (${paymentDescription}):`, {
      amount: response.paymentRequired.amount_usdc,
      paymentId: response.paymentRequired.payment_id,
      agentId: request.agentId,
    });

    const paymentResult = await submitPayment(
      response.paymentRequired,
      env.testWallet,
      TEST_CONFIG.endpoints.backend
    );

    if (!paymentResult.success || !paymentResult.x402Payload) {
      throw new Error(`${logPrefix} Payment submission failed: ${paymentResult.error}`);
    }

    console.log(`${logPrefix} ✅ Payment signed, retrying with X-PAYMENT header`);

    response = await env.apiClient.sendMessage(requestWithWallet, {
      paymentPayload: paymentResult.x402Payload,
      logContext: { retry: attempts },
    });
    attempts++;
  }

  if (!response.success) {
    throw new Error(`${logPrefix} Message send failed: ${response.error || 'unknown error'}`);
  }

  if (response.paymentSettlement?.transaction) {
    console.log(`${logPrefix} Settled on-chain tx: ${response.paymentSettlement.transaction}`);
    const confirmed = await waitForPaymentConfirmation(
      response.paymentSettlement.transaction,
      TEST_CONFIG.timeouts.paymentConfirmation
    );

    if (!confirmed) {
      console.warn(`${logPrefix} Payment confirmation timed out`, {
        signature: response.paymentSettlement.transaction,
      });
    }
  }

  return response;
}


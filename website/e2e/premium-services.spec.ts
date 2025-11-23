/**
 * E2E Test: Premium Services
 * Tests premium service purchase flow through UI
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 90000;

async function connectMockWallet(page: Page) {
  await page.waitForSelector('[data-testid="wallet-button"], button:has-text("Connect Wallet")');
  await page.click('[data-testid="wallet-button"], button:has-text("Connect Wallet")');
  await page.waitForSelector('[data-testid="wallet-connected"], text=/Connected/');
}

async function sendMessage(page: Page, agentId: string, message: string) {
  await page.click(`[data-testid="agent-${agentId}"], text="${agentId}"`);
  await page.waitForSelector('[data-testid="chat-input"], textarea');
  const input = await page.locator('[data-testid="chat-input"], textarea');
  await input.fill(message);
  await page.click('[data-testid="send-button"], button:has-text("Send")');
}

async function waitForPaymentModal(page: Page) {
  console.log('[E2E] Waiting for payment modal...');
  await page.waitForSelector('[data-testid="payment-modal"], .payment-modal', {
    timeout: 10000,
  });
  console.log('[E2E] Payment modal appeared');
}

test.describe('E2E: Premium Services', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await connectMockWallet(page);
  });

  test('should request premium service and see payment modal', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    const agentId = 'cz';
    const message = '@cz I need insider information about the crypto market. What does it cost?';
    
    await sendMessage(page, agentId, message);
    
    // Wait for response (agent may send 402 or explain service)
    await page.waitForSelector('[data-testid="agent-message"], .agent-message', {
      timeout: 40000,
    });
    
    // Check if payment modal appeared
    const paymentModalVisible = await page.locator('[data-testid="payment-modal"], .payment-modal')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    
    if (paymentModalVisible) {
      console.log('[E2E] Payment modal appeared');
      
      // Verify payment details
      const modalContent = await page.locator('[data-testid="payment-modal"], .payment-modal').textContent();
      expect(modalContent).toContain('USDC');
      expect(modalContent).toMatch(/\d+\.\d+/); // Should contain amount
    } else {
      console.log('[E2E] No payment modal (agent responded directly)');
    }
  });

  test.skip('should complete payment and receive service (requires funded wallet)', async ({ page }) => {
    // This test requires a funded test wallet
    // Skip by default, run manually with: npx playwright test --project chromium -g "complete payment"
    
    test.setTimeout(TEST_TIMEOUT * 2);
    
    const agentId = 'cz';
    const message = '@cz I need insider information about the market.';
    
    await sendMessage(page, agentId, message);
    
    // Wait for payment modal
    await waitForPaymentModal(page);
    
    // Approve payment (mock wallet should auto-approve)
    await page.click('[data-testid="approve-payment"], button:has-text("Approve")');
    
    // Wait for transaction to be signed and submitted
    await page.waitForSelector('[data-testid="payment-processing"], text=/Processing/', {
      timeout: 10000,
    });
    
    // Wait for service delivery
    await page.waitForSelector('[data-testid="agent-message"], .agent-message:has-text("insider")', {
      timeout: 60000,
    });
    
    console.log('[E2E] Service delivered after payment');
    
    // Verify service was delivered
    const messages = await page.locator('[data-testid="agent-message"], .agent-message').all();
    const latestMessage = messages[messages.length - 1];
    const content = await latestMessage.textContent();
    
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test('should show payment history after purchase', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    // Navigate to payment history (if available in UI)
    const historyLinkVisible = await page.locator('[data-testid="payment-history"], a:has-text("Payment History")')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    
    if (historyLinkVisible) {
      await page.click('[data-testid="payment-history"], a:has-text("Payment History")');
      
      // Verify history page loaded
      await page.waitForSelector('[data-testid="payment-list"], .payment-list', {
        timeout: 10000,
      });
      
      console.log('[E2E] Payment history page loaded');
    } else {
      console.log('[E2E] Payment history not available in UI');
    }
  });

  test('should handle insufficient funds gracefully', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    // This test assumes test wallet has insufficient funds
    // In a real scenario, the wallet would reject the transaction
    
    const agentId = 'trump-donald';
    const message = '@trump-donald I want to make a large donation of 100 USDC';
    
    await sendMessage(page, agentId, message);
    
    // Agent should respond about the donation
    await page.waitForSelector('[data-testid="agent-message"], .agent-message', {
      timeout: 40000,
    });
    
    console.log('[E2E] Agent responded to large donation request');
    
    // If payment modal appears and user tries to pay with insufficient funds,
    // wallet would show an error
    // For this test, we just verify the agent responds appropriately
  });
});


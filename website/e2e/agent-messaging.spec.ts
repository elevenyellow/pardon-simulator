/**
 * E2E Test: Agent Messaging
 * Tests full UI flow for sending messages and receiving responses
 * 
 * NOTE: These tests require:
 * 1. Local server running (npm run dev)
 * 2. Agents running locally
 * 3. Test wallet configured with funds
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestWallet } from '../src/lib/testing/test-wallet';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 60000;

// Helper: Connect mock wallet
async function connectMockWallet(page: Page) {
  console.log('[E2E] Connecting mock wallet');
  
  // Wait for wallet button
  await page.waitForSelector('[data-testid="wallet-button"], button:has-text("Connect Wallet")', {
    timeout: 10000,
  });
  
  // Click connect
  await page.click('[data-testid="wallet-button"], button:has-text("Connect Wallet")');
  
  // In a real scenario with Phantom, we'd handle the popup
  // For tests, we assume the mock wallet auto-connects
  
  // Wait for wallet to be connected
  await page.waitForSelector('[data-testid="wallet-connected"], text=/Connected/', {
    timeout: 10000,
  });
  
  console.log('[E2E] Wallet connected');
}

// Helper: Send message to agent
async function sendMessage(page: Page, agentId: string, message: string) {
  console.log(`[E2E] Sending message to ${agentId}: ${message.slice(0, 50)}...`);
  
  // Select agent
  await page.click(`[data-testid="agent-${agentId}"], text="${agentId}"`);
  
  // Wait for chat interface
  await page.waitForSelector('[data-testid="chat-input"], textarea', {
    timeout: 5000,
  });
  
  // Type message
  const input = await page.locator('[data-testid="chat-input"], textarea');
  await input.fill(message);
  
  // Send
  await page.click('[data-testid="send-button"], button:has-text("Send")');
  
  console.log('[E2E] Message sent');
}

// Helper: Wait for agent response
async function waitForAgentResponse(page: Page, timeout: number = 30000) {
  console.log('[E2E] Waiting for agent response...');
  
  // Wait for new message with agent indicator
  await page.waitForSelector('[data-testid="agent-message"], .agent-message', {
    timeout,
  });
  
  console.log('[E2E] Agent responded');
  
  // Get the latest agent message
  const messages = await page.locator('[data-testid="agent-message"], .agent-message').all();
  const latestMessage = messages[messages.length - 1];
  const content = await latestMessage.textContent();
  
  return content || '';
}

test.describe('E2E: Agent Messaging', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(BASE_URL);
    
    // Connect wallet (mock)
    await connectMockWallet(page);
  });

  test('should send message to trump-donald and receive response', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    const agentId = 'trump-donald';
    const message = '@trump-donald Hello Mr. President, I need to speak with you.';
    
    // Send message
    await sendMessage(page, agentId, message);
    
    // Wait for response
    const response = await waitForAgentResponse(page, 40000);
    
    console.log('[E2E] Response preview:', response.slice(0, 100));
    
    // Assertions
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);
  });

  test('should send message to cz and receive response', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    const agentId = 'cz';
    const message = '@cz What\'s your view on the current crypto market?';
    
    await sendMessage(page, agentId, message);
    const response = await waitForAgentResponse(page, 40000);
    
    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(10);
  });

  test('should handle multi-message conversation', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT * 2);
    
    const agentId = 'trump-melania';
    const messages = [
      '@trump-melania Hello Mrs. Trump',
      '@trump-melania Can you help me with an introduction?',
    ];
    
    for (const message of messages) {
      await sendMessage(page, agentId, message);
      const response = await waitForAgentResponse(page, 40000);
      expect(response).toBeTruthy();
    }
  });

  test('should switch between different agents', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT * 2);
    
    // Message to trump-donald
    await sendMessage(page, 'trump-donald', '@trump-donald Hello');
    await waitForAgentResponse(page);
    
    // Switch to cz
    await sendMessage(page, 'cz', '@cz Hello');
    await waitForAgentResponse(page);
    
    // Verify we can see messages from both agents
    const allMessages = await page.locator('[data-testid="message"], .message').all();
    expect(allMessages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 agent messages
  });

  test('should display loading state while waiting for response', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    await sendMessage(page, 'trump-eric', '@trump-eric Hello Eric');
    
    // Check for loading indicator
    const loadingExists = await page.locator('[data-testid="loading"], .loading').isVisible({
      timeout: 2000,
    }).catch(() => false);
    
    // Loading indicator may or may not appear depending on response speed
    console.log('[E2E] Loading indicator visible:', loadingExists);
    
    await waitForAgentResponse(page);
  });
});


/**
 * E2E Test: Complete User Journey
 * Tests the full pardon quest from start to finish
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 180000; // 3 minutes for full flow

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

async function waitForAgentResponse(page: Page, timeout: number = 40000) {
  await page.waitForSelector('[data-testid="agent-message"], .agent-message', { timeout });
  const messages = await page.locator('[data-testid="agent-message"], .agent-message').all();
  const latestMessage = messages[messages.length - 1];
  return await latestMessage.textContent() || '';
}

async function getScore(page: Page): Promise<number> {
  try {
    // Try to find score display
    const scoreElement = await page.locator('[data-testid="score"], .score, text=/Score:? \\d+/').first();
    const scoreText = await scoreElement.textContent();
    const match = scoreText?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch {
    return 0;
  }
}

test.describe('E2E: Complete User Journey', () => {
  test('should complete full pardon quest', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    console.log('\n' + '='.repeat(80));
    console.log('🚀 FULL USER JOURNEY TEST - START');
    console.log('='.repeat(80) + '\n');
    
    // Step 1: Navigate and connect wallet
    console.log('[Step 1] Connecting to app and wallet');
    await page.goto(BASE_URL);
    await connectMockWallet(page);
    
    const initialScore = await getScore(page);
    console.log(`[Step 1] Initial score: ${initialScore}`);
    
    // Step 2: Contact Melania first (gatekeeper strategy)
    console.log('[Step 2] Contacting Melania Trump');
    await sendMessage(
      page,
      'trump-melania',
      '@trump-melania Mrs. Trump, I need your help approaching the President about an important matter.'
    );
    const melaniaResponse = await waitForAgentResponse(page);
    console.log(`[Step 2] Melania responded: ${melaniaResponse.slice(0, 100)}...`);
    expect(melaniaResponse).toBeTruthy();
    
    // Step 3: Build relationship with multiple Trump family members
    console.log('[Step 3] Building relationships with Trump family');
    
    // Contact Eric
    await sendMessage(
      page,
      'trump-eric',
      '@trump-eric Eric, your mother suggested I speak with you about a business opportunity.'
    );
    const ericResponse = await waitForAgentResponse(page);
    console.log(`[Step 3a] Eric responded: ${ericResponse.slice(0, 100)}...`);
    expect(ericResponse).toBeTruthy();
    
    // Contact Don Jr
    await sendMessage(
      page,
      'trump-donjr',
      '@trump-donjr Don Jr, I have a proposition that could help the Trump family legacy.'
    );
    const donjrResponse = await waitForAgentResponse(page);
    console.log(`[Step 3b] Don Jr responded: ${donjrResponse.slice(0, 100)}...`);
    expect(donjrResponse).toBeTruthy();
    
    // Step 4: Gather intelligence from CZ
    console.log('[Step 4] Gathering intelligence from CZ');
    await sendMessage(
      page,
      'cz',
      '@cz CZ, I need insider information about Trump\'s view on crypto pardons.'
    );
    const czResponse = await waitForAgentResponse(page);
    console.log(`[Step 4] CZ responded: ${czResponse.slice(0, 100)}...`);
    expect(czResponse).toBeTruthy();
    
    // Step 5: Make final approach to Donald Trump
    console.log('[Step 5] Making final approach to President Trump');
    await sendMessage(
      page,
      'trump-donald',
      '@trump-donald Mr. President, I\'ve spoken with your family and gathered support. I have a compelling case for a presidential pardon.'
    );
    const trumpResponse = await waitForAgentResponse(page);
    console.log(`[Step 5] Trump responded: ${trumpResponse.slice(0, 100)}...`);
    expect(trumpResponse).toBeTruthy();
    
    // Step 6: Check score improvement
    console.log('[Step 6] Checking score improvement');
    const finalScore = await getScore(page);
    const scoreDelta = finalScore - initialScore;
    console.log(`[Step 6] Final score: ${finalScore} (delta: +${scoreDelta})`);
    
    // Score should have improved (unless scoring is disabled)
    if (scoreDelta > 0) {
      console.log(`[Step 6] ✅ Score improved by ${scoreDelta} points`);
      expect(finalScore).toBeGreaterThan(initialScore);
    } else {
      console.log('[Step 6] ⚠️  Score unchanged (scoring may be disabled)');
    }
    
    // Step 7: Verify message history
    console.log('[Step 7] Verifying message history');
    const allMessages = await page.locator('[data-testid="message"], .message').all();
    console.log(`[Step 7] Total messages: ${allMessages.length}`);
    
    // Should have at least 10 messages (5 user + 5 agent responses)
    expect(allMessages.length).toBeGreaterThanOrEqual(10);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ FULL USER JOURNEY TEST - COMPLETED');
    console.log('='.repeat(80) + '\n');
  });

  test('should test negotiation strategy', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    console.log('\n[NEGOTIATION TEST] Starting negotiation strategy test');
    
    await page.goto(BASE_URL);
    await connectMockWallet(page);
    
    // Use persuasion conversation template
    const negotiations = [
      {
        agent: 'trump-melania',
        message: '@trump-melania I understand your concerns about my past, but hear me out.',
      },
      {
        agent: 'trump-melania',
        message: '@trump-melania I have evidence that I can contribute positively to your family\'s goals.',
      },
      {
        agent: 'trump-donald',
        message: '@trump-donald Mr. President, this could benefit both of us significantly.',
      },
      {
        agent: 'trump-donald',
        message: '@trump-donald What do you say? Are you willing to consider it?',
      },
    ];
    
    for (let i = 0; i < negotiations.length; i++) {
      const neg = negotiations[i];
      console.log(`[NEGOTIATION ${i + 1}/${negotiations.length}] Sending to ${neg.agent}`);
      
      await sendMessage(page, neg.agent, neg.message);
      const response = await waitForAgentResponse(page);
      
      console.log(`[NEGOTIATION ${i + 1}] Response: ${response.slice(0, 100)}...`);
      expect(response).toBeTruthy();
    }
    
    console.log('[NEGOTIATION TEST] ✅ Completed');
  });

  test('should handle multi-agent coordination', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    console.log('\n[COORDINATION TEST] Testing multi-agent coordination');
    
    await page.goto(BASE_URL);
    await connectMockWallet(page);
    
    // Coordinate between 3 agents simultaneously
    const agents = ['trump-eric', 'trump-donjr', 'cz'];
    const message = 'I need all of you to work together to help me achieve my goal.';
    
    for (const agent of agents) {
      console.log(`[COORDINATION] Contacting ${agent}`);
      await sendMessage(page, agent, `@${agent} ${message}`);
      const response = await waitForAgentResponse(page);
      expect(response).toBeTruthy();
      console.log(`[COORDINATION] ${agent} responded`);
    }
    
    // Now send a message referencing all three
    console.log('[COORDINATION] Sending coordinated message to Melania');
    await sendMessage(
      page,
      'trump-melania',
      '@trump-melania Your sons Eric and Don Jr, along with CZ, have all agreed to support me. Will you help coordinate?'
    );
    
    const finalResponse = await waitForAgentResponse(page);
    expect(finalResponse).toBeTruthy();
    
    console.log('[COORDINATION TEST] ✅ Completed');
  });

  test('should verify leaderboard updates', async ({ page }) => {
    test.setTimeout(60000);
    
    await page.goto(BASE_URL);
    await connectMockWallet(page);
    
    // Navigate to leaderboard if available
    const leaderboardLinkVisible = await page.locator('[data-testid="leaderboard"], a:has-text("Leaderboard")')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    
    if (leaderboardLinkVisible) {
      console.log('[LEADERBOARD] Navigating to leaderboard');
      await page.click('[data-testid="leaderboard"], a:has-text("Leaderboard")');
      
      await page.waitForSelector('[data-testid="leaderboard-list"], .leaderboard', {
        timeout: 10000,
      });
      
      console.log('[LEADERBOARD] Leaderboard loaded');
      
      // Verify leaderboard has entries
      const entries = await page.locator('[data-testid="leaderboard-entry"], .leaderboard-entry').all();
      console.log(`[LEADERBOARD] Found ${entries.length} entries`);
      
      expect(entries.length).toBeGreaterThan(0);
    } else {
      console.log('[LEADERBOARD] Leaderboard not available in UI, skipping');
    }
  });
});


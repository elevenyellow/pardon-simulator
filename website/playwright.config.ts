/**
 * Playwright Configuration
 * E2E testing configuration
 * 
 * Install with: npm install -D @playwright/test
 * Install browsers with: npx playwright install
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Get test configuration
const TEST_WALLET_PRIVATE_KEY = process.env.TEST_WALLET_PRIVATE_KEY || '';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  
  // Test configuration
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid race conditions
  
  // Reporter
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  // Test output
  outputDir: 'test-results/artifacts',
  
  use: {
    // Base URL
    baseURL: BASE_URL,
    
    // Browser options
    headless: true,
    viewport: { width: 1280, height: 720 },
    
    // Timeouts
    actionTimeout: 30000,
    navigationTimeout: 30000,
    
    // Screenshots and videos
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  // Test timeout
  timeout: 120000, // 2 minutes per test
  
  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});


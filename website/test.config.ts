/**
 * Test Configuration
 * Central configuration for all tests
 */

export const TEST_CONFIG = {
  // Agent IDs to test
  agents: [
    'trump-donald',
    'trump-melania',
    'trump-eric',
    'trump-donjr',
    'trump-barron',
    'cz',
  ] as const,

  // Premium services to test
  premiumServices: {
    fixed: [
      'insider_info',
      'strategy_advice',
      'connection_intro',
      'private_deal',
      'pardon_recommendation',
    ],
    variable: [
      'donation',
      'bribe',
      'campaign_contribution',
      'gift',
    ],
  },

  // Timeouts (milliseconds)
  timeouts: {
    agentResponse: 105000, // 105 seconds to match agent executor budget
    paymentConfirmation: 45000, // 45 seconds
    serviceDelivery: 60000, // 60 seconds
    agentInteraction: 90000, // 90 seconds (agent-to-agent)
    testSuite: 600000, // 10 minutes per test suite
  },

  // Retry configuration
  retries: {
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    backoffMultiplier: 2,
  },

  // Test amounts (USDC)
  amounts: {
    insider_info: 0.0005,
    strategy_advice: 0.001,
    connection_intro: 0.002,
    private_deal: 0.005,
    pardon_recommendation: 0.01,
    donation: 0.01, // minimum
    bribe: 0.05, // minimum
    campaign_contribution: 0.01, // minimum
    gift: 0.005, // minimum
  },

  // Polling configuration
  polling: {
    interval: 1000, // 1 second
    maxAttempts: 120,
  },

  // Debug settings
  debug: {
    logMessages: process.env.TEST_DEBUG === 'true',
    logPayments: process.env.TEST_DEBUG === 'true',
    logToolCalls: process.env.TEST_DEBUG === 'true',
    saveFailedTests: true,
  },

  // Test data
  testWallet: {
    privateKey: process.env.TEST_WALLET_PRIVATE_KEY || '',
    publicKey: process.env.TEST_WALLET_PUBLIC_KEY || '',
  },

  // Backend URLs
  endpoints: {
    backend: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000',
    coral: process.env.CORAL_SERVER_URL || 'http://localhost:5555',
    rpc: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    // PRODUCTION SAFE: Optional fixed session ID for local testing
    // If not set, tests will use the default test session
    // Production deployments don't use this
    testSessionId: process.env.CORAL_SESSION_ID || 'test-session-fixed',
  },

  // Test scenarios to run
  scenarios: {
    all: true,
    quick: ['basic_conversation', 'premium_service'],
    comprehensive: [
      'basic_conversation',
      'premium_service',
      'agent_interaction',
      'multi_agent_negotiation',
      'complete_pardon_quest',
    ],
  },

  // Assertion settings
  assertions: {
    scoreIncreaseMin: 1, // Minimum score increase per good message
    messageResponseTime: 105000, // Max time for agent to respond
    paymentVerificationTime: 10000, // Max time to verify payment
  },

  // Test isolation
  isolation: {
    cleanupBetweenTests: true,
    resetWalletBetweenTests: true,
    // CRITICAL: Keep false to use fixed session (agents are pre-connected)
    // Resource exhaustion is handled via Jest maxConcurrency instead
    createNewSessionPerTest: false,
  },
};

export type TestConfigType = typeof TEST_CONFIG;
export type AgentId = typeof TEST_CONFIG.agents[number];
export type PremiumServiceType = 
  | typeof TEST_CONFIG.premiumServices.fixed[number]
  | typeof TEST_CONFIG.premiumServices.variable[number];


const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Use node environment for integration tests (jsdom causes ESM issues with Solana packages)
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@solana|@coral-xyz|bs58|@noble|jayson|@coinbase)/)',
  ],
  // CRITICAL FIX: Limit concurrent tests to prevent Coral Server resource exhaustion
  // All tests share one Coral session (test-session-fixed)
  // Running too many in parallel creates too many threads simultaneously
  maxConcurrency: 3, // Max 3 tests creating threads at once
  maxWorkers: 2,     // Max 2 worker processes
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)


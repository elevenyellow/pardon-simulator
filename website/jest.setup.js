// Jest setup for polyfills needed by Solana libraries
const { TextEncoder, TextDecoder } = require('util');
const crypto = require('crypto');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill crypto for Node environment
if (typeof global.crypto === 'undefined') {
  global.crypto = crypto.webcrypto;
}

// Mock uuid to avoid ESM issues
jest.mock('uuid', () => {
  return {
    v4: () => crypto.randomUUID(),
  };
});

// Suppress console warnings during tests (optional)
// global.console = {
//   ...console,
//   warn: jest.fn(),
//   error: jest.fn(),
// };

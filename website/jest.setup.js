// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public'
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com'


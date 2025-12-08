/**
 * Demo Mode Service
 * Provides scripted conversations and mock payment functionality for demo purposes
 */

import { PAYMENT_TOKEN_NAME } from'@/config/tokens';

interface DemoMessage {
  id: string;
  content: string;
  requiresPayment: boolean;
  paymentRequest: PaymentRequest | null;
  responseAfterPayment: string | null;
}

interface DemoConversation {
  agentId: string;
  agentName: string;
  messages: DemoMessage[];
}

interface DemoScript {
  conversations: DemoConversation[];
}

interface PaymentRequest {
  recipient: string;
  recipient_address: string;
  amount_usdc: number;
  service_type: string;
  reason: string;
  payment_id: string;
}

interface X402Payload {
  x402Version: number;
  scheme: string;
  network: string;
  payment_id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: number;
  message: string;
}

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  score: number;
}

// Track message indices per agent
const messageIndices: Record<string, number> = {};

// Check if demo mode is enabled
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE ==='true';
}

// Load demo script from JSON
let cachedScript: DemoScript | null = null;

export async function loadDemoScript(): Promise<DemoScript> {
  if (cachedScript) {
    return cachedScript;
  }

  try {
    const response = await fetch('/demo-script.json');
    if (!response.ok) {
      throw new Error('Failed to load demo script');
    }
    cachedScript = await response.json();
    return cachedScript!;
  } catch (error) {
    console.error('Error loading demo script:', error);
    // Return empty script as fallback
    return { conversations: [] };
  }
}

// Get next demo message for an agent
export async function getNextDemoMessage(agentId: string): Promise<DemoMessage | null> {
  const script = await loadDemoScript();
  const conversation = script.conversations.find(c => c.agentId === agentId);
  
  if (!conversation) {
    return null;
  }

  // Get current message index for this agent
  const currentIndex = messageIndices[agentId] || 0;
  
  if (currentIndex >= conversation.messages.length) {
    return null; // No more messages for this agent
  }

  const message = conversation.messages[currentIndex];
  
  // Increment index for next time
  messageIndices[agentId] = currentIndex + 1;
  
  return message;
}

// Reset message indices (useful for demo restart)
export function resetDemoProgress(): void {
  Object.keys(messageIndices).forEach(key => {
    messageIndices[key] = 0;
  });
}

// Create mock x402 payload with valid structure
export function createMockX402Payload(
  paymentRequest: PaymentRequest,
  userWallet: string
): X402Payload {
  return {
    x402Version: 1,
    scheme:'exact',
    network:'solana',
    payment_id: paymentRequest.payment_id,
    from: userWallet,
    to: paymentRequest.recipient_address,
    amount: paymentRequest.amount_usdc,
    currency: PAYMENT_TOKEN_NAME,
    timestamp: Date.now(),
    message:`Payment for ${paymentRequest.reason}`  };
}

// Mock payment submission with delay
export async function mockPaymentSubmission(signedPayload: any): Promise<{
  success: boolean;
  transaction: string;
  x402ScanUrl: string;
  solanaExplorer: string;
}> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Generate mock transaction signature
  const mockSignature = generateMockSignature();

  return {
    success: true,
    transaction: mockSignature,
    x402ScanUrl:`https://www.x402scan.com/tx/${mockSignature}?chain=solana`,
    solanaExplorer:`https://explorer.solana.com/tx/${mockSignature}`  };
}

// Generate realistic-looking Solana transaction signature
function generateMockSignature(): string {
  const chars ='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let signature ='';
  for (let i = 0; i < 88; i++) {
    signature += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return signature;
}

// Generate fake leaderboard data
export function getFakeLeaderboard(): { entries: LeaderboardEntry[] } {
  const entries: LeaderboardEntry[] = [];
  
  // Generate 10 entries with scores between 90 and 99.99
  const scores = generateRandomScores(10, 90, 99.99);
  
  for (let i = 0; i < 10; i++) {
    entries.push({
      rank: i + 1,
      walletAddress: generateFakeSolanaAddress(),
      score: scores[i]
    });
  }
  
  return { entries };
}

// Generate random scores between min and max, all different, sorted descending
function generateRandomScores(count: number, min: number, max: number): number[] {
  const scores: number[] = [];
  const usedScores = new Set<string>();
  
  while (scores.length < count) {
    const score = Number((Math.random() * (max - min) + min).toFixed(2));
    const scoreStr = score.toFixed(2);
    
    if (!usedScores.has(scoreStr)) {
      scores.push(score);
      usedScores.add(scoreStr);
    }
  }
  
  // Sort descending
  return scores.sort((a, b) => b - a);
}

// Generate fake but realistic-looking Solana address (44 characters, base58)
function generateFakeSolanaAddress(): string {
  const chars ='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address ='';
  for (let i = 0; i < 44; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return address;
}

// Get response message after payment
export async function getPaymentResponseMessage(paymentId: string): Promise<string | null> {
  const script = await loadDemoScript();
  
  for (const conversation of script.conversations) {
    for (const message of conversation.messages) {
      if (message.paymentRequest?.payment_id === paymentId) {
        return message.responseAfterPayment;
      }
    }
  }
  
  return null;
}


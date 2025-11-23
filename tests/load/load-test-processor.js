/**
 * Artillery Load Test Processor
 * Custom functions for generating test data
 */

const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');

// Pool of existing wallet addresses (simulating returning users)
const existingWallets = [];
for (let i = 0; i < 50; i++) {
  const keypair = Keypair.generate();
  existingWallets.push(keypair.publicKey.toBase58());
}

// Pool of agents
const agents = ['cz', 'sbf', 'donald', 'melania', 'eric', 'donjr', 'barron'];

// Pool of test messages
const messages = [
  "@{agent} What's your opinion on the latest market trends?",
  "@{agent} Can you explain your strategy?",
  "@{agent} What do you think about recent news?",
  "@{agent} I need advice on this situation",
  "@{agent} Tell me about your experience",
  "@{agent} What would you do in this case?",
  "@{agent} Can you help me understand this better?",
  "@{agent} What's your perspective on this?"
];

/**
 * Generate a random Solana wallet address
 */
function $randomWallet() {
  const keypair = Keypair.generate();
  return keypair.publicKey.toBase58();
}

/**
 * Get an existing wallet address (for returning users)
 */
function $existingWallet() {
  return existingWallets[Math.floor(Math.random() * existingWallets.length)];
}

/**
 * Get a random agent ID
 */
function $randomAgent() {
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * Get a random message with agent mention
 */
function $randomMessage() {
  const message = messages[Math.floor(Math.random() * messages.length)];
  const agent = $randomAgent();
  return message.replace('{agent}', agent);
}

/**
 * Get current week ID (format: 2024-W45)
 */
function $currentWeek() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now - yearStart) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

module.exports = {
  $randomWallet,
  $existingWallet,
  $randomAgent,
  $randomMessage,
  $currentWeek
};




# Gameplay Guide

How to play Pardon Simulator and maximize your chances of success.

---

## Game Objective

**Primary Goal:** Secure a presidential pardon from Donald Trump for Sam Bankman-Fried (SBF).

**Secondary Goals:**
- Build relationships with key influencers
- Accumulate points on the leaderboard
- Navigate complex multi-agent negotiations
- Manage resources effectively

---

## Getting Started

### 1. Setup Your Environment

First-time setup:
```bash
# Install dependencies
npm install
cd website && npm install

# Setup database
npx prisma migrate dev

# Start services
./start-server.sh  # Terminal 1
./start-website.sh # Terminal 2
```

See [SETUP.md](./SETUP.md) for complete installation instructions.

### 2. Connect Your Wallet

- Install Phantom or Solflare wallet extension
- Create/import a Solana wallet
- Get USDC for premium services
- Get SOL for transaction fees
- Connect wallet on the game website

### 3. Start Playing

- Navigate to the game website (or http://localhost:3000 for local dev)
- Create a new conversation thread
- @mention an agent to begin interaction
- Try free interactions first before purchasing premium services

---

## Core Gameplay Mechanics

### Communication System

**Threading:**
- Each conversation is a separate thread
- Multiple agents can participate in a thread
- Use @mentions to address specific agents

**Message Format:**
- Keep messages concise and focused
- Be strategic with your approach
- Maintain professional tone
- Reference previous context when relevant

**Agent Responses:**
- Agents respond autonomously (not instant)
- Response time varies by agent availability
- Agents make independent decisions
- Not all messages guarantee a response

### Negotiation Strategy

**Understanding Motivations:**
- Each agent has different priorities
- Trump values deals and loyalty
- CZ focuses on strategic value
- Family members protect Trump interests
- Tailor your approach accordingly

**Building Rapport:**
- Start with respect and professionalism
- Demonstrate value early
- Listen to agent feedback
- Adapt your strategy based on responses
- Don't rush - relationship building takes time

**Multi-Agent Strategies:**
- Use intermediaries for difficult introductions
- Build coalitions of support
- Leverage existing relationships
- Ask agents to advocate on your behalf

### Payment System

**x402 Protocol:**
- Agents charge for premium services
- Payments made in USDC (stablecoin on Solana)
- Transactions execute on-chain
- Payment requests appear as modals in UI
- All payments forward to White House Treasury

**Premium Services:**
- Multiple service types available from agents
- Services may include connections, information, strategy, and more
- Pricing determined dynamically by agents
- Check in-game for current offerings

**Benefits:**
- Unlock key connections and information
- Earn bonus points (with diminishing returns)
- Progress faster toward objectives
- Demonstrate serious intent

**Managing Resources:**
- Start with free interactions when possible
- Invest strategically in high-value services
- Premium services award bonus points
- Multiple purchases of same service give less points

**How to Pay:**
1. Agent requests payment (modal appears)
2. Review amount and service description
3. Approve USDC transaction in wallet
4. Agent verifies payment on-chain
5. Service delivered + bonus points awarded

---

## Scoring System

### How Scoring Works

**Points System:**
- Points earned through strategic interactions
- Multiple scoring categories
- Quality of engagement matters
- Premium service bonuses available
- Time-based bonuses for responsiveness

**Scoring Categories:**
- Negotiation quality
- Payment completion
- Strategic thinking
- Quality of interactions
- Progress toward objectives

**Bonuses and Penalties:**
- Premium services award bonus points
- Diminishing returns discourage repetition
- Points can be deducted for poor behavior
- Speed bonuses for quick responses

### Leaderboard

**Weekly Competition:**
- Scores reset weekly
- Top performers ranked on leaderboard
- Prize eligibility for high performers
- Fair play enforced through anti-cheat measures

**Scoring Tips:**
- Variety in strategy is rewarded
- Respond quickly when opportunities arise
- Build genuine strategic relationships
- Quality interactions > message quantity
- Balance free and paid interactions

---

## Common Pitfalls

### Things to Avoid

**Poor Communication:**
- Spam messages
- Gibberish or nonsense
- Overly long messages
- Off-topic conversations
- Disrespectful tone

**Bad Strategy:**
- No clear plan
- Rushing too quickly
- Ignoring agent personalities
- Not building relationships
- Poor resource management

**Payment Mistakes:**
- Overpaying for low value
- Paying before building rapport
- Insufficient SOL balance
- Not verifying services

**Competitive Errors:**
- Trying to cheat or exploit
- Prompt injection attempts
- Creating multiple accounts
- Gaming the system

---

## Troubleshooting

### Agent Not Responding

**Possible Reasons:**
- Agent is busy with other users
- Your message wasn't compelling
- You need to build more rapport
- Timing may be poor

**Solutions:**
- Be patient
- Try a different approach
- Build relationship first
- Use intermediaries

### Payment Issues

**Common Problems:**
- Insufficient SOL balance
- Wallet not connected
- Network congestion
- Wrong amount

**Solutions:**
- Check wallet balance
- Reconnect wallet
- Wait and retry
- Verify requested amount

### Low Scores

**Causes:**
- Poor quality messages
- Weak negotiation
- Failed attempts
- Penalties applied

**Improvements:**
- Focus on quality
- Think strategically
- Be professional
- Learn from feedback

---

## Tips for Success

1. **Be Strategic:** Every action should serve your goal
2. **Build Relationships:** Don't rush to Trump immediately
3. **Manage Resources:** Budget your SOL carefully
4. **Stay Professional:** Maintain respectful tone
5. **Learn Continuously:** Adapt based on agent responses
6. **Use Intermediaries:** Leverage connections effectively
7. **Think Long-Term:** Build sustainable strategies
8. **Stay Authentic:** Genuine interaction works better
9. **Track Progress:** Monitor your score and adjust
10. **Have Fun:** It's a game - enjoy the experience!

---

## Resources

- **[Agent Overview](./AGENT_OVERVIEW.md)** - Learn about each agent
- **[Architecture](./ARCHITECTURE.md)** - Technical details
- **[Setup Guide](./SETUP.md)** - Installation instructions
- **[FAQ](./FAQ.md)** - Common questions

---

**Good luck negotiating your way to freedom! Remember: strategic thinking, relationship building, and professional communication are your keys to success.**


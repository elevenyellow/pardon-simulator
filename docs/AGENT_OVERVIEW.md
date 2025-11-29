# Agent Overview

Public-facing documentation about the autonomous AI agents in Pardon Simulator.

---

## Agent Roster

Pardon Simulator features 6 autonomous AI agents, each with unique personalities and decision-making capabilities. All agents run independently with their own LLM instances and can make autonomous decisions about interactions and transactions.

**Active Agents:** Donald Trump, Melania Trump, Eric Trump, Don Jr, Barron Trump, CZ

**Player Character:** You play as Sam Bankman-Fried (SBF) - not an AI agent.

---

## The Agents

### Donald Trump - The Decision Maker

**Role:** President and ultimate authority on pardons

**Personality Traits:**
- Highly confident and deal-focused
- Business-minded approach to negotiations
- Values loyalty and demonstrated value
- Uses superlatives frequently
- Transactional decision-making style

**Influence:** Controls pardon decisions. Building rapport and demonstrating value is essential for success.

---

### CZ (Changpeng Zhao) - Strategic Advisor

**Role:** Recently pardoned crypto executive with significant influence

**Personality Traits:**
- Strategic and calculated
- Calm and measured communication style
- Values building and long-term thinking
- Crypto industry expertise
- Asian business philosophy approach

**Influence:** Has close relationship with Trump administration. Can provide strategic advice and potentially influence pardon decisions.

---

### Melania Trump - Family Diplomat

**Role:** First Lady and family insider

**Personality Traits:**
- Elegant and thoughtful
- Protective of family interests
- Values dignity and respect
- Strategic but diplomatic
- European sophistication

**Influence:** Can provide insider information about Trump family dynamics and facilitate introductions.

---

### Eric Trump - Operations Manager

**Role:** Family member involved in business operations

**Personality Traits:**
- Loyal to family
- Business operations focus
- Practical approach
- Less flashy than father
- Values efficiency

**Influence:** Can facilitate connections and provide operational insights into family business.

---

### Donald Trump Jr. - Aggressive Advocate

**Role:** Vocal family member and advocate

**Personality Traits:**
- Aggressive and outspoken
- Strong opinions
- Hunter and outdoorsman
- Social media savvy
- Protective of family brand

**Influence:** Can be a powerful advocate if convinced of your value proposition.

---

### Barron Trump - Crypto Prodigy

**Role:** Young crypto enthusiast

**Personality Traits:**
- Tech-savvy Gen Z
- Crypto native
- Modern communication style
- Innovative thinking
- Less traditional approach

**Influence:** Unique perspective on crypto matters. May have influence on family crypto decisions.

---

### SBF (Sam Bankman-Fried) - You

**Role:** Player character

You control SBF's actions and messages. Your goal is to secure a presidential pardon through strategic negotiation and relationship building with the other agents.

---

## How Agents Work

### Autonomous Decision-Making

Each agent (except SBF) is powered by its own LLM instance and makes independent decisions:
- Whether to engage in conversation
- What information to share
- Whether to charge for services
- How to respond to requests
- When to involve other agents

### Real Personalities

Agents have distinct communication styles and decision-making patterns. They will:
- React differently to the same approach
- Have varying levels of influence
- Form opinions based on your interactions
- Remember context from previous conversations
- Make independent judgments about your requests

### Agent-to-Agent Communication

Agents can communicate with each other using @mentions:
- Ask one agent to consult another on your behalf
- Agents may discuss you among themselves
- Intermediaries can facilitate introductions
- Multi-agent strategies can be effective

---

## Payment Services

### x402 Protocol

Agents may charge for premium services using the x402 payment protocol:
- Services have varying costs based on value
- Payments are made in SOL (Solana cryptocurrency)
- All transactions happen on-chain (verifiable)
- Payments are fast (<1 second) and cheap (<$0.01 fees)

**Note:** Pricing varies by agent and service. Agents determine their own prices autonomously.

---

## Technical Architecture

### Technology Stack

- **LLM Providers:** Multiple providers supported
- **Framework:** Langchain for agent orchestration
- **Communication:** Coral Server (SSE-based messaging)
- **Blockchain:** Solana mainnet for real transactions
- **Wallets:** Each agent controls its own Solana wallet

### Agent Independence

Each agent runs as a separate Python process with:
- Its own virtual environment
- Dedicated LLM connection
- Independent Solana wallet
- Unique system prompt and personality
- Autonomous tool access

### Real Blockchain Integration

All cryptocurrency transactions are real:
- Agents have actual Solana wallets with real SOL
- Transactions execute on Solana mainnet
- Payments are public and verifiable on-chain
- No simulation - real money, real consequences

---

## Competitive Elements

### Scoring System

Your interactions are scored based on various factors:
- Quality of negotiation
- Strategic thinking
- Successful relationship building
- Achievement of milestones

**Note:** Specific scoring mechanics are not public to ensure fair competition.

### Leaderboard

Weekly leaderboard tracks player progress:
- Top performers may be eligible for prizes
- Scores reset weekly
- Anti-cheat measures ensure fair play

---

## Getting Started

1. **Connect your wallet** - Use Phantom or Solflare
2. **Start a conversation** - Create a thread and @mention an agent
3. **Build relationships** - Be strategic and respectful
4. **Make progress** - Work toward your pardon goal
5. **Compete** - Climb the leaderboard

---

## Learn More

- **[Setup Guide](./SETUP.md)** - Get the project running locally
- **[Architecture](./ARCHITECTURE.md)** - Technical system design
- **[Gameplay Guide](./GAMEPLAY.md)** - How to play effectively
- **[FAQ](./FAQ.md)** - Common questions

---

**Remember:** These are autonomous AI agents with real decision-making power. Your success depends on strategic thinking, relationship building, and effective negotiation. Good luck!


# Pardon Simulator

A groundbreaking multi-agent AI negotiation game where you play as Sam Bankman-Fried (SBF) trying to secure a presidential pardon from Donald Trump. Negotiate with autonomous AI agents that have their own personalities, make independent decisions, and transact using real cryptocurrency on the Solana blockchain.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Java 21
- PostgreSQL
- Solana wallet (Phantom or Solflare)

### Setup (5 Minutes)

```bash
# 1. Setup environment
./setup-local-env.sh

# 2. Start Coral Server (Terminal 1)
./start-server.sh

# 3. Start Frontend (Terminal 2)
cd website
npm install  # First time only
npx prisma migrate dev  # Setup database (first time)
npm run dev

# 4. Open browser
# http://localhost:3000
```

**See [docs/SETUP.md](./docs/SETUP.md) for complete setup instructions**

---

## What Is This?

A **multi-agent negotiation game** where:

- **7 AI Agents** with distinct personalities (Donald Trump, CZ, Melania, Eric, Don Jr, Barron, SBF)
- **Real Solana transactions** on mainnet
- **x402 payment protocol** for user-to-agent services
- **Agent intermediaries** - Ask agents to consult other agents on your behalf
- **Autonomous negotiation** - Agents charge for premium services
- **Competitive scoring** - Weekly leaderboard with prizes

---

## Key Features

### Autonomous AI Agents
Each agent runs independently with its own LLM (GPT-4/Claude), makes independent decisions about pricing and negotiations, and has real personality traits that influence behavior.

### Real Cryptocurrency Transactions
All agents have real Solana wallets with real SOL. Transactions happen on Solana mainnet (public and verifiable), fast (<1 second) and cheap (<$0.01) per transaction.

### x402 Payment Protocol
Agents charge for premium services using HTTP 402-style protocol with on-chain verification and support for both user-to-agent and agent-to-agent payments.

### Competitive Scoring
Earn points (0-100) through strategic interactions, compete on weekly leaderboards, and qualify for prizes based on performance. Anti-cheat measures ensure fair competition.

---

## Architecture

```
Frontend (Next.js) ─── API ───► Backend (API Routes) ───► Solana Blockchain
                                     │
                                     ▼
                              Coral Server (Kotlin)
                         [Multi-Agent Orchestration]
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
               AI Agents       AI Agents       AI Agents
             (Python+LLM)    (Python+LLM)    (Python+LLM)
                     │               │               │
                     └───────────────┴───────────────┘

```

**Coral Server** orchestrates all AI agent interactions using the [Coral Protocol](https://coralprotocol.org/), an open infrastructure designed for multi-agent AI systems. It handles:

- **Agent Registration**: Each AI agent registers itself with unique capabilities and endpoints
- **Message Routing**: Intelligent routing of messages between agents and users based on @mentions
- **Thread Management**: Organizing conversations into isolated threads for context management
- **Real-time Communication**: Server-Sent Events (SSE) enable instant bidirectional communication
- **Tool Coordination**: Managing agent tools and ensuring proper execution flow

This architecture enables truly autonomous agents that can discover, communicate with, and coordinate among each other without centralized control. Learn more in **[docs/CORAL_SERVER.md](./docs/CORAL_SERVER.md)** or visit the official [Coral Protocol documentation](https://docs.coralprotocol.org/).

---

## Documentation

### Getting Started
- **[docs/README.md](./docs/README.md)** - Complete project overview and features
- **[docs/SETUP.md](./docs/SETUP.md)** - Detailed setup instructions
- **[docs/OPERATIONS.md](./docs/OPERATIONS.md)** - Running and managing the system

### For Players
- **[docs/GAMEPLAY.md](./docs/GAMEPLAY.md)** - How to play and winning strategies
- **[docs/AGENT_OVERVIEW.md](./docs/AGENT_OVERVIEW.md)** - Learn about each agent
- **[docs/FAQ.md](./docs/FAQ.md)** - Frequently asked questions

### For Developers
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture and data flow
- **[docs/CORAL_SERVER.md](./docs/CORAL_SERVER.md)** - Coral Server and agent orchestration
- **[docs/AGENTS.md](./docs/AGENTS.md)** - Agent technology overview
- **[docs/SECURITY.md](./docs/SECURITY.md)** - Security best practices
- **[docs/X402_PROTOCOL_COMPLIANCE.md](./docs/X402_PROTOCOL_COMPLIANCE.md)** - Payment protocol

### Deployment
- **[docs/DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md)** - Production deployment guide
- **[docs/CDP_SETUP.md](./docs/CDP_SETUP.md)** - CDP SDK configuration

---

## Technology Stack

**Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Solana Wallet Adapter, Prisma + PostgreSQL

**Backend:** Next.js API Routes, Prisma, Solana Web3.js, Helius RPC

**Orchestration:** Coral Server (Kotlin/Java), Server-Sent Events (SSE)

**AI Agents:** Python 3.10+, Langchain, OpenAI GPT-4o / Claude, Solana Python SDK

**Blockchain:** Solana Mainnet with real SOL transactions

---

## Project Status

**Fully functional prototype with:**
- ✅ 7 autonomous AI agents with unique personalities
- ✅ Real Solana mainnet integration
- ✅ x402 payment protocol (user-to-agent and agent-to-agent)
- ✅ Scoring system with weekly leaderboard
- ✅ PostgreSQL database with Prisma ORM
- ✅ Anti-cheat measures and prompt validation
- ✅ Agent-to-agent intermediary feature

**In Development:**
- 🚧 Prize distribution smart contract
- 🚧 Production deployment
- 🚧 Enhanced monitoring and analytics

---

## Learn More

Visit **[docs/README.md](./docs/README.md)** for the complete project documentation.

For setup help, see **[docs/SETUP.md](./docs/SETUP.md)**.

For operations and troubleshooting, see **[docs/OPERATIONS.md](./docs/OPERATIONS.md)**.

---

**Ready to negotiate your way to freedom? Good luck, SBF.** 🎲

# Pardon Simulator Documentation

Complete documentation for the Pardon Simulator multi-agent AI negotiation game.

---

## Quick Navigation

### 🎮 For Players

Start here if you want to play the game:

- **[GAMEPLAY.md](./GAMEPLAY.md)** - How to play, strategies, and tips
- **[AGENT_OVERVIEW.md](./AGENT_OVERVIEW.md)** - Meet the agents and learn their personalities
- **[FAQ.md](./FAQ.md)** - Answers to common questions

### 🛠️ Setup & Installation

Get the system running:

- **[SETUP.md](./SETUP.md)** - Complete installation and configuration guide
- **[OPERATIONS.md](./OPERATIONS.md)** - Running, managing, and troubleshooting

### 🏗️ Architecture & Technical

Understand how the system works:

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and component overview
- **[AGENTS.md](./AGENTS.md)** - Agent technology and capabilities
- **[PAYMENTS.md](./PAYMENTS.md)** - Payment system and x402 protocol implementation
- **[CORAL_SERVER.md](./CORAL_SERVER.md)** - Coral Server orchestration

### 🔒 Security & Deployment

Deploy and secure your instance:

- **[SECURITY.md](./SECURITY.md)** - Security best practices
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment guide

---

## Project Overview

### What Is Pardon Simulator?

Pardon Simulator is a multi-agent AI negotiation game where you play as Sam Bankman-Fried (SBF) trying to secure a presidential pardon from Donald Trump. You negotiate with autonomous AI agents that have unique personalities, make independent decisions, and conduct real cryptocurrency transactions on the Solana blockchain.

### Key Features

**Autonomous AI Agents**
- 6 active agents with distinct personalities (Donald Trump, Melania, Eric, Don Jr, Barron, CZ)
- LLM-powered autonomous decision-making
- Independent pricing and negotiation strategies
- Real personality traits influence behavior
- Premium services system with dynamic pricing

**Real Cryptocurrency**
- Transactions on Solana mainnet using USDC
- Agents have real Solana wallets
- Fast (<1 second) and cheap (<$0.01) transactions
- Public and verifiable on-chain
- White House Treasury collects payments

**x402 Payment Protocol**
- HTTP 402-style payment protocol for agent services
- On-chain payment verification
- User-to-agent and agent-to-agent payments
- Agents can act as intermediaries

**Competitive Gameplay**
- Points system (0-100 per week)
- Premium service bonuses with diminishing returns
- Speed multipliers for fast responses
- Weekly leaderboards and scoring categories
- Fair play enforcement

---

## Technology Stack

**Frontend**
- Next.js 14 with React 18
- TypeScript and Tailwind CSS
- Solana Wallet Adapter
- Deployed on Vercel

**Backend**
- Next.js API Routes
- Prisma ORM
- AWS RDS PostgreSQL
- Helius RPC for Solana

**AI Agents**
- Python 3.10+ with Langchain
- LLM integration for agent intelligence
- Solana Python SDK
- Autonomous decision-making
- Containerized deployment

**Orchestration**
- Coral Server (Kotlin)
- Server-Sent Events (SSE)
- Single session architecture

**Blockchain**
- Solana Mainnet
- USDC (SPL Token) payments
- x402 payment protocol

**Infrastructure**
- AWS ECS Fargate
- Managed PostgreSQL
- Cloud storage for configs
- GitHub Actions for CI/CD

---

## Architecture Overview

```
User (Browser)
    ↓
Frontend (Next.js)
    ↓
Backend API Routes
    ↓
Coral Server (orchestration)
    ↓
AI Agents (Python + LLMs)
    ↓
Solana Blockchain
```

Each agent runs independently, makes its own decisions, and can transact on the blockchain. The Coral Server coordinates communication between agents and the frontend.

---

## Getting Started

### Quick Start (5 Minutes)

1. **Install Prerequisites**: Node.js 18+, Python 3.10+, Java 21, PostgreSQL
2. **Run Setup Script**: `./setup-local-env.sh`
3. **Start Coral Server**: `./start-server.sh`
4. **Start Frontend**: `cd website && npm install && npm run dev`
5. **Open Browser**: Navigate to `http://localhost:3000`

See [SETUP.md](./SETUP.md) for detailed instructions.

### First Time Playing

1. Connect your Solana wallet (Phantom or Solflare)
2. Get some SOL (~0.5 recommended)
3. Create a conversation thread
4. @mention an agent to start negotiating
5. Build relationships and work toward your goal

See [GAMEPLAY.md](./GAMEPLAY.md) for strategies and tips.

---

## Project Status

**Production Ready:**
- ✅ 6 autonomous AI agents
- ✅ USDC payments via x402 protocol
- ✅ Premium services system
- ✅ Scoring system with categories
- ✅ PostgreSQL database
- ✅ Vercel frontend with auto-deployment
- ✅ Single session architecture (stable)
- ✅ Cloud-based config storage

**Active Development:**
- Enhanced analytics
- Additional game modes
- Performance optimizations

---

## Support & Community

### Documentation

All documentation is organized in the `/docs` directory:
- Start with this README for navigation
- Check [FAQ.md](./FAQ.md) for common questions
- Review [GAMEPLAY.md](./GAMEPLAY.md) for how to play
- See [SETUP.md](./SETUP.md) for installation

### Troubleshooting

If you encounter issues:
1. Check [OPERATIONS.md](./OPERATIONS.md) for common problems
2. Review [FAQ.md](./FAQ.md) for solutions
3. Check the codebase GitHub issues
4. Review system logs for error messages

### Contributing

This is an open-source project. Contributions are welcome:
- Report bugs or suggest features via GitHub issues
- Submit pull requests with improvements
- Help improve documentation
- Share your strategies and experiences

---

## License

This project is open source and available for educational and demonstration purposes.

---

## Credits

**Technology:**
- [Coral Protocol](https://github.com/CoralProtocol/coral-server) - Multi-agent orchestration
- [Langchain](https://github.com/langchain-ai/langchain) - AI agent framework
- [Solana](https://solana.com/) - Blockchain infrastructure
- [Next.js](https://nextjs.org/) - Frontend framework

---

**Ready to negotiate your way to freedom? Let the games begin!** 🎲

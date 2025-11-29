# Frequently Asked Questions

Common questions about Pardon Simulator.

---

## General Questions

### What is Pardon Simulator?

Pardon Simulator is a multi-agent AI negotiation game where you play as Sam Bankman-Fried (SBF) trying to secure a presidential pardon from Donald Trump. You negotiate with autonomous AI agents that have unique personalities, make independent decisions, and conduct real cryptocurrency transactions on the Solana blockchain.

### Is this a real game or simulation?

It's a real game with real consequences:
- AI agents make autonomous decisions using LLMs
- Cryptocurrency transactions execute on Solana mainnet (real money)
- Scoring and leaderboard competition is live
- Your negotiations affect real outcomes

### How do I win?

Your primary goal is to secure a pardon from Donald Trump. Success requires:
- Strategic relationship building with agents
- Effective negotiation and communication
- Resource management
- Understanding agent motivations
- Accumulating points on the leaderboard

---

## Setup Questions

### What do I need to get started?

**Technical Requirements:**
- Node.js 18+
- Python 3.10+
- Java 21
- PostgreSQL
- Solana wallet (Phantom or Solflare)

**Resources:**
- ~0.5 SOL for transactions and fees
- API keys (LLM provider for agents, Helius for Solana RPC)

See the [Setup Guide](./SETUP.md) for detailed instructions.

### How do I get SOL?

1. Create a Solana wallet (Phantom/Solflare)
2. Buy SOL on an exchange (Coinbase, Binance, etc.)
3. Transfer to your wallet address
4. Alternative: Use a faucet for testnet (development only)

### Can I run this without crypto?

No. Real cryptocurrency transactions are a core feature of the game. However:
- Transaction fees are very low (<$0.01 each)
- You can start with small amounts (~0.5 SOL)
- Not all interactions require payments

### Do I need API keys?

Yes, for running your own instance:
- **LLM Provider:** API key for your chosen LLM provider
- **Solana RPC:** Helius API key (free tier available)

These keys go in your `agents-session-configuration.json` file.

---

## Gameplay Questions

### How do I talk to agents?

1. Open http://localhost:3000
2. Connect your Solana wallet
3. Create a new thread
4. @mention an agent (e.g., "@donald-trump Hello")
5. Wait for agent response

### Why isn't an agent responding?

Possible reasons:
- Agent is processing other messages
- Your message wasn't compelling enough
- You need to build rapport first
- The agent chose not to respond

Try building relationships before making big requests.

### How do payments work?

When an agent requests payment:
1. A modal appears showing amount and service
2. Review the details
3. Approve transaction in your wallet
4. Agent verifies payment on-chain
5. Service is delivered after confirmation

All payments use Solana (SOL) and execute in < 1 second.

### Do I have to pay for everything?

No! Many interactions are free:
- Initial conversations
- Relationship building
- Some information requests
- Basic interactions

Premium services (strategic advice, introductions, recommendations) typically require payment.

### How much should I budget?

Start with ~0.5 SOL:
- Most service costs are reasonable
- Transaction fees are minimal (<$0.01)
- Budget more for important services
- Free interactions can get you far

### Can I get a refund?

No. Blockchain transactions are irreversible. Always verify:
- The amount requested
- The service being offered
- Your wallet balance
- The agent you're paying

---

## Scoring Questions

### How is scoring calculated?

Points are awarded based on:
- Quality of your communication
- Strategic thinking demonstrated
- Successful negotiations
- Milestone achievements
- Completed transactions

Specific scoring algorithms are not public to ensure fair competition.

### Why did my score go down?

Points can be deducted for:
- Poor quality messages
- Inappropriate behavior
- Spam or gibberish
- Failed strategies
- Rule violations

### How often does the leaderboard reset?

The leaderboard resets weekly to give all players a fair chance at prizes and recognition.

### What do high scores win?

High-performing players may be eligible for prizes or recognition. Details are announced periodically.

---

## Technical Questions

### What technology powers this?

**Frontend:**
- Next.js 14 + React 18
- TypeScript
- Tailwind CSS
- Solana Wallet Adapter

**Backend:**
- Coral Server (Kotlin)
- Next.js API Routes
- PostgreSQL + Prisma

**AI Agents:**
- Python + Langchain
- Various LLM providers supported
- Solana Python SDK

**Blockchain:**
- Solana Mainnet
- Real cryptocurrency transactions

### How do agents make decisions?

Each agent:
- Runs as independent Python process
- Uses its own LLM instance
- Has unique system prompt and personality
- Makes autonomous decisions via Langchain
- Accesses tools (blockchain, messaging, etc.)

### Are agents really autonomous?

Yes! Agents are not scripted. They:
- Make their own decisions
- Set their own prices
- Choose whether to respond
- Form their own opinions
- Communicate independently

The only player-controlled character is SBF (you).

### Is my data secure?

Security measures:
- API keys stored in environment variables
- No keys committed to repository
- Wallet private keys encrypted
- Database credentials protected
- Frontend uses secure wallet connection

See [SECURITY.md](./SECURITY.md) for more details.

### Can I modify the agents?

Yes! This is open source:
- Agent prompts are in `agents/*/personality-public.txt` and `operational-private.txt`
- Agent code is in `agents/*/main.py`
- Customize personalities and behaviors
- Add new agents

Note: Operational files are not committed to prevent revealing game mechanics.

---

## Wallet Questions

### Which wallets are supported?

- Phantom (recommended)
- Solflare
- Any Solana-compatible wallet

### Do I need a special wallet?

No. Any standard Solana wallet works. Just make sure:
- It supports Solana mainnet
- You control the private keys
- It can sign transactions

### What if I lose my wallet?

If you lose access to your wallet:
- Your SOL and transaction history are gone
- Your game progress is tied to that wallet address
- There's no recovery mechanism
- Keep backups and seed phrases secure!

### Can I use the same wallet on multiple devices?

Yes. Import your wallet using your seed phrase on any device. The wallet address stays the same across devices.

---

## Troubleshooting

### Agents won't start

Common issues:
- Missing environment variables
- Invalid API keys
- Python version issues
- Port conflicts

Check logs and see [OPERATIONS.md](./OPERATIONS.md) for troubleshooting steps.

### Database connection failed

Solutions:
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Run migrations: `npx prisma migrate dev`
- Verify credentials

### Wallet won't connect

Try:
- Refresh the page
- Reconnect wallet
- Clear browser cache
- Check wallet extension is unlocked
- Try different browser

### Transaction failed

Causes:
- Insufficient SOL balance
- Network congestion
- Invalid amount
- Wallet rejected transaction

Check your balance and try again.

### "Agent not found" error

Make sure:
- Agent name is correct (e.g., "donald-trump", not "Donald Trump")
- Agent is running (check Coral Server logs)
- Use proper @mention format

---

## Competition Questions

### Is there anti-cheat?

Yes. The system monitors for:
- Multiple accounts
- Prompt injection attempts
- Exploitation attempts
- Gaming the system
- Spam/abuse

Violations may result in disqualification.

### Can I collaborate with other players?

The game is designed for individual play. Collaboration or sharing strategies may affect your competitive standing.

### How are winners determined?

Winners are based on:
- Leaderboard scores
- Achievement of objectives
- Fair play compliance
- Quality of gameplay

---

## Development Questions

### Can I contribute to the project?

Yes! This is open source. See [CONTRIBUTING.md](../coral-server/CONTRIBUTING.md) for guidelines.

### How do I add a new agent?

1. Copy existing agent directory structure
2. Create personality and operational prompts
3. Configure in `registry.toml`
4. Add to agent startup scripts
5. Test thoroughly

See [AGENTS.md](./AGENTS.md) for technical details (note: some details are kept private to maintain game integrity).

### Can I deploy this publicly?

Yes, but consider:
- API costs for LLMs
- Server hosting costs
- Database management
- Security implications
- Legal considerations (using real identities)

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

### Where can I get help?

- Read documentation in `/docs`
- Check GitHub issues
- Review codebase comments
- Ask in community channels

---

## Other Questions

### Why use real cryptocurrency?

Real crypto creates real stakes:
- Agents make meaningful decisions
- Resources matter
- Negotiations have consequences
- On-chain verification is transparent

### Is this legal?

The game is a creative project for entertainment and education. It:
- Uses public figures in satirical context
- Operates as parody/commentary
- Has no real-world legal implications
- Is clearly marked as a game

### Can I use this for something else?

Yes! The architecture supports:
- Different agent personalities
- Various game scenarios
- Educational applications
- Research projects

Fork the repository and adapt it to your needs.

### Who created this?

Pardon Simulator was created as a demonstration of multi-agent AI systems with real blockchain integration. It showcases autonomous AI decision-making, cryptocurrency transactions, and complex negotiations.

---

## Still Have Questions?

Check other documentation:
- **[Setup Guide](./SETUP.md)** - Installation and configuration
- **[Gameplay Guide](./GAMEPLAY.md)** - How to play
- **[Agent Overview](./AGENT_OVERVIEW.md)** - Learn about agents
- **[Architecture](./ARCHITECTURE.md)** - Technical details
- **[Operations](./OPERATIONS.md)** - Running and managing the system

---

**Ready to play? Let the negotiations begin!**


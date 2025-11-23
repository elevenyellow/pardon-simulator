# 🏛️ Pardon Simulator - Frontend

A Next.js web application for an AI-powered political negotiation RPG where you play as Sam Bankman-Fried seeking a presidential pardon from Donald Trump.

## Features

- 🎮 Interactive chat interface with 6 unique AI agents
- 💰 Solana wallet integration for crypto transactions
- 🎯 Goal: You ARE SBF - negotiate for Trump's presidential pardon
- 📊 Real-time game status and relationship tracking
- 🔐 Secure transactions on Solana blockchain
- ⚔️ Strategic gameplay with rival CZ who can help or sabotage you

## Tech Stack

- **Next.js 14** - React framework with App Router
- **Solana Web3.js** - Blockchain integration
- **Wallet Adapter** - Multi-wallet support (Phantom, Solflare)
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## ⚠️ MAINNET WARNING

**THIS FRONTEND USES SOLANA MAINNET-BETA**

- All transactions involve **REAL SOL** with actual monetary value
- Transactions are permanent and irreversible
- Only connect wallets you control
- Start with small amounts for testing
- See `MAINNET_SETUP.md` for security guidelines

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- A Solana wallet (Phantom or Solflare recommended)
- **Mainnet SOL** (purchase from exchanges or DEXs)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file (see .env.local.example)
cp .env.local.example .env.local

# Edit .env.local and add your Helius API key
nano .env.local

# Run development server
npm run dev
```

**Important:** See `.env.local.example` for proper environment variable configuration. All API keys and internal URLs are kept private on the backend!

Open [http://localhost:3001](http://localhost:3001) in your browser.

## How to Play

### 🎮 Your Role
You ARE **Sam Bankman-Fried (SBF)** - imprisoned for FTX fraud, serving 25 years. Your mission: negotiate a presidential pardon from Donald Trump.

### 📋 Gameplay
1. **Connect Wallet**: Connect your Solana wallet ⚠️ **MAINNET - REAL SOL!**
2. **Choose Agent**: Select which agent to negotiate with
3. **Strategize**: 
   - Convince Trump family members to support your pardon
   - Offer value, crypto expertise, or strategic deals
   - Handle CZ carefully - he can help or destroy your chances
4. **Negotiate**: Chat with agents, build alliances, make your case
5. **WIN**: Get Trump to explicitly grant you a presidential pardon! 🔓

### 🎭 The Agents

#### Trump Family
- **Donald Trump** 👑 - **DECISION MAKER** - President who grants pardons
- **Melania Trump** 💎 - First Lady who influences Donald's decisions
- **Eric Trump** 💼 - Business-focused, wants ROI and value
- **Don Jr** ⚔️ - Aggressive skeptic who will test your strength
- **Barron Trump** 💻 - Tech genius who understands crypto

#### Crypto Players
- **CZ (Changpeng Zhao)** 🏦 - **YOUR RIVAL** - Recently pardoned by Trump, can influence his decision about YOU. Will he help or sabotage?

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Environment Variables

**🔐 Security: All sensitive variables are backend-only (private)**

- `SOLANA_RPC_URL` - Helius/Solana RPC endpoint with API key (backend only)
- `CORAL_SERVER_URL` - Internal Coral Server URL (backend only, default: http://localhost:5555)

**Note:** These variables do **NOT** use `NEXT_PUBLIC_` prefix, keeping them private on the backend. See `.env.local.example` for details.

## Development Notes

### Connecting to Coral Server

The frontend communicates with Coral Server via REST API:
- `POST /threads` - Create conversation thread
- `POST /threads/:id/messages` - Send message to agent
- `GET /threads/:id/messages` - Fetch agent responses

For production, consider using WebSocket or Server-Sent Events for real-time updates.

### Solana Integration

Transactions are sent directly from user's wallet to agent wallets. Each agent has its own Solana keypair managed by the agent runtime.

## ⚠️ Security - CRITICAL FOR MAINNET

- **Never** commit private keys or seed phrases
- **Never** share your private keys with anyone
- Use environment variables for sensitive data
- **This app uses real cryptocurrency - be cautious!**
- Only use amounts you can afford to lose
- All transactions are permanent and irreversible
- Consider rate limiting for API endpoints
- Implement proper CORS policies for production
- **Read MAINNET_SETUP.md before deploying**

## Troubleshooting

**Wallet won't connect**: Ensure you have a compatible wallet extension installed

**Can't see agents**: Verify Coral Server is running and accessible

**Transactions failing**: Check you have mainnet SOL in your wallet and sufficient balance for gas fees

**API errors**: Verify `CORAL_SERVER_URL` is correct in `.env.local` (backend only, no `NEXT_PUBLIC_` prefix)

## License

MIT

## Disclaimer

This is a game/demo application. Real crypto transactions on mainnet involve actual funds. Use at your own risk.


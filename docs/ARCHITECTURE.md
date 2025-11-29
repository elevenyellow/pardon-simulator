# System Architecture

High-level overview of the Pardon Simulator system architecture.

---

## Overview

Pardon Simulator uses a **three-tier architecture** with complete separation of concerns:

```
User (Browser)
    ↓
Frontend (Next.js + React)
    ↓
Backend API (Next.js API Routes)
    ↓
Coral Server (Kotlin)
    ↓
AI Agents (Python + LLMs)
    ↓
Solana Blockchain
```

Each layer has distinct responsibilities and security boundaries.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Frontend (React/Next.js)                │
│  - User interface                                         │
│  - Solana wallet integration                             │
│  - Payment modal                                          │
│  - Chat interface                                         │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS
                     ↓
┌──────────────────────────────────────────────────────────┐
│            Next.js API Routes (Backend)                   │
│  - Session management                                     │
│  - Message proxying                                       │
│  - x402 payment protocol                                  │
│  - Transaction verification                               │
│  - Database operations                                    │
└────────────────────┬─────────────────────────────────────┘
                     │ Internal HTTP
                     ↓
┌──────────────────────────────────────────────────────────┐
│                    Coral Server (Kotlin)                  │
│  - Agent orchestration                                    │
│  - Message routing                                        │
│  - Thread management                                      │
│  - Multi-agent coordination                               │
└────────────────────┬─────────────────────────────────────┘
                     │ Server-Sent Events
                     ↓
┌──────────────────────────────────────────────────────────┐
│                   AI Agents (Python)                      │
│  - Independent LLM instances                              │
│  - Autonomous decision-making                             │
│  - Wallet management                                      │
│  - Tool execution                                         │
└────────────────────┬─────────────────────────────────────┘
                     │ Transactions
                     ↓
┌──────────────────────────────────────────────────────────┐
│            Solana Blockchain (Public Network)            │
│  - Payment processing                                     │
│  - Transaction verification                               │
│  - Public ledger                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Component Details

### Frontend Layer

**Technology**: Next.js 14, React 18, TypeScript, Tailwind CSS

**Responsibilities**:
- User interface rendering
- Wallet connection (Phantom/Solflare)
- Message composition and display
- Payment modal for x402 requests
- Real-time updates
- Score and leaderboard display

**Security**:
- No direct access to Coral Server
- No knowledge of agent private keys
- User controls their own wallet
- All communication through Backend API

### Backend API Layer

**Technology**: Next.js API Routes, Prisma, PostgreSQL

**Responsibilities**:
- Session management
- Message validation and proxying
- x402 payment protocol implementation
- On-chain transaction verification
- Database operations (users, sessions, scores)
- Leaderboard management
- Logging and analytics

**Security**:
- Input validation
- Rate limiting
- Authentication (wallet-based)
- No wallet private keys stored
- Blockchain verification for all payments

### Coral Server Layer

**Technology**: Kotlin, Java 21

**Responsibilities**:
- Multi-agent orchestration
- Message routing between agents
- Thread and session management
- Tool execution coordination
- Server-Sent Events for real-time communication

**Features**:
- Agent registration
- Message broadcasting
- Thread isolation
- Tool result handling

### AI Agent Layer

**Technology**: Python 3.10+, Langchain, LLM APIs

**Responsibilities**:
- Autonomous decision-making
- Natural language processing
- Personality expression
- Payment request generation
- Transaction verification
- Service delivery

**Capabilities**:
- Independent LLM instances
- Tool access (messaging, payments, etc.)
- Wallet management
- Real-time communication with Coral Server

### Blockchain Layer

**Technology**: Solana Mainnet

**Responsibilities**:
- Transaction processing
- Payment verification
- Public ledger
- Immutable audit trail

**Features**:
- Sub-second transactions
- Low fees (<$0.01)
- Public verifiability
- Cryptographic security

---

## Data Flow

### Message Flow

1. User sends message via Frontend
2. Frontend sends to Backend API (`/api/chat/send`)
3. Backend validates and forwards to Coral Server
4. Coral Server routes to mentioned agents
5. Agents process with LLMs and decide response
6. Agents send response back through Coral Server
7. Backend receives and stores in database
8. Frontend displays to user

### Payment Flow

1. Agent determines service requires payment
2. Agent requests payment via x402 protocol
3. Backend returns HTTP 402 to Frontend
4. Frontend shows payment modal
5. User approves transaction in wallet
6. Transaction executes on Solana
7. User sends confirmation with signature
8. Backend verifies transaction on-chain
9. Agent delivers service upon verification

### Scoring Flow

1. Agent evaluates user interaction
2. Agent submits scoring event to Backend
3. Backend validates and updates database
4. Score delta recorded with reason
5. Session score updated
6. Leaderboard recalculated weekly

---

## Database Schema

### Core Tables

**User**
- Unique wallet address
- Generated username
- Total score across all weeks
- Created timestamp

**Session**
- Links user to game session
- Current week score
- Coral session ID
- Weekly score tracking

**Score**
- Individual scoring events
- Delta and current score
- Reason and category
- Thread-level tracking
- Audit trail

**LeaderboardEntry**
- Weekly rankings
- Final scores
- Prize eligibility
- Unique per user per week

**Payment**
- Transaction records
- Wallet addresses
- Amount and currency
- Verification status
- Service type

**Message**
- Chat history
- User and agent messages
- Thread organization
- Timestamp tracking

---

## Security Model

### Multi-Layer Security

**Frontend**:
- User controls their wallet
- No sensitive data stored
- All code inspectable
- Secure wallet connection

**Backend**:
- Input validation
- Authentication required
- Rate limiting
- Blockchain verification
- Secure database access

**Agents**:
- Isolated wallets
- Low balance (minimal risk)
- Independent operation
- Protected prompts

**Blockchain**:
- Cryptographic security
- Public verification
- Immutable records
- No trust required

### Anti-Cheat Measures

The system includes multiple layers of protection:
- Message validation
- Prompt injection protection
- Score manipulation prevention
- Multi-account detection
- Transaction verification

Specific implementation details are kept private to maintain game integrity.

---

## Technology Choices

### Why Next.js?
- Full-stack framework (frontend + API)
- TypeScript support
- Fast development
- Easy deployment (Vercel)
- Great React integration

### Why Coral Server?
- Purpose-built for multi-agent systems
- Server-Sent Events for real-time
- Tool execution framework
- Message routing
- Open source and extensible

### Why Python for Agents?
- Excellent AI/ML libraries
- Langchain integration
- Solana SDK available
- Fast prototyping
- Clear, readable code

### Why Solana?
- Sub-second transaction finality
- Extremely low fees
- High throughput
- Mature ecosystem
- Strong wallet support

### Why PostgreSQL?
- Reliable and mature
- Excellent Prisma support
- Complex queries for leaderboards
- ACID compliance
- Easy to deploy

---

## Scalability Considerations

### Current Architecture
- Designed for 10-100 concurrent users
- Single Coral Server instance
- Multiple agent processes
- PostgreSQL database
- All on single server possible

### Scaling Options

**Horizontal Scaling**:
- Multiple Coral Server instances
- Load balancing across agents
- Database read replicas
- CDN for static assets

**Vertical Scaling**:
- More powerful server
- Increased database resources
- Better caching
- Optimized queries

**Optimization**:
- Agent response caching
- Database indexing
- Message queue for agents
- Background job processing

---

## Deployment Architecture

### Development
- All services on localhost
- Local PostgreSQL
- Local Coral Server
- Local agent processes

### Production (Current: AWS ECS)
- Frontend on Vercel (auto-deploy from main)
- Backend API on Vercel
- Coral Server + Agents on AWS ECS Fargate
- Single ECS task running all agents in one container
- Single Coral session (simplified architecture)
- Managed PostgreSQL
- Helius RPC for Solana
- Config files stored in cloud storage

**Production Architecture:**
- Single session for stability and simplicity
- All agents in one container
- Cloud-based configuration management

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) and [ECS_DEPLOYMENT.md](./ECS_DEPLOYMENT.md) for deployment instructions.

---

## Integration Points

### External Services

**LLM Providers**:
- Multiple LLM providers supported
- Configurable per agent
- API-based integration

**Blockchain**:
- Helius RPC for Solana
- Public RPC fallback
- Transaction monitoring

**Database**:
- PostgreSQL (local or managed)
- Prisma ORM
- Migration management

**Monitoring** (Optional):
- Application logs
- Error tracking
- Performance monitoring
- Transaction tracking

---

## Development Workflow

### Local Development
1. Start PostgreSQL
2. Run database migrations
3. Start Coral Server
4. Start agent processes
5. Start Next.js dev server
6. Connect wallet in browser

### Testing
- Unit tests for components
- Integration tests for APIs
- Agent behavior testing
- Transaction simulation
- End-to-end testing

### Deployment
1. Build frontend
2. Deploy to hosting
3. Configure environment
4. Start backend services
5. Initialize agents
6. Monitor and verify

---

## Future Enhancements

### Planned Features
- Token integration ($PARDON)
- Enhanced analytics dashboard
- More sophisticated scoring
- Additional game modes
- Mobile optimization

### Technical Improvements
- Performance optimization
- Enhanced caching
- Better monitoring
- Automated testing
- CI/CD pipeline

---

## Learn More

### Related Documentation
- **[AGENTS.md](./AGENTS.md)** - Agent technology overview
- **[SECURITY.md](./SECURITY.md)** - Security best practices
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment
- **[OPERATIONS.md](./OPERATIONS.md)** - Running and managing

### External Resources
- [Coral Protocol Documentation](https://github.com/CoralProtocol/coral-server)
- [Langchain Documentation](https://python.langchain.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Next.js Documentation](https://nextjs.org/docs)

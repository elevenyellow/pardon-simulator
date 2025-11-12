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
- Get some SOL for transaction fees (~0.5 SOL recommended)
- Connect wallet on the Pardon Simulator website

### 3. Start Playing

- Navigate to http://localhost:3000
- Create a new conversation thread
- @mention an agent to begin interaction

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
- Agents may charge for premium services
- Payments made in SOL (Solana cryptocurrency)
- Transactions execute on-chain
- Payment requests appear as modals in UI

**When Payments Are Required:**
- Premium services and advice
- Exclusive information
- Important introductions
- High-value recommendations

**Managing Resources:**
- Start with free interactions when possible
- Invest strategically in key services
- Consider ROI of each payment
- Budget for multiple interactions

**How to Pay:**
1. Agent requests payment (modal appears)
2. Review amount and service description
3. Approve transaction in wallet
4. Agent verifies payment on-chain
5. Service delivered after verification

---

## Agent Interaction Guide

### Donald Trump

**Approach:**
- Be confident but respectful
- Focus on deals and value
- Emphasize how you can help his agenda
- Reference business and strategic thinking
- Don't waste his time

**What Works:**
- Demonstrating crypto expertise
- Offering valuable connections
- Strategic value propositions
- Confidence and professionalism

**What Doesn't Work:**
- Begging or desperation
- Vague requests
- No value proposition
- Disrespect or insults

### CZ (Changpeng Zhao)

**Approach:**
- Be strategic and thoughtful
- Show long-term thinking
- Reference building and innovation
- Respect his position
- Keep communication concise

**What Works:**
- Strategic insights
- Crypto expertise
- Professional demeanor
- Clear, brief communication

**What Doesn't Work:**
- Emotional appeals
- Rushed requests
- Lack of strategic thinking
- Wasting time

### Family Members (Melania, Eric, Don Jr., Barron)

**Approach:**
- Respect family dynamics
- Request assistance, not demands
- Offer value to family interests
- Be diplomatic
- Acknowledge their influence

**What Works:**
- Respectful requests for introductions
- Demonstrating value to family
- Strategic information gathering
- Building genuine rapport

**What Doesn't Work:**
- Treating them as mere intermediaries
- Disrespecting family bond
- Demanding favors
- Ignoring their individual personalities

---

## Scoring System

### How Scoring Works

Points are awarded based on your performance:
- Quality of interactions
- Strategic decisions
- Successful negotiations
- Achievement of milestones
- Payment completion

Points can also be deducted for:
- Poor approach or strategy
- Inappropriate messages
- Failed attempts
- Wasted opportunities

### Leaderboard

**Weekly Competition:**
- Scores reset each week
- Top performers tracked on leaderboard
- High scores may qualify for prizes
- Fair play enforced through anti-cheat measures

**Scoring Tips:**
- Quality over quantity
- Strategic thinking matters
- Build genuine relationships
- Complete meaningful interactions
- Avoid spam or poor behavior

---

## Winning Strategies

### Early Game

1. **Research Phase:**
   - Understand each agent's role
   - Read available documentation
   - Plan your approach
   - Identify key relationships

2. **Initial Contact:**
   - Start with accessible agents
   - Build rapport before requests
   - Gather information
   - Establish credibility

3. **Resource Management:**
   - Don't overspend early
   - Save for critical services
   - Invest in key relationships
   - Track your spending

### Mid Game

1. **Relationship Building:**
   - Deepen connections with allies
   - Request intermediary assistance
   - Gather insider information
   - Build coalition of support

2. **Strategic Positioning:**
   - Position yourself as valuable
   - Demonstrate expertise
   - Offer unique value
   - Align with agent interests

3. **Payment Investments:**
   - Pay for strategic information
   - Invest in key introductions
   - Build toward Trump access
   - Track ROI on payments

### Late Game

1. **Trump Engagement:**
   - Leverage all relationships
   - Have clear value proposition
   - Be prepared for negotiations
   - Execute with confidence

2. **Final Push:**
   - Call in favors from allies
   - Present comprehensive case
   - Demonstrate full value
   - Close the deal

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

## Advanced Techniques

### Intermediary Chains

Use agents to reach other agents:
```
You → Melania → Trump
You → CZ → Trump
You → Eric → Don Jr. → Trump
```

### Information Gathering

Build intelligence before major asks:
- Ask family about Trump's mood
- Get CZ's perspective on your case
- Understand current priorities
- Time your approach strategically

### Coalition Building

Create alliances:
- Multiple agents supporting you
- Coordinated advocacy
- Shared value proposition
- Collective influence

### Resource Optimization

Maximize limited resources:
- Free information first
- Strategic paid services
- High-ROI investments
- Careful budgeting

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


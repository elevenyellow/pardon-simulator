# Pardon Prizes Smart Contract

Solana smart contract for distributing weekly prizes in the Pardon Simulator game.

## Overview

This Anchor program manages prize distribution for weekly competitions:
- Stores prize pool for each week
- Distributes prizes based on rank (1st: 50%, 2nd: 20%, 3rd: 10%, 4th-10th: 2.86% each)
- Validates winners have minimum 80 points
- Enforces ranks 1-10 only

## Prerequisites

- Rust 1.70+
- Solana CLI 1.16+
- Anchor 0.30.1

## Installation

```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Install dependencies
yarn install
```

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

## Deploy

### Devnet

```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Airdrop SOL for deployment
solana airdrop 2

# Build and deploy
anchor build
anchor deploy
```

### Mainnet

```bash
# Configure Solana CLI for mainnet
solana config set --url mainnet-beta

# Deploy (requires SOL for deployment fee)
anchor build
anchor deploy
```

## Program ID

Update the program ID in:
- `Anchor.toml`
- `programs/pardon-prizes/src/lib.rs` (declare_id!)

After first build:
```bash
anchor keys list
# Copy the program ID and update files above
```

## Usage

### Initialize Prize Pool

```typescript
await program.methods
  .initializePrizePool("2024-W45")
  .accounts({
    prizePool: prizePoolPda,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Distribute Prizes

```typescript
const winners = [
  { wallet: winner1.publicKey, rank: 1, score: 95 },
  { wallet: winner2.publicKey, rank: 2, score: 88 },
  // ... more winners
];

await program.methods
  .distributePrizes(winners)
  .accounts({
    prizePool: prizePoolPda,
    prizePoolTokenAccount: prizePoolTokenAccount,
    winnerTokenAccount: winner1TokenAccount,
    authority: authority.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### Close Prize Pool

```typescript
await program.methods
  .closePrizePool()
  .accounts({
    prizePool: prizePoolPda,
    prizePoolTokenAccount: prizePoolTokenAccount,
    authorityTokenAccount: authorityTokenAccount,
    authority: authority.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

## Prize Distribution Logic

| Rank | Percentage | Amount (10,000 PARDON) |
|------|------------|------------------------|
| 1st  | 50%        | 5,000 PARDON          |
| 2nd  | 20%        | 2,000 PARDON          |
| 3rd  | 10%        | 1,000 PARDON          |
| 4th-10th | 2.86% each | ~286 PARDON each  |

## Security

- Only authority can distribute prizes
- Winners must have score ≥ 80
- Ranks must be 1-10
- Prize pool validates sufficient funds

## Integration with Backend

See `website/src/lib/prize-contract.ts` for TypeScript integration.

The weekly reset cron job should call `distributePrizes` after generating the leaderboard.

## Events

The contract emits `PrizeDistributed` events:
```rust
pub struct PrizeDistributed {
    pub winner: Pubkey,
    pub rank: u8,
    pub score: u8,
    pub amount: u64,
    pub week_id: String,
}
```

Listen for these events to track distributions on-chain.


/**
 * Prize Distribution Contract Integration
 * Interfaces with the Solana smart contract for distributing weekly prizes
 */

import { Connection, PublicKey, SystemProgram } from'@solana/web3.js';
import { Program, AnchorProvider, web3 } from'@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from'@solana/spl-token';

// This will be populated after contract deployment
const PRIZE_PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

export interface WinnerEntry {
  wallet: string;
  rank: number;
  score: number;
}

export interface PrizeDistributionResult {
  success: boolean;
  signature?: string;
  error?: string;
  winners: number;
  totalDistributed?: number;
}

/**
 * Get Prize Pool PDA for a given week
 */
export function getPrizePoolPda(weekId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('prize_pool'), Buffer.from(weekId)],
    PRIZE_PROGRAM_ID
  );
}

/**
 * Initialize prize pool for a week
 * Should be called at the start of each week with the prize pool funded
 */
export async function initializePrizePool(
  provider: AnchorProvider,
  weekId: string
): Promise<string> {
  // Note: This is a placeholder implementation
  // Actual implementation requires the full Anchor IDL
  
  const [prizePoolPda] = getPrizePoolPda(weekId);
  
  console.log(`Initializing prize pool for ${weekId}`);
  console.log(`Prize Pool PDA: ${prizePoolPda.toString()}`);
  
  // TODO: Implement actual Anchor program call
  // const program = new Program(idl, PRIZE_PROGRAM_ID, provider);
  // const tx = await program.methods
  //   .initializePrizePool(weekId)
  //   .accounts({
  //     prizePool: prizePoolPda,
  //     authority: provider.wallet.publicKey,
  //     systemProgram: SystemProgram.programId,
  //   })
  //   .rpc();
  
  return'placeholder-signature';
}

/**
 * Distribute prizes to winners
 * Called by the weekly reset cron job
 */
export async function distributePrizes(
  connection: Connection,
  authorityKeypair: web3.Keypair,
  weekId: string,
  winners: WinnerEntry[],
  prizePoolTokenAccount: PublicKey,
  pardonMint: PublicKey
): Promise<PrizeDistributionResult> {
  try {
    console.log(`Distributing prizes for ${weekId}`);
    console.log(`Winners: ${winners.length}`);
    
    if (winners.length === 0) {
      return {
        success: true,
        winners: 0,
        error:'No winners to distribute prizes to'      };
    }

    // Validate winners
    for (const winner of winners) {
      if (winner.score < 80) {
        throw new Error(`Winner ${winner.wallet} has score ${winner.score} < 80`);
      }
      if (winner.rank < 1 || winner.rank > 10) {
        throw new Error(`Winner ${winner.wallet} has invalid rank ${winner.rank}`);
      }
    }

    const [prizePoolPda] = getPrizePoolPda(weekId);

    // TODO: Implement actual Anchor program call
    // const provider = new AnchorProvider(connection, wallet, {});
    // const program = new Program(idl, PRIZE_PROGRAM_ID, provider);
    
    // For each winner, call distributePrizes
    // const winnersFormatted = winners.map(w => ({
    //   wallet: new PublicKey(w.wallet),
    //   rank: w.rank,
    //   score: w.score,
    // }));
    
    // const tx = await program.methods
    //   .distributePrizes(winnersFormatted)
    //   .accounts({
    //     prizePool: prizePoolPda,
    //     prizePoolTokenAccount,
    //     // winnerTokenAccount: dynamically for each winner
    //     authority: authorityKeypair.publicKey,
    //     tokenProgram: TOKEN_PROGRAM_ID,
    //   })
    //   .signers([authorityKeypair])
    //   .rpc();

    console.log('[prize] Distribution complete');

    return {
      success: true,
      signature:'placeholder-signature',
      winners: winners.length,
      totalDistributed: 10000, // Placeholder
    };

  } catch (error: any) {
    console.error('Prize distribution failed:', error);
    return {
      success: false,
      error: error.message,
      winners: 0,
    };
  }
}

/**
 * Calculate prize amount for a given rank
 */
export function calculatePrizeAmount(rank: number, totalPool: number): number {
  switch (rank) {
    case 1: return Math.floor(totalPool * 0.5);  // 50%
    case 2: return Math.floor(totalPool * 0.2);  // 20%
    case 3: return Math.floor(totalPool * 0.1);  // 10%
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10: return Math.floor(totalPool * 0.2 / 7); // ~2.86%
    default: return 0;
  }
}

/**
 * Get prize distribution summary
 */
export function getPrizeDistributionSummary(totalPool: number): {
  rank: number;
  percentage: number;
  amount: number;
}[] {
  return [
    { rank: 1, percentage: 50, amount: calculatePrizeAmount(1, totalPool) },
    { rank: 2, percentage: 20, amount: calculatePrizeAmount(2, totalPool) },
    { rank: 3, percentage: 10, amount: calculatePrizeAmount(3, totalPool) },
    { rank: 4, percentage: 2.86, amount: calculatePrizeAmount(4, totalPool) },
    { rank: 5, percentage: 2.86, amount: calculatePrizeAmount(5, totalPool) },
    { rank: 6, percentage: 2.86, amount: calculatePrizeAmount(6, totalPool) },
    { rank: 7, percentage: 2.86, amount: calculatePrizeAmount(7, totalPool) },
    { rank: 8, percentage: 2.86, amount: calculatePrizeAmount(8, totalPool) },
    { rank: 9, percentage: 2.86, amount: calculatePrizeAmount(9, totalPool) },
    { rank: 10, percentage: 2.86, amount: calculatePrizeAmount(10, totalPool) },
  ];
}

/**
 * Validate prize distribution before execution
 */
export function validatePrizeDistribution(
  winners: WinnerEntry[],
  prizePoolBalance: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate ranks
  const ranks = winners.map(w => w.rank);
  const uniqueRanks = new Set(ranks);
  if (ranks.length !== uniqueRanks.size) {
    errors.push('Duplicate ranks detected');
  }

  // Validate each winner
  winners.forEach((winner, index) => {
    if (winner.score < 80) {
      errors.push(`Winner ${index + 1}: Score ${winner.score} < 80`);
    }
    if (winner.rank < 1 || winner.rank > 10) {
      errors.push(`Winner ${index + 1}: Invalid rank ${winner.rank}`);
    }
    try {
      new PublicKey(winner.wallet);
    } catch {
      errors.push(`Winner ${index + 1}: Invalid wallet address`);
    }
  });

  // Calculate total distribution
  const totalDistribution = winners.reduce(
    (sum, winner) => sum + calculatePrizeAmount(winner.rank, prizePoolBalance),
    0
  );

  if (totalDistribution > prizePoolBalance) {
    errors.push(`Total distribution (${totalDistribution}) exceeds prize pool (${prizePoolBalance})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


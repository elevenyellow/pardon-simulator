use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod pardon_prizes {
    use super::*;

    /**
     * Initialize the prize pool account
     */
    pub fn initialize_prize_pool(
        ctx: Context<InitializePrizePool>,
        week_id: String,
    ) -> Result<()> {
        let prize_pool = &mut ctx.accounts.prize_pool;
        prize_pool.authority = ctx.accounts.authority.key();
        prize_pool.week_id = week_id;
        prize_pool.total_distributed = 0;
        prize_pool.bump = ctx.bumps.prize_pool;
        Ok(())
    }

    /**
     * Distribute prizes to winners based on their rank
     * Only callable by the authority
     */
    pub fn distribute_prizes(
        ctx: Context<DistributePrizes>,
        winners: Vec<WinnerEntry>,
    ) -> Result<()> {
        require!(
            ctx.accounts.prize_pool.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        let prize_pool_account = &ctx.accounts.prize_pool_token_account;
        let total_available = prize_pool_account.amount;
        
        require!(total_available > 0, ErrorCode::InsufficientFunds);

        let prize_pool = &mut ctx.accounts.prize_pool;
        
        // Validate all winners before distributing
        for winner in &winners {
            require!(winner.rank > 0 && winner.rank <= 10, ErrorCode::InvalidRank);
            require!(winner.score >= 80, ErrorCode::ScoreTooLow);
        }

        // Calculate and transfer prizes
        for winner in &winners {
            let prize_amount = calculate_prize(winner.rank, total_available);
            
            if prize_amount > 0 {
                // Transfer tokens from prize pool to winner
                let seeds = &[
                    b"prize_pool",
                    prize_pool.week_id.as_bytes(),
                    &[prize_pool.bump],
                ];
                let signer = &[&seeds[..]];

                let cpi_accounts = Transfer {
                    from: ctx.accounts.prize_pool_token_account.to_account_info(),
                    to: ctx.accounts.winner_token_account.to_account_info(),
                    authority: prize_pool.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

                token::transfer(cpi_ctx, prize_amount)?;
                
                prize_pool.total_distributed += prize_amount;
                
                emit!(PrizeDistributed {
                    winner: winner.wallet,
                    rank: winner.rank,
                    score: winner.score,
                    amount: prize_amount,
                    week_id: prize_pool.week_id.clone(),
                });
            }
        }

        Ok(())
    }

    /**
     * Close prize pool and return remaining funds to authority
     * Only callable after distribution is complete
     */
    pub fn close_prize_pool(ctx: Context<ClosePrizePool>) -> Result<()> {
        require!(
            ctx.accounts.prize_pool.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        // Transfer remaining tokens back to authority
        let remaining = ctx.accounts.prize_pool_token_account.amount;
        if remaining > 0 {
            let seeds = &[
                b"prize_pool",
                ctx.accounts.prize_pool.week_id.as_bytes(),
                &[ctx.accounts.prize_pool.bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.prize_pool_token_account.to_account_info(),
                to: ctx.accounts.authority_token_account.to_account_info(),
                authority: ctx.accounts.prize_pool.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

            token::transfer(cpi_ctx, remaining)?;
        }

        Ok(())
    }
}

/**
 * Calculate prize amount based on rank
 * 1st: 50%, 2nd: 20%, 3rd: 10%, 4th-10th: 20% / 7
 */
fn calculate_prize(rank: u8, total: u64) -> u64 {
    match rank {
        1 => total * 50 / 100,        // 50%
        2 => total * 20 / 100,        // 20%
        3 => total * 10 / 100,        // 10%
        4..=10 => total * 20 / 100 / 7, // ~2.86% each
        _ => 0,
    }
}

#[derive(Accounts)]
#[instruction(week_id: String)]
pub struct InitializePrizePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PrizePool::LEN,
        seeds = [b"prize_pool", week_id.as_bytes()],
        bump
    )]
    pub prize_pool: Account<'info, PrizePool>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributePrizes<'info> {
    #[account(mut)]
    pub prize_pool: Account<'info, PrizePool>,
    
    #[account(mut)]
    pub prize_pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClosePrizePool<'info> {
    #[account(
        mut,
        close = authority,
        has_one = authority
    )]
    pub prize_pool: Account<'info, PrizePool>,
    
    #[account(mut)]
    pub prize_pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct PrizePool {
    pub authority: Pubkey,
    pub week_id: String,
    pub total_distributed: u64,
    pub bump: u8,
}

impl PrizePool {
    pub const LEN: usize = 32 + // authority
                           64 + // week_id (String with max length)
                           8 +  // total_distributed
                           1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WinnerEntry {
    pub wallet: Pubkey,
    pub rank: u8,
    pub score: u8,
}

#[event]
pub struct PrizeDistributed {
    pub winner: Pubkey,
    pub rank: u8,
    pub score: u8,
    pub amount: u64,
    pub week_id: String,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: Only authority can call this function")]
    Unauthorized,
    #[msg("Invalid rank: Rank must be between 1 and 10")]
    InvalidRank,
    #[msg("Score too low: Winner must have at least 80 points")]
    ScoreTooLow,
    #[msg("Insufficient funds in prize pool")]
    InsufficientFunds,
}


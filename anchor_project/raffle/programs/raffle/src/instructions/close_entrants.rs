use anchor_lang::prelude::*;

use crate::constants::TIME_BUFFER;
use crate::state::{Entrants, Raffle};

pub fn handle_close_entrants(ctx: Context<CloseEntrants>) -> Result<()> {
    let raffle = &ctx.accounts.raffle;

    // Verify authority matches raffle authority
    if raffle.authority != *ctx.accounts.authority.key {
        return Err(anchor_lang::error!(crate::error::RaffleError::Unauthorized));
    }

    let clock = Clock::get()?;

    // Verify that the raffle has ended (using TIME_BUFFER for consistency)
    let end_timestamp_with_buffer = raffle
        .end_timestamp
        .checked_add(TIME_BUFFER)
        .ok_or(crate::error::RaffleError::InvalidCalculation)?;

    if clock.unix_timestamp < end_timestamp_with_buffer {
        return Err(anchor_lang::error!(
            crate::error::RaffleError::RaffleStillRunning
        ));
    }

    // Verify that randomness has been set (winners have been drawn)
    if raffle.randomness.is_none() {
        return Err(anchor_lang::error!(
            crate::error::RaffleError::WinnerNotDrawn
        ));
    }

    // Verify that the prize has been claimed
    if !raffle.claimed_prizes {
        return Err(anchor_lang::error!(
            crate::error::RaffleError::PrizeNotClaimed
        ));
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CloseEntrants<'info> {
    #[account(
        mut,
        has_one = entrants @ crate::error::RaffleError::Unauthorized
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(mut, close = authority)]
    pub entrants: AccountLoader<'info, Entrants>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

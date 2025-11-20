use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

use crate::constants::TIME_BUFFER;
use crate::error::RaffleError;
use crate::state::{Entrants, Raffle};
use crate::utils::{random, recent_blockhashes};

pub fn handle_reveal_raffle_winners(ctx: Context<RevealRaffleWinners>) -> Result<()> {
    let raffle: &mut Account<'_, Raffle> = &mut ctx.accounts.raffle;

    let end_timestamp = raffle.end_timestamp;

    let end_timestamp_with_buffer = end_timestamp
        .checked_add(TIME_BUFFER)
        .ok_or(RaffleError::InvalidCalculation)?;

    let clock = Clock::get()?;

    if clock.unix_timestamp < end_timestamp_with_buffer {
        return Err(error!(RaffleError::RaffleStillRunning));
    }

    let entrants = ctx.accounts.entrants.load()?;

    if entrants.total == 0 {
        return Err(error!(RaffleError::InvalidCalculation));
    }

    if raffle.randomness.is_some() {
        return Err(error!(RaffleError::WinnersAlreadyDrawn));
    }

    let randomness = recent_blockhashes(&ctx.accounts.recent_blockhashes)?;

    let winner_rand = random(randomness, entrants.total);

    let winner_index = winner_rand % entrants.total;

    msg!("Randomness: {} Winner index: {}", winner_rand, winner_index);

    raffle.randomness = Some(winner_index);

    Ok(())
}

#[derive(Accounts)]
pub struct RevealRaffleWinners<'info> {
    #[account(mut)]
    pub raffle: Account<'info, Raffle>,

    pub entrants: AccountLoader<'info, Entrants>,

    #[account(address = sysvar::recent_blockhashes::ID)]
    /// CHECK: Recent blockhashes sysvar
    pub recent_blockhashes: UncheckedAccount<'info>,
}

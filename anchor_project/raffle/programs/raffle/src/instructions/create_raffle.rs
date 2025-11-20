use anchor_lang::prelude::*;

use crate::constants::{ENTRANTS_SIZE, RAFFLE_SEED};
use crate::error::RaffleError;
use crate::state::{Entrants, Raffle};

pub fn handle_create_raffle(
    ctx: Context<CreateRaffle>,
    end_timestamp: i64,
    ticket_price: u64,
    max_entrants: u32,
    authority_fee_percent: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    if clock.unix_timestamp >= end_timestamp {
        return Err(error!(RaffleError::InvalidEndTimestamp));
    }

    if ticket_price == 0 {
        return Err(error!(RaffleError::InvalidTicketPrice));
    }

    if max_entrants == 0 || max_entrants > ENTRANTS_SIZE {
        return Err(error!(RaffleError::InvalidMaxEntrants));
    }

    if authority_fee_percent == 0 || authority_fee_percent > 100 {
        return Err(error!(RaffleError::InvalidAuthorityFeePercent));
    }

    let raffle = &mut ctx.accounts.raffle;

    raffle.authority = *ctx.accounts.authority.key;
    raffle.randomness = None;
    raffle.end_timestamp = end_timestamp;
    raffle.ticket_lamports_price = ticket_price;
    raffle.authority_fee_percent = authority_fee_percent;
    raffle.accumulated_fees = 0;
    raffle.bump = ctx.bumps.raffle;
    raffle.entrants = ctx.accounts.entrants.key();

    let mut entrants = ctx.accounts.entrants.load_init()?;
    entrants.max = max_entrants;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateRaffle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        seeds = [RAFFLE_SEED.as_bytes(), entrants.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + 128, // Option serialization workaround
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(zero)]
    pub entrants: AccountLoader<'info, Entrants>,

    pub system_program: Program<'info, System>,
}

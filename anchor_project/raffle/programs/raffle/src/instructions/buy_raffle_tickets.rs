use crate::error::RaffleError;
use crate::state::{Entrants, Raffle};
use anchor_lang::prelude::*;

pub fn handle_buy_raffle_tickets(ctx: Context<BuyTickets>, amount: u32) -> Result<()> {
    let mut entrants: std::cell::RefMut<'_, Entrants> = ctx.accounts.entrants.load_mut()?;

    // Read raffle data before mut borrow
    let raffle_key = ctx.accounts.raffle.key();
    let ticket_price = ctx.accounts.raffle.ticket_lamports_price;
    let end_timestamp = ctx.accounts.raffle.end_timestamp;
    let authority_fee_percent = ctx.accounts.raffle.authority_fee_percent;
    let current_accumulated_fees = ctx.accounts.raffle.accumulated_fees;

    let clock: Clock = Clock::get()?;

    if clock.unix_timestamp > end_timestamp {
        return Err(error!(RaffleError::RaffleEnded));
    }
    if entrants.total >= entrants.max {
        return Err(error!(RaffleError::NotEnoughTicketsLeft));
    }

    msg!("Amount: {} tickets", amount);

    let player_key = ctx.accounts.player.key();

    for _ in 0..amount {
        entrants.append(player_key)?;
    }

    let total_cost = ticket_price
        .checked_mul(amount as u64)
        .ok_or(RaffleError::InvalidCalculation)?;

    let authority_fee = total_cost
        .checked_mul(authority_fee_percent as u64)
        .and_then(|v| v.checked_div(100))
        .ok_or(RaffleError::InvalidCalculation)?;

    let user_ticket_price = total_cost
        .checked_sub(authority_fee)
        .ok_or(RaffleError::InvalidCalculation)?;

    // Do transfer before mutating raffle
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.player.key(),
            &raffle_key,
            user_ticket_price,
        ),
        &[
            ctx.accounts.player.to_account_info(),
            ctx.accounts.raffle.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Now mutate raffle
    let raffle = &mut ctx.accounts.raffle;
    raffle.accumulated_fees = current_accumulated_fees
        .checked_add(authority_fee)
        .ok_or(RaffleError::InvalidCalculation)?;

    msg!("Accumulated fees: {}", raffle.accumulated_fees);

    msg!("Total tickets: {}", entrants.total);

    Ok(())
}

#[derive(Accounts)]
pub struct BuyTickets<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        has_one = entrants,
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(mut)]
    pub entrants: AccountLoader<'info, Entrants>,

    pub system_program: Program<'info, System>,
}

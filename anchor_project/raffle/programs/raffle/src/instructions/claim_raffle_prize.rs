use anchor_lang::prelude::*;

use crate::error::RaffleError;
use crate::state::{Entrants, Raffle};

pub fn handle_claim_raffle_prize(ctx: Context<ClaimRafflePrize>) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;

    let entrants = ctx.accounts.entrants.load()?;

    let randomness = match raffle.randomness {
        Some(randomness) => randomness,
        None => return Err(error!(RaffleError::WinnerNotDrawn)),
    };

    match raffle.claimed_prizes {
        true => return Err(error!(RaffleError::PrizeAlreadyClaimed)),
        false => (),
    }

    if ctx.accounts.player.key() != entrants.entrants[randomness as usize] {
        return Err(error!(RaffleError::NotWinner));
    }

    // Calcola il rent minimo richiesto per l'account raffle
    let rent = Rent::get()?;
    let raffle_account_info = raffle.to_account_info();
    let rent_minimum = rent.minimum_balance(raffle_account_info.data_len());

    // Trasferisci solo i lamports in eccesso rispetto al rent
    let total_lamports = raffle_account_info.lamports();
    let prize_lamports = total_lamports
        .checked_sub(rent_minimum)
        .and_then(|v| v.checked_sub(raffle.accumulated_fees))
        .ok_or(RaffleError::InvalidCalculation)?;

    if prize_lamports == 0 {
        return Err(error!(RaffleError::NoPrize));
    }

    **raffle_account_info.try_borrow_mut_lamports()? -= prize_lamports;
    **ctx
        .accounts
        .player
        .to_account_info()
        .try_borrow_mut_lamports()? += prize_lamports;
    msg!("Prize lamports: {}", prize_lamports);

    **raffle_account_info.try_borrow_mut_lamports()? -= raffle.accumulated_fees;
    **ctx
        .accounts
        .authority
        .to_account_info()
        .try_borrow_mut_lamports()? += raffle.accumulated_fees;

    raffle.claimed_prizes = true;

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRafflePrize<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(mut, has_one = entrants)]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: Authority account
    #[account(mut)]
    pub authority: UncheckedAccount<'info>,

    pub entrants: AccountLoader<'info, Entrants>,

    pub system_program: Program<'info, System>,
}

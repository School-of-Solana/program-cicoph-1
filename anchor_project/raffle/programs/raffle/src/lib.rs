mod constants;
mod error;
mod instructions;
mod state;
mod utils;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("Hvaz8KM81gTvnrYtEqYtbuTLJt7w2hBJRRRXgTXTN3E7");

#[program]
pub mod raffle {

    use super::*;

    /* Start Raffle */
    pub fn create_raffle(
        ctx: Context<CreateRaffle>,
        end_timestamp: i64,
        ticket_price: u64,
        max_entrants: u32,
        authority_fee_percent: u8,
    ) -> Result<()> {
        handle_create_raffle(
            ctx,
            end_timestamp,
            ticket_price,
            max_entrants,
            authority_fee_percent,
        )
    }

    pub fn reveal_raffle_winners(ctx: Context<RevealRaffleWinners>) -> Result<()> {
        handle_reveal_raffle_winners(ctx)
    }

    pub fn claim_raffle_prize(ctx: Context<ClaimRafflePrize>) -> Result<()> {
        handle_claim_raffle_prize(ctx)
    }
    /* End Raffle */

    /* Start Ticket */
    pub fn buy_tickets(ctx: Context<BuyTickets>, amount: u32) -> Result<()> {
        handle_buy_raffle_tickets(ctx, amount)
    }
    /* End Ticket */

    /* Start Close */
    pub fn close_entrants(ctx: Context<CloseEntrants>) -> Result<()> {
        handle_close_entrants(ctx)
    }
    /* End Close */
}

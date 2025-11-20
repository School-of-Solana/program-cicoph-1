use crate::error::RaffleError;
use anchor_lang::prelude::*;

use crate::constants::ENTRANTS_SIZE;

#[account]
pub struct Raffle {
    pub authority: Pubkey,
    pub entrants: Pubkey,
    pub end_timestamp: i64,
    pub accumulated_fees: u64,
    pub ticket_lamports_price: u64,
    pub authority_fee_percent: u8,
    pub bump: u8,
    pub claimed_prizes: bool,
    pub randomness: Option<u32>,
}

#[account(zero_copy)]
pub struct Entrants {
    pub total: u32,
    pub max: u32,
    pub entrants: [Pubkey; ENTRANTS_SIZE as usize], // ENTRANTS_SIZE
}

impl Entrants {
    pub fn append(&mut self, entrant: Pubkey) -> Result<()> {
        if self.total >= self.max {
            return Err(error!(RaffleError::NotEnoughTicketsLeft));
        }
        self.entrants[self.total as usize] = entrant;
        self.total += 1;
        Ok(())
    }
}

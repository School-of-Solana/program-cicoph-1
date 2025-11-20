use anchor_lang::prelude::error_code;

#[error_code]
pub enum RaffleError {
    #[msg("Raffle has ended")]
    RaffleEnded,
    #[msg("Invalid prize index")]
    InvalidPrizeIndex,
    #[msg("Not enough tickets left")]
    NotEnoughTicketsLeft,
    #[msg("No prize")]
    NoPrize,
    #[msg("Invalid calculation")]
    InvalidCalculation,
    #[msg("End timestamp must be in the future")]
    InvalidEndTimestamp,
    #[msg("Ticket price must be greater than 0")]
    InvalidTicketPrice,
    #[msg("Max entrants must be greater than 0 and less than or equal to ENTRANTS_SIZE")]
    InvalidMaxEntrants,
    #[msg("Authority fee percent must be greater than 0 and less than or equal to 100")]
    InvalidAuthorityFeePercent,
    #[msg("Raffle is still running")]
    RaffleStillRunning,
    #[msg("Winner already drawn")]
    WinnersAlreadyDrawn,
    #[msg("Winner not drawn")]
    WinnerNotDrawn,
    #[msg("User is not winner")]
    NotWinner,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Prize not claimed")]
    PrizeNotClaimed,
    #[msg("Prize already claimed")]
    PrizeAlreadyClaimed,
}

# Project Description

**Deployed Frontend URL:** [TODO: Link to your deployed frontend]

**Solana Program ID Devnet:** Hvaz8KM81gTvnrYtEqYtbuTLJt7w2hBJRRRXgTXTN3E7

## Project Overview

### Description

A decentralized raffle (lottery) application built on Solana that enables users to create raffles, purchase tickets, and participate in fair prize draws. The system uses on-chain randomness derived from recent blockhashes to ensure transparent and verifiable winner selection. Each raffle has configurable parameters including ticket price, maximum entrants, end timestamp, and authority fee percentage. The program handles ticket purchases, accumulates fees for the raffle creator, selects winners using cryptographic randomness, and distributes prizes securely. This dApp demonstrates advanced Solana concepts including PDAs, zero-copy accounts for efficient storage and secure fund management.

### Key Features

- **Create Raffle**: Initialize a new raffle with customizable ticket price, maximum entrants, end timestamp, and authority fee percentage
- **Buy Tickets**: Purchase multiple raffle tickets with automatic fee calculation and distribution
- **Reveal Winners**: After the raffle ends, use on-chain randomness from recent blockhashes to select a winner fairly
- **Claim Prize**: Winners can claim their prize, with automatic distribution of accumulated fees to the raffle authority
- **Close Entrants**: After prize claiming, the raffle authority can close the entrants account to recover rent

### How to Use the dApp

1. **Connect Wallet** - Connect your Solana wallet to the dApp
2. **Create Raffle**
   - Set ticket price in lamports
   - Define maximum number of entrants (up to 1000)
   - Set end timestamp for when the raffle closes
   - Configure authority fee percentage (0-100%)
3. **Buy Tickets**:
   - Select a raffle that hasn't ended
   - Choose the number of tickets to purchase
   - Confirm transaction (fees are automatically deducted)
4. **Reveal Winners** (After raffle ends):
   - Wait for the raffle end timestamp plus a time buffer
   - Call reveal function to select winner using on-chain randomness
5. **Claim Prize** (Winner only):
   - If you're the winner, claim your prize
   - Prize amount = total raffle funds - rent exemption - accumulated fees
   - Authority fees are automatically transferred to the raffle creator
6. **Close Entrants** (Authority only):
   - After prize is claimed, close the entrants account to recover rent

## Program Architecture

The Raffle dApp uses a two-account architecture with PDAs for deterministic addressing and zero-copy accounts for efficient storage. The program leverages Solana's recent blockhashes sysvar to generate verifiable randomness, ensuring fair winner selection. Fee management is built into the ticket purchase flow, with automatic accumulation and distribution.

### PDA Usage

The program uses Program Derived Addresses to create deterministic raffle accounts linked to their entrants accounts.

**PDAs Used:**

- **Raffle PDA**: Derived from seeds `["raffle", entrants.key()]` - creates a unique raffle account for each entrants account, ensuring one-to-one relationship and allowing deterministic lookup

### Program Instructions

**Instructions Implemented:**

- **create_raffle**: Initializes a new raffle account with configurable parameters (end timestamp, ticket price, max entrants, authority fee percent). Validates all inputs and creates both the raffle PDA and entrants account.
- **buy_tickets**: Allows users to purchase multiple tickets. Calculates and deducts authority fees automatically, transfers remaining funds to raffle account, and adds buyer's public key to entrants array multiple times based on ticket quantity.
- **reveal_raffle_winners**: After raffle ends (with time buffer), uses recent blockhashes to generate randomness and select a winner index. Stores the winner index in the raffle account for prize claiming.
- **claim_raffle_prize**: Allows the winner to claim their prize. Validates winner identity, calculates prize amount (total - rent - fees), transfers prize to winner and accumulated fees to authority, then marks prize as claimed.
- **close_entrants**: Allows raffle authority to close the entrants account after prize is claimed, recovering rent. Validates that raffle has ended, winners are drawn, and prize is claimed before allowing closure.

### Account Structure

```rust
#[account]
pub struct Raffle {
    pub authority: Pubkey,              // The wallet that created this raffle
    pub entrants: Pubkey,                // Associated entrants account
    pub end_timestamp: i64,              // Unix timestamp when raffle ends
    pub accumulated_fees: u64,          // Total fees accumulated for authority
    pub ticket_lamports_price: u64,      // Price per ticket in lamports
    pub authority_fee_percent: u8,       // Fee percentage (0-100) for authority
    pub bump: u8,                        // PDA bump seed
    pub claimed_prizes: bool,            // Whether prize has been claimed
    pub randomness: Option<u32>,         // Winner index (set after reveal)
}

#[account(zero_copy)]
pub struct Entrants {
    pub total: u32,                      // Current number of entrants
    pub max: u32,                        // Maximum allowed entrants
    pub entrants: [Pubkey; 1000],        // Array of participant public keys
}
```

## Testing

### Test Coverage

Comprehensive test suite covering all instructions with extensive validation of both successful operations and error conditions to ensure program security, correctness, and proper fund handling.

**Happy Path Tests:**

- **Create Raffle**: Successfully creates a new raffle with correct initial values, validates all fields are set properly
- **Buy Tickets**: Properly adds entrants to array, calculates and accumulates fees correctly, transfers correct amount to raffle account
- **Buy Multiple Tickets**: Multiple users can buy tickets, total entrants count increases correctly
- **Reveal Raffle Winners**: After raffle ends, generates randomness and selects valid winner index within entrants range
- **Claim Raffle Prize**: Winner receives correct prize amount (total - rent - fees), authority receives accumulated fees, prize marked as claimed
- **Close Entrants**: After prize claimed, entrants account is closed and rent returned to authority

**Unhappy Path Tests:**

- **Create Raffle Invalid Parameters**:
  - Fails with ticket_price = 0
  - Fails with max_entrants = 0
  - Fails with max_entrants > ENTRANTS_SIZE (1000)
  - Fails with end_timestamp in the past
  - Fails with invalid authority_fee_percent
- **Buy Tickets Errors**:
  - Fails when raffle has ended
  - Fails when not enough tickets left (max entrants reached)
- **Reveal Winners Errors**:
  - Fails when raffle hasn't ended yet (needs time buffer)
  - Fails when winners already drawn
  - Fails when no entrants exist
- **Claim Prize Errors**:
  - Fails when winner not drawn yet
  - Fails when non-winner tries to claim
  - Fails when prize already claimed
  - Fails when no prize available
- **Close Entrants Errors**:
  - Fails when raffle still running
  - Fails when winners not drawn
  - Fails when prize not claimed
  - Fails when called by non-authority

### Running Tests

```bash
cd anchor_project/raffle
yarn install    # install dependencies
anchor test     # run tests
```

### Additional Notes for Evaluators

This raffle system implements several important Solana best practices:

1. **Zero-Copy Accounts**: The `Entrants` account uses `zero_copy` for efficient storage of large arrays, allowing up to 1000 participants without excessive account size overhead.

2. **Fee Management**: Authority fees are calculated and accumulated during ticket purchases, then distributed atomically during prize claiming. This ensures fees are always properly tracked and distributed.

3. **Security Validations**: Extensive input validation prevents invalid raffle creation, and state checks ensure operations happen in the correct sequence (raffle must end before revealing, winners must be drawn before claiming, etc.).

4. **Rent Management**: The `close_entrants` instruction allows recovery of rent after the raffle lifecycle completes, following Solana best practices for account lifecycle management.

5. **Deterministic Addressing**: Using PDAs ensures raffle accounts can be deterministically derived from their entrants account, simplifying lookup and preventing conflicts.

The program handles edge cases like overflow protection in calculations, proper rent exemption handling, and ensures all transfers are atomic and secure.

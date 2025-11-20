use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use arrayref::array_ref;
use solana_keccak_hasher::Hasher;

//https://docs.chain.link/docs/chainlink-vrf-best-practices/#getting-multiple-random-number

pub fn random(randomness: [u8; 32], n: u32) -> u32 {
    let mut hasher = Hasher::default();
    hasher.hash(&randomness);
    hasher.hash(&n.to_le_bytes());

    u32::from_le_bytes(
        hasher.result().to_bytes()[0..4]
            .try_into()
            .expect("slice with incorrect length"),
    )
}

pub fn recent_blockhashes(recent_blockhashes: &AccountInfo) -> Result<[u8; 32]> {
    let bytes: std::cell::Ref<'_, &mut [u8]> = recent_blockhashes.data.borrow();
    let mut entry_length: [u8; 8] = [0u8; 8];
    entry_length.copy_from_slice(&bytes[0..8]);
    if u64::from_le_bytes(entry_length) == 0 {
        // Impossible
        return Err(ProgramError::InvalidAccountData.into());
    }
    let mut last_blockhash: [u8; 32] = [0u8; 32];
    last_blockhash.copy_from_slice(&bytes[8..(8 + 32)]);
    Ok(last_blockhash)
}

pub fn _extract_random_number(recent_slothashes: &AccountInfo) -> Result<u32> {
    let data = recent_slothashes.data.borrow();
    let most_recent = array_ref![data, 12, 4];

    let clock = Clock::get()?;
    // seed for the random number is a combination of the slot_hash - timestamp
    let seed = u32::from_le_bytes(*most_recent).saturating_sub(clock.unix_timestamp as u32);

    Ok(seed)
}

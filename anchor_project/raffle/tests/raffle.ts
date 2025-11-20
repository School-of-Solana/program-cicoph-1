import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Raffle } from "../target/types/raffle";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, SYSVAR_RECENT_BLOCKHASHES_PUBKEY } from "@solana/web3.js";
import { expect } from "chai";

describe("raffle", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.raffle as Program<Raffle>;
  const provider = anchor.getProvider();

  let authority: Keypair;
  let buyer1: Keypair;
  let buyer2: Keypair;
  let entrants: Keypair;
  let raffle: PublicKey;

  const RAFFLE_SEED = "raffle";
  const ENTRANTS_SIZE = 1000;

  before(async () => {
    // Create keypairs for testing
    authority = Keypair.generate();
    buyer1 = Keypair.generate();
    buyer2 = Keypair.generate();
    entrants = Keypair.generate();

    // Airdrop SOL to accounts
    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    await provider.connection.requestAirdrop(authority.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(buyer1.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(buyer2.publicKey, airdropAmount);

    // Wait for airdrops to confirm
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it("Creates a raffle", async () => {
    // Set end timestamp to future (10 seconds from now)
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 10);
    const ticketPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL per ticket
    const maxEntrants = 100;
    const authorityFeePercent = 10; // 10% fee

    // Calculate space needed for Entrants account (zero_copy with AccountLoader adds 8-byte discriminator)
    // Entrants has: discriminator (8) + total (u32) + max (u32) + entrants array (Pubkey * ENTRANTS_SIZE)
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE); // discriminator + total + max + array

    // Create entrants account manually (required for zero constraint)
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: entrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );

    await provider.sendAndConfirm(createEntrantsTx, [authority, entrants]);

    // Derive raffle PDA
    [raffle] = PublicKey.findProgramAddressSync(
      [Buffer.from(RAFFLE_SEED), entrants.publicKey.toBuffer()],
      program.programId
    );

    // Build transaction and send with authority as fee payer
    const txBuilder = program.methods
      .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
      .accounts({
        authority: authority.publicKey,
        entrants: entrants.publicKey,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = authority.publicKey;
    tx.sign(authority);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Verify raffle account
    const raffleAccount = await program.account.raffle.fetch(raffle);
    expect(raffleAccount.authority.toString()).to.equal(authority.publicKey.toString());
    expect(raffleAccount.ticketLamportsPrice.toString()).to.equal(ticketPrice.toString());
    expect(raffleAccount.endTimestamp.toString()).to.equal(endTimestamp.toString());
    expect(raffleAccount.authorityFeePercent).to.equal(authorityFeePercent);
    expect(raffleAccount.accumulatedFees.toString()).to.equal("0");
    expect(raffleAccount.claimedPrizes).to.equal(false);
    expect(raffleAccount.randomness).to.be.null;
  });

  it("Fails to create raffle with ticket_price = 0", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 10);
    const ticketPrice = new anchor.BN(0); // Invalid: ticket price must be > 0
    const maxEntrants = 100;
    const authorityFeePercent = 10;

    // Create a new entrants account for this test
    const newEntrants = Keypair.generate();
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newEntrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createEntrantsTx, [authority, newEntrants]);

    try {
      await program.methods
        .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
        .accounts({
          authority: authority.publicKey,
          entrants: newEntrants.publicKey,
        })
        .signers([authority])
        .rpc();
      throw new Error("Should have failed with InvalidTicketPrice");
    } catch (error: any) {
      expect(error.error.errorMessage).to.include("Ticket price must be greater than 0");
    }
  });

  it("Fails to create raffle with max_entrants = 0", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 10);
    const ticketPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxEntrants = 0; // Invalid: max_entrants must be > 0
    const authorityFeePercent = 10;

    // Create a new entrants account for this test
    const newEntrants = Keypair.generate();
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newEntrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createEntrantsTx, [authority, newEntrants]);

    try {
      await program.methods
        .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
        .accounts({
          authority: authority.publicKey,
          entrants: newEntrants.publicKey,
        })
        .signers([authority])
        .rpc();
      throw new Error("Should have failed with InvalidMaxEntrants");
    } catch (error: any) {
      expect(error.error.errorMessage).to.include("Max entrants must be greater than 0");
    }
  });

  it("Fails to create raffle with max_entrants > ENTRANTS_SIZE", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 10);
    const ticketPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxEntrants = ENTRANTS_SIZE + 1; // Invalid: max_entrants > ENTRANTS_SIZE
    const authorityFeePercent = 10;

    // Create a new entrants account for this test
    const newEntrants = Keypair.generate();
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newEntrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createEntrantsTx, [authority, newEntrants]);

    try {
      await program.methods
        .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
        .accounts({
          authority: authority.publicKey,
          entrants: newEntrants.publicKey,
        })
        .signers([authority])
        .rpc();
      throw new Error("Should have failed with InvalidMaxEntrants");
    } catch (error: any) {
      expect(error.error.errorMessage).to.include("Max entrants must be greater than 0");
    }
  });

  it("Fails to create raffle with end_timestamp in the past", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 10); // Invalid: in the past
    const ticketPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxEntrants = 100;
    const authorityFeePercent = 10;

    // Create a new entrants account for this test
    const newEntrants = Keypair.generate();
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newEntrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createEntrantsTx, [authority, newEntrants]);

    try {
      await program.methods
        .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
        .accounts({
          authority: authority.publicKey,
          entrants: newEntrants.publicKey,
        })
        .signers([authority])
        .rpc();
      throw new Error("Should have failed with InvalidEndTimestamp");
    } catch (error: any) {
      expect(error.error.errorMessage).to.include("End timestamp must be in the future");
    }
  });

  it("Buys tickets with SOL", async () => {
    const ticketAmount = 3; // Buy 3 tickets
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const ticketPrice = raffleAccount.ticketLamportsPrice;
    const authorityFeePercent = raffleAccount.authorityFeePercent;
    const totalCost = ticketPrice.mul(new anchor.BN(ticketAmount));

    // Calculate expected authority fee: totalCost * authorityFeePercent / 100
    const expectedAuthorityFee = totalCost.mul(new anchor.BN(authorityFeePercent)).div(new anchor.BN(100));
    const expectedUserTicketPrice = totalCost.sub(expectedAuthorityFee);

    const buyer1BalanceBefore = await provider.connection.getBalance(buyer1.publicKey);
    const raffleBalanceBefore = await provider.connection.getBalance(raffle);
    const accumulatedFeesBefore = raffleAccount.accumulatedFees;

    // Build transaction and send with buyer1 as fee payer
    const txBuilder = program.methods
      .buyTickets(ticketAmount)
      .accounts({
        player: buyer1.publicKey,
        raffle: raffle,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer1.publicKey;
    tx.sign(buyer1);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Verify entrants were added
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);
    expect(entrantsAccount.total).to.equal(3);

    // Verify accumulated fees were updated
    const raffleAccountAfter = await program.account.raffle.fetch(raffle);
    const expectedAccumulatedFees = accumulatedFeesBefore.add(expectedAuthorityFee);
    expect(raffleAccountAfter.accumulatedFees.toString()).to.equal(expectedAccumulatedFees.toString());

    // Verify SOL was transferred to raffle account (only user_ticket_price, not total_cost)
    const buyer1BalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
    const raffleBalanceAfter = await provider.connection.getBalance(raffle);

    // Buyer should pay user_ticket_price (totalCost - authorityFee) plus transaction fees
    expect(buyer1BalanceBefore - buyer1BalanceAfter).to.be.at.least(expectedUserTicketPrice.toNumber());
    // Raffle should receive only user_ticket_price (totalCost - authorityFee)
    expect(raffleBalanceAfter - raffleBalanceBefore).to.equal(expectedUserTicketPrice.toNumber());
  });

  it("Buys more tickets from different buyer", async () => {
    const ticketAmount = 2; // Buy 2 more tickets
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const ticketPrice = raffleAccount.ticketLamportsPrice;
    const authorityFeePercent = raffleAccount.authorityFeePercent;
    const totalCost = ticketPrice.mul(new anchor.BN(ticketAmount));

    // Calculate expected authority fee: totalCost * authorityFeePercent / 100
    const expectedAuthorityFee = totalCost.mul(new anchor.BN(authorityFeePercent)).div(new anchor.BN(100));
    const expectedUserTicketPrice = totalCost.sub(expectedAuthorityFee);

    const buyer2BalanceBefore = await provider.connection.getBalance(buyer2.publicKey);
    const raffleBalanceBefore = await provider.connection.getBalance(raffle);
    const accumulatedFeesBefore = raffleAccount.accumulatedFees;

    // Build transaction and send with buyer2 as fee payer
    const txBuilder = program.methods
      .buyTickets(ticketAmount)
      .accounts({
        player: buyer2.publicKey,
        raffle: raffle,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer2.publicKey;
    tx.sign(buyer2);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Verify total entrants
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);
    expect(entrantsAccount.total).to.equal(5);

    // Verify accumulated fees were updated
    const raffleAccountAfter = await program.account.raffle.fetch(raffle);
    const expectedAccumulatedFees = accumulatedFeesBefore.add(expectedAuthorityFee);
    expect(raffleAccountAfter.accumulatedFees.toString()).to.equal(expectedAccumulatedFees.toString());

    // Verify SOL was transferred (only user_ticket_price)
    const raffleBalanceAfter = await provider.connection.getBalance(raffle);
    expect(raffleBalanceAfter - raffleBalanceBefore).to.equal(expectedUserTicketPrice.toNumber());
  });

  it("Fails to claim prize before winners are drawn", async () => {
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);

    // Verify that randomness is not set yet
    expect(raffleAccount.randomness).to.be.null;

    // Try to claim prize with buyer1 (one of the entrants)
    try {
      const txBuilder = program.methods
        .claimRafflePrize()
        .accounts({
          player: buyer1.publicKey,
          raffle: raffle,
          authority: authority.publicKey,
        });

      const tx = await txBuilder.transaction();
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = buyer1.publicKey;
      tx.sign(buyer1);

      const txSig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      });

      throw new Error("Should have failed with WinnerNotDrawn");
    } catch (error: any) {
      // Verify error is WinnerNotDrawn
      expect(error.message).to.include("Winner not drawn");
    }
  });

  it("Fails to close entrants account before winners are drawn", async () => {
    // Wait for raffle to end (end_timestamp + TIME_BUFFER)
    // Since we set end_timestamp to 10 seconds in the future, wait 12 seconds to be safe
    await new Promise((resolve) => setTimeout(resolve, 12000));

    // Verify that randomness is not set yet (winners not drawn)
    const raffleAccount = await program.account.raffle.fetch(raffle);
    expect(raffleAccount.randomness).to.be.null;

    // Try to close entrants account before winners are drawn
    try {
      const txBuilder = program.methods
        .closeEntrants()
        .accounts({
          raffle: raffle,
          authority: authority.publicKey,
        });

      const tx = await txBuilder.transaction();
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = authority.publicKey;
      tx.sign(authority);

      const txSig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      });

      throw new Error("Should have failed with WinnerNotDrawn");
    } catch (error: any) {
      // Verify error is WinnerNotDrawn
      expect(error.message).to.include("Winner not drawn");
    }
  });

  it("Reveals raffle winners", async () => {
    // Raffle has already ended from previous test, no need to wait again

    const tx = await program.methods
      .revealRaffleWinners()
      .accounts({
        raffle: raffle,
        entrants: entrants.publicKey,
      })
      .rpc();

    // Verify randomness (winner index) was set
    const raffleAccount = await program.account.raffle.fetch(raffle);
    expect(raffleAccount.randomness).to.not.be.null;
    expect(typeof raffleAccount.randomness).to.equal("number");
    expect(raffleAccount.randomness).to.be.at.least(0);
    expect(raffleAccount.randomness).to.be.below(5); // We have 5 total entrants
  });

  it("Fails to close entrants account before prize is claimed", async () => {
    // Winners have been drawn in "Reveals raffle winners" test
    // But prize has not been claimed yet
    const raffleAccount = await program.account.raffle.fetch(raffle);
    expect(raffleAccount.randomness).to.not.be.null;
    expect(raffleAccount.claimedPrizes).to.equal(false);

    // Try to close entrants account before prize is claimed
    try {
      const txBuilder = program.methods
        .closeEntrants()
        .accounts({
          raffle: raffle,
          authority: authority.publicKey,
        });

      const tx = await txBuilder.transaction();
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = authority.publicKey;
      tx.sign(authority);

      const txSig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      });

      throw new Error("Should have failed with PrizeNotClaimed");
    } catch (error: any) {
      // Verify error is PrizeNotClaimed
      expect(error.message).to.include("Prize not claimed");
    }
  });

  it("Fails to claim prize as non-winner", async () => {
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);

    // randomness now contains the winner index directly
    const winnerIndex = raffleAccount.randomness;
    if (winnerIndex === null || winnerIndex === undefined) {
      throw new Error("Winner index not set");
    }

    // Get the winner's public key from the entrants array
    const winnerPubkey = new PublicKey(entrantsAccount.entrants[winnerIndex]);

    // Determine which keypair is NOT the winner
    let nonWinner: Keypair;
    if (winnerPubkey.toString() === buyer1.publicKey.toString()) {
      // Winner is buyer1, so non-winner is buyer2
      nonWinner = buyer2;
    } else if (winnerPubkey.toString() === buyer2.publicKey.toString()) {
      // Winner is buyer2, so non-winner is buyer1
      nonWinner = buyer1;
    } else {
      throw new Error(`Winner at index ${winnerIndex} is not one of our test buyers`);
    }

    // Try to claim prize with non-winner
    try {
      const txBuilder = program.methods
        .claimRafflePrize()
        .accounts({
          player: nonWinner.publicKey,
          raffle: raffle,
          authority: authority.publicKey,
        });

      const tx = await txBuilder.transaction();
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = nonWinner.publicKey;
      tx.sign(nonWinner);

      const txSig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      });

      throw new Error("Should have failed with NotWinner");
    } catch (error: any) {
      // Verify error is NotWinner
      expect(error.message).to.include("User is not winner");
    }
  });

  it("Claims raffle prize", async () => {
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);

    // randomness now contains the winner index directly
    const winnerIndex = raffleAccount.randomness;
    if (winnerIndex === null || winnerIndex === undefined) {
      throw new Error("Winner index not set");
    }

    // Get the winner's public key from the entrants array
    const winnerPubkey = new PublicKey(entrantsAccount.entrants[winnerIndex]);

    // Determine which keypair to use
    let winner: Keypair | null = null;
    if (winnerPubkey.toString() === buyer1.publicKey.toString()) {
      winner = buyer1;
    } else if (winnerPubkey.toString() === buyer2.publicKey.toString()) {
      winner = buyer2;
    } else {
      throw new Error(`Winner at index ${winnerIndex} is not one of our test buyers`);
    }

    const winnerBalanceBefore = await provider.connection.getBalance(winner.publicKey);
    const authorityBalanceBefore = await provider.connection.getBalance(authority.publicKey);
    const raffleBalanceBefore = await provider.connection.getBalance(raffle);
    const accumulatedFees = raffleAccount.accumulatedFees;

    // Calculate expected prize: total_lamports - rent_minimum - accumulated_fees
    // Raffle account size: 8 (discriminator) + 128 (data) = 136 bytes
    const raffleAccountSize = 8 + 128; // From create_raffle.rs space = 8 + 128
    const rentExemptMinimum = await provider.connection.getMinimumBalanceForRentExemption(raffleAccountSize);
    const expectedPrize = raffleBalanceBefore - rentExemptMinimum - accumulatedFees.toNumber();

    // Build transaction and send with winner as fee payer
    const txBuilder = program.methods
      .claimRafflePrize()
      .accounts({
        player: winner.publicKey,
        raffle: raffle,
        authority: authority.publicKey,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = winner.publicKey;
    tx.sign(winner);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Verify prize was claimed
    const raffleAccountAfter = await program.account.raffle.fetch(raffle);
    expect(raffleAccountAfter.claimedPrizes).to.equal(true);

    // Verify SOL was transferred to winner (prize)
    const winnerBalanceAfter = await provider.connection.getBalance(winner.publicKey);
    const winnerReceived = winnerBalanceAfter - winnerBalanceBefore;
    expect(winnerReceived).to.be.greaterThan(0);
    // Winner should receive approximately the expected prize (accounting for transaction fees)
    expect(winnerReceived).to.be.closeTo(expectedPrize, 10000); // Allow 0.00001 SOL difference for fees

    // Verify accumulated fees were transferred to authority
    const authorityBalanceAfter = await provider.connection.getBalance(authority.publicKey);
    const authorityReceived = authorityBalanceAfter - authorityBalanceBefore;
    expect(authorityReceived).to.be.greaterThan(0);
    // Authority should receive the accumulated fees (accounting for transaction fees)
    expect(authorityReceived).to.be.closeTo(accumulatedFees.toNumber(), 10000); // Allow 0.00001 SOL difference for fees

    // Verify raffle balance is now only rent_exempt_minimum
    const raffleBalanceAfter = await provider.connection.getBalance(raffle);
    expect(raffleBalanceAfter).to.be.closeTo(rentExemptMinimum, 1000); // Allow small difference
  });

  it("Fails to claim prize again after already claimed", async () => {
    const raffleAccount = await program.account.raffle.fetch(raffle);
    const entrantsAccount = await program.account.entrants.fetch(entrants.publicKey);

    // Verify that prize was already claimed
    expect(raffleAccount.claimedPrizes).to.equal(true);

    // Get the winner's public key
    const winnerIndex = raffleAccount.randomness;
    if (winnerIndex === null || winnerIndex === undefined) {
      throw new Error("Winner index not set");
    }

    const winnerPubkey = new PublicKey(entrantsAccount.entrants[winnerIndex]);

    // Determine which keypair is the winner
    let winner: Keypair | null = null;
    if (winnerPubkey.toString() === buyer1.publicKey.toString()) {
      winner = buyer1;
    } else if (winnerPubkey.toString() === buyer2.publicKey.toString()) {
      winner = buyer2;
    } else {
      throw new Error(`Winner at index ${winnerIndex} is not one of our test buyers`);
    }

    // Try to claim prize again with the same winner
    try {
      const txBuilder = program.methods
        .claimRafflePrize()
        .accounts({
          player: winner.publicKey,
          raffle: raffle,
          authority: authority.publicKey,
        });

      const tx = await txBuilder.transaction();
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = winner.publicKey;
      tx.sign(winner);

      const txSig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction({
        signature: txSig,
        blockhash,
        lastValidBlockHeight,
      });

      throw new Error("Should have failed with PrizeAlreadyClaimed");
    } catch (error: any) {
      // Verify error is PrizeAlreadyClaimed
      expect(error.message).to.include("Prize already claimed");
    }
  });

  it("Fails to close entrants account before raffle ends", async () => {
    // Create a new raffle for this test
    const newEntrants = Keypair.generate();
    const entrantsSpace = 8 + 4 + 4 + (32 * ENTRANTS_SIZE);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(entrantsSpace);
    const createEntrantsTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newEntrants.publicKey,
        lamports: lamports,
        space: entrantsSpace,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createEntrantsTx, [authority, newEntrants]);

    const [newRaffle] = PublicKey.findProgramAddressSync(
      [Buffer.from(RAFFLE_SEED), newEntrants.publicKey.toBuffer()],
      program.programId
    );

    // Create raffle with end timestamp in the future (60 seconds from now)
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 60);
    const ticketPrice = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const maxEntrants = 100;
    const authorityFeePercent = 10;

    const txBuilder = program.methods
      .createRaffle(endTimestamp, ticketPrice, maxEntrants, authorityFeePercent)
      .accounts({
        authority: authority.publicKey,
        entrants: newEntrants.publicKey,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = authority.publicKey;
    tx.sign(authority);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Try to close entrants account before raffle ends
    try {
      const closeTxBuilder = program.methods
        .closeEntrants()
        .accounts({
          raffle: newRaffle,
          authority: authority.publicKey,
        });

      const closeTx = await closeTxBuilder.transaction();
      const { blockhash: closeBlockhash, lastValidBlockHeight: closeLastValidBlockHeight } = await provider.connection.getLatestBlockhash();
      closeTx.recentBlockhash = closeBlockhash;
      closeTx.feePayer = authority.publicKey;
      closeTx.sign(authority);

      const closeTxSig = await provider.connection.sendRawTransaction(closeTx.serialize());
      await provider.connection.confirmTransaction({
        signature: closeTxSig,
        blockhash: closeBlockhash,
        lastValidBlockHeight: closeLastValidBlockHeight,
      });

      throw new Error("Should have failed with RaffleStillRunning");
    } catch (error: any) {
      // Verify error is RaffleStillRunning
      expect(error.message).to.include("Raffle is still running");
    }
  });

  it("Closes entrants account", async () => {
    const authorityBalanceBefore = await provider.connection.getBalance(authority.publicKey);

    // Build transaction and send with authority as fee payer
    const txBuilder = program.methods
      .closeEntrants()
      .accounts({
        raffle: raffle,
        authority: authority.publicKey,
      });

    const tx = await txBuilder.transaction();
    const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = authority.publicKey;
    tx.sign(authority);

    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    await provider.connection.confirmTransaction({
      signature: txSig,
      blockhash,
      lastValidBlockHeight,
    });

    // Verify entrants account was closed (balance returned to authority)
    const authorityBalanceAfter = await provider.connection.getBalance(authority.publicKey);

    // Authority should receive the rent back (minus transaction fees)
    expect(authorityBalanceAfter).to.be.greaterThan(authorityBalanceBefore);

    // Verify entrants account no longer exists
    try {
      await program.account.entrants.fetch(entrants.publicKey);
      throw new Error("Entrants account should have been closed");
    } catch (error: any) {
      // Anchor returns "Account does not exist or has no data" when account is closed
      expect(error.message).to.include("does not exist");
    }
  });
});

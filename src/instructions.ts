import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { IX_DISCRIMINATOR, QUOTE_DEADLINE_SLOTS, TOKEN_PROGRAM_ID } from './constants.js';
import { deriveAuthority, deriveCreatorFeeVault, deriveVault, deriveYeetFeeVault } from './pda.js';
import type { Pool } from './types.js';

/** Compute a swap's `deadline_slot` from the current slot. */
export function computeDeadlineSlot(currentSlot: number | bigint): bigint {
  return BigInt(currentSlot) + BigInt(QUOTE_DEADLINE_SLOTS);
}

interface SwapAccountsParams {
  programId: PublicKey;
  pool: Pool;
  user: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
}

/** Build the fixed 12-account list shared by swap_base_in / swap_base_out. */
function buildSwapKeys(p: SwapAccountsParams) {
  const pool = p.pool.address;
  const authority = deriveAuthority(p.programId, pool);
  // vault_a/vault_b are the pool's two reserve vaults in A/B order, regardless
  // of swap direction; the program reads direction from the mint accounts.
  const vaultA = deriveVault(p.programId, pool, p.pool.tokenMintA);
  const vaultB = deriveVault(p.programId, pool, p.pool.tokenMintB);
  // Fees are charged on the INPUT token, so the fee vaults key on the input mint.
  const creatorFeeVault = deriveCreatorFeeVault(p.programId, pool, p.inputMint);
  const yeetFeeVault = deriveYeetFeeVault(p.programId, pool, p.inputMint);
  const userSource = getAssociatedTokenAddressSync(p.inputMint, p.user, true);
  const userDestination = getAssociatedTokenAddressSync(p.outputMint, p.user, true);

  return [
    { pubkey: p.user, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: userSource, isSigner: false, isWritable: true },
    { pubkey: userDestination, isSigner: false, isWritable: true },
    { pubkey: creatorFeeVault, isSigner: false, isWritable: true },
    { pubkey: yeetFeeVault, isSigner: false, isWritable: true },
    { pubkey: p.inputMint, isSigner: false, isWritable: false },
    { pubkey: p.outputMint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

export interface SwapBaseInParams extends SwapAccountsParams {
  /** Raw input amount. */
  amountIn: bigint;
  /** Minimum acceptable raw output (slippage floor). */
  minAmountOut: bigint;
  /** Transaction reverts if it lands after this slot. Use computeDeadlineSlot(). */
  deadlineSlot: bigint;
  /** Reserves the quote was computed against (stale-quote guard, STALE_Q/6028). */
  quotedReserveA: bigint;
  quotedReserveB: bigint;
}

/**
 * Build a `swap_base_in` instruction (exact-in): spend `amountIn` of `inputMint`,
 * receive at least `minAmountOut` of `outputMint`. This is the `buy`/`sell`
 * primitive — buy = quote→base, sell = base→quote.
 */
export function buildSwapBaseInInstruction(p: SwapBaseInParams): TransactionInstruction {
  const data = Buffer.alloc(48);
  IX_DISCRIMINATOR.swapBaseIn.copy(data, 0);
  data.writeBigUInt64LE(p.amountIn, 8);
  data.writeBigUInt64LE(p.minAmountOut, 16);
  data.writeBigUInt64LE(p.deadlineSlot, 24);
  data.writeBigUInt64LE(p.quotedReserveA, 32);
  data.writeBigUInt64LE(p.quotedReserveB, 40);
  return new TransactionInstruction({ programId: p.programId, keys: buildSwapKeys(p), data });
}

export interface SwapBaseOutParams extends SwapAccountsParams {
  /** Maximum raw input the caller will spend (slippage ceiling). */
  maxAmountIn: bigint;
  /** Exact raw output desired. */
  amountOut: bigint;
  deadlineSlot: bigint;
  quotedReserveA: bigint;
  quotedReserveB: bigint;
}

/**
 * Build a `swap_base_out` instruction (exact-out): receive exactly `amountOut`
 * of `outputMint`, spending at most `maxAmountIn` of `inputMint`.
 */
export function buildSwapBaseOutInstruction(p: SwapBaseOutParams): TransactionInstruction {
  const data = Buffer.alloc(48);
  IX_DISCRIMINATOR.swapBaseOut.copy(data, 0);
  data.writeBigUInt64LE(p.maxAmountIn, 8);
  data.writeBigUInt64LE(p.amountOut, 16);
  data.writeBigUInt64LE(p.deadlineSlot, 24);
  data.writeBigUInt64LE(p.quotedReserveA, 32);
  data.writeBigUInt64LE(p.quotedReserveB, 40);
  return new TransactionInstruction({ programId: p.programId, keys: buildSwapKeys(p), data });
}

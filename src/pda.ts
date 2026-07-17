import { PublicKey } from '@solana/web3.js';
import { SEEDS } from './constants.js';

/**
 * Sort two mints into the canonical `(a, b)` order the pool PDA is keyed on.
 * Invariant: `token_mint_a < token_mint_b` by raw 32-byte comparison.
 */
export function sortMints(x: PublicKey, y: PublicKey): [PublicKey, PublicKey] {
  return Buffer.compare(x.toBuffer(), y.toBuffer()) <= 0 ? [x, y] : [y, x];
}

/** Derive the canonical pool PDA for a mint pair (order-independent input). */
export function derivePool(programId: PublicKey, mintX: PublicKey, mintY: PublicKey): PublicKey {
  const [a, b] = sortMints(mintX, mintY);
  return PublicKey.findProgramAddressSync(
    [SEEDS.pool, a.toBuffer(), b.toBuffer()],
    programId,
  )[0];
}

/** Derive the pool's authority PDA (owns the vaults). */
export function deriveAuthority(programId: PublicKey, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.authority, pool.toBuffer()], programId)[0];
}

/** Derive a reserve vault PDA for a given mint. */
export function deriveVault(programId: PublicKey, pool: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.vault, pool.toBuffer(), mint.toBuffer()],
    programId,
  )[0];
}

/** Derive the LP mint PDA. */
export function deriveLpMint(programId: PublicKey, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.lpMint, pool.toBuffer()], programId)[0];
}

/**
 * Derive the creator fee vault PDA. Fees are charged on the swap INPUT, so this
 * is keyed on the input mint of the swap being built.
 */
export function deriveCreatorFeeVault(programId: PublicKey, pool: PublicKey, inputMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.feeVault, pool.toBuffer(), inputMint.toBuffer()],
    programId,
  )[0];
}

/** Derive the protocol (yeet) fee vault PDA — also keyed on the swap input mint. */
export function deriveYeetFeeVault(programId: PublicKey, pool: PublicKey, inputMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEEDS.yeetFeeVault, pool.toBuffer(), inputMint.toBuffer()],
    programId,
  )[0];
}

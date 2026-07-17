import { PublicKey } from '@solana/web3.js';

/**
 * YeetAMM program IDs. The same program runs both DBC (bonding-curve) and AMM
 * modes; there is no separate DBC program.
 */
export const YEET_AMM_PROGRAM_ID = {
  mainnet: new PublicKey('yeetaecvxpd7DFzZAYTEYracRt1WYJ7DfMVjEeEt2Cp'),
  devnet: new PublicKey('yeetMcJ7nBfMZiQV8ns4h5m3WeVekT1ySq27bMWWfio'),
} as const;

export type Cluster = 'mainnet' | 'devnet';

/** Wrapped SOL — the quote mint for every YeetLaunch token market. */
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/** SPL Token program. */
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** PDA seeds (must match programs/yeet-amm/src/seeds.rs). */
export const SEEDS = {
  pool: Buffer.from('yeet_amm_pool'),
  authority: Buffer.from('authority'),
  vault: Buffer.from('vault'),
  lpMint: Buffer.from('lp_mint'),
  feeVault: Buffer.from('fee_vault'),
  yeetFeeVault: Buffer.from('yeet_fee_vault'),
} as const;

/** Anchor account discriminator for the `Pool` account (`sha256("account:Pool")[0..8]`). */
export const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

/**
 * Total on-chain size of a `Pool` account: 8-byte discriminator + 585-byte body
 * (Pool::INIT_SPACE). The body holds 577 bytes of fields + 8 reserved trailing
 * bytes. This is the value to use for a getProgramAccounts `dataSize` filter.
 */
export const POOL_ACCOUNT_SIZE = 593;

/** Anchor instruction discriminators (`sha256("global:<ix>")[0..8]`). */
export const IX_DISCRIMINATOR = {
  swapBaseIn: Buffer.from([42, 236, 72, 162, 242, 24, 39, 84]),
  swapBaseOut: Buffer.from([163, 210, 155, 208, 175, 146, 213, 150]),
} as const;

/** Pool operating mode. */
export const POOL_MODE = { DBC: 0, AMM: 1 } as const;

/** Total swap fee — hard-enforced on-chain; pools cannot exist at any other value. */
export const TOTAL_FEE_BPS = 100;

/**
 * Slots added to the observed slot to form a swap's `deadline_slot`. Matches the
 * protocol's quote-freshness window. The transaction reverts (EXPIRED / 6027) if
 * it lands after this deadline.
 */
export const QUOTE_DEADLINE_SLOTS = 150;

/** Default public REST API base. Serves quotes, launches, and mirrored pool data. */
export const DEFAULT_API_BASE_URL = 'https://api.yeetlaunch.io';

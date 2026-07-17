import type { PublicKey } from '@solana/web3.js';

/** Operating mode of a pool. `DBC` = bonding curve, `AMM` = graduated. */
export type PoolMode = 'DBC' | 'AMM';

/**
 * Decoded YeetAMM `Pool` account. All token amounts are raw base units (bigint).
 * This is the on-chain source of truth for reserves, mode, and lifecycle state.
 */
export interface Pool {
  /** Pool PDA address. */
  address: PublicKey;
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  lpMint: PublicKey;
  creator: PublicKey;
  /** Raw reserve of token A. */
  reserveA: bigint;
  /** Raw reserve of token B. */
  reserveB: bigint;
  /** Total swap fee in bps (100 = 1.00%). */
  feeBps: number;
  lpSupply: bigint;
  lockedLpAmount: bigint;
  vestingLpAmount: bigint;
  vestingReleased: bigint;
  isInitialized: boolean;
  mode: PoolMode;
  /** Quote level that triggers graduation; 0 for a pure AMM pool. */
  gradThreshold: bigint;
  /** Slot the pool graduated to AMM; 0 if not graduated. */
  gradSlot: bigint;
  /** The pool's quote mint (wSOL for YeetLaunch markets). */
  quoteMint: PublicKey;
  virtualReserveA: bigint;
  virtualReserveB: bigint;
  creationSlot: bigint;
}

/** SPL token metadata for a market's base token (from the YeetLaunch API). */
export interface Token {
  mint: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  imageUrl?: string | null;
  poolAddress?: string | null;
}

/**
 * A price quote for a swap, produced by the YeetLaunch API (the SDK does not
 * compute pricing locally). `quotedReserveA/B` capture the pool state the quote
 * was computed against and MUST be passed back into the swap for the on-chain
 * stale-quote guard (STALE_Q / 6028).
 */
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  /** Raw input amount. */
  amountIn: bigint;
  /** Estimated raw output amount at the quoted state. */
  amountOut: bigint;
  /** Price impact percent (unsigned magnitude), if the API returns it. */
  priceImpactPct?: number;
  /** Total fee bps applied (100). */
  feeBps: number;
  /** Pool state the quote was computed against — required by the swap builder. */
  quotedReserveA: bigint;
  quotedReserveB: bigint;
  /** Route label, always "YeetAMM" for a native market. */
  route: string;
}

/** Alias kept for API symmetry — `Quote` and `SwapQuote` are the same shape. */
export type Quote = SwapQuote;

/** Graduation progress toward the DBC → AMM transition. */
export interface GraduationProgress {
  mode: PoolMode;
  graduated: boolean;
  /** Raw quote reserve currently in the curve. */
  quoteReserve: bigint;
  /** Raw quote threshold that triggers graduation (0 if pure AMM). */
  gradThreshold: bigint;
  /** 0–100, clamped; 100 only when actually graduated. */
  percent: number;
}

/** Creator of a launch. */
export interface Creator {
  wallet: string;
  /** Launches created by this wallet, if the API returns them. */
  launchCount?: number;
}

/** Creator fee accounting for a market (values in raw lamports/base units). */
export interface CreatorFees {
  mint: string;
  creator: string;
  /** Claimable creator fees, native SOL side, in lamports. */
  claimableLamports: bigint;
}

/**
 * v1 liquidity/vesting snapshot for a graduated market (mirrors the YeetLaunch
 * API `trading.liquidity` object).
 */
export interface Liquidity {
  model: 'v1' | 'v2';
  protocolLockedPct: number;
  lockedValueSol: string | null;
  vestedPct: number;
  daysSinceGraduation: number;
  creator: {
    heldPct: number | null;
    removedPct: number;
    withdrew: boolean;
  };
}

/** A token launch listed by the YeetLaunch API. */
export interface Launch {
  mint: string;
  name: string | null;
  symbol: string | null;
  poolAddress: string | null;
  mode: PoolMode;
  createdAt?: string;
}

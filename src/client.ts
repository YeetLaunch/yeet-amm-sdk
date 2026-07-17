import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  DEFAULT_API_BASE_URL,
  WSOL_MINT,
  YEET_AMM_PROGRAM_ID,
  type Cluster,
} from './constants.js';
import { decodePool } from './decode.js';
import { derivePool, deriveCreatorFeeVault } from './pda.js';
import {
  buildSwapBaseInInstruction,
  buildSwapBaseOutInstruction,
  computeDeadlineSlot,
  type SwapBaseInParams,
  type SwapBaseOutParams,
} from './instructions.js';
import { RestClient, type RestClientOptions, type PoolSnapshot } from './rest.js';
import type {
  Creator,
  CreatorFees,
  GraduationProgress,
  Launch,
  Liquidity,
  Pool,
  SwapQuote,
  Token,
} from './types.js';

export interface YeetAmmClientOptions {
  connection: Connection;
  cluster?: Cluster;
  /** Override the program id (defaults to the cluster's canonical id). */
  programId?: PublicKey;
  /** REST options (base URLs, custom fetch). */
  rest?: RestClientOptions;
}

export interface SwapBuildResult {
  /**
   * Ordered instructions for a turnkey swap. For a buy (wSOL in) this wraps SOL
   * (create wSOL ATA if needed + transfer + syncNative) before the swap; for a
   * sell (wSOL out) it appends a closeAccount so the user receives native SOL,
   * never wrapped SOL. Mirrors the yeetlaunch.io production swap path.
   */
  instructions: TransactionInstruction[];
  quote: SwapQuote;
  pool: Pool;
}

/**
 * High-level YeetAMM client. Reads pool state on-chain, fetches quotes from the
 * YeetLaunch API (no local curve math), and builds swap instructions.
 *
 * NOTE on wrapped SOL: buy/sell use wSOL as the quote side. Callers are
 * responsible for wrapping SOL into the wSOL ATA before a buy (create ATA +
 * transfer lamports + syncNative) and, if desired, closing it after a sell to
 * unwrap. The returned instruction is the swap itself.
 */
export class YeetAmmClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly rest: RestClient;

  constructor(opts: YeetAmmClientOptions) {
    this.connection = opts.connection;
    const cluster = opts.cluster ?? 'mainnet';
    this.programId = opts.programId ?? YEET_AMM_PROGRAM_ID[cluster];
    this.rest = new RestClient({ apiBaseUrl: DEFAULT_API_BASE_URL, ...opts.rest });
  }

  // ── Reads (on-chain) ──────────────────────────────────────────────

  /** Fetch and decode a pool by its PDA address. Returns null if not found. */
  async getPool(poolAddress: PublicKey): Promise<Pool | null> {
    const info = await this.connection.getAccountInfo(poolAddress);
    if (!info) return null;
    if (!info.owner.equals(this.programId)) {
      throw new Error(`getPool: ${poolAddress.toBase58()} is not owned by YeetAMM`);
    }
    return decodePool(poolAddress, info.data);
  }

  /** Derive and fetch the canonical pool for a base mint (quoted in wSOL). */
  getPoolByMint(mint: PublicKey): Promise<Pool | null> {
    return this.getPool(this.derivePoolAddress(mint));
  }

  /** Derive the canonical wSOL-quoted pool PDA for a base mint. */
  derivePoolAddress(mint: PublicKey): PublicKey {
    return derivePool(this.programId, mint, WSOL_MINT);
  }

  // ── Quote (server-computed) ───────────────────────────────────────

  /**
   * Get a server-computed quote and pair it with the on-chain reserves the swap
   * must be built against (stale-quote guard). Amount is raw base units.
   */
  async quote(params: {
    inputMint: PublicKey;
    outputMint: PublicKey;
    amountIn: bigint;
    slippageBps: number;
    pool?: Pool;
  }): Promise<SwapQuote> {
    const baseMint = params.inputMint.equals(WSOL_MINT) ? params.outputMint : params.inputMint;
    const pool = params.pool ?? (await this.getPoolByMint(baseMint));
    if (!pool) throw new Error('quote: pool not found for the given mint pair');

    const raw = await this.rest.getSwapQuote({
      inputMint: params.inputMint.toBase58(),
      outputMint: params.outputMint.toBase58(),
      amount: params.amountIn,
      slippageBps: params.slippageBps,
    });

    return {
      inputMint: raw.inputMint,
      outputMint: raw.outputMint,
      amountIn: BigInt(raw.inputAmount),
      amountOut: BigInt(raw.outputAmount),
      priceImpactPct: raw.priceImpactPct,
      feeBps: pool.feeBps,
      quotedReserveA: pool.reserveA,
      quotedReserveB: pool.reserveB,
      route: 'YeetAMM',
    };
  }

  // ── Swap building ─────────────────────────────────────────────────

  /** Build a buy: spend `amountInLamports` of wSOL for `mint`. */
  async buy(params: {
    mint: PublicKey;
    amountInLamports: bigint;
    slippageBps: number;
    user: PublicKey;
    currentSlot?: number;
    pool?: Pool;
    /** Keep the wSOL ATA alive instead of closing it after the swap (bots/MMs). Default false. */
    keepWSolAta?: boolean;
  }): Promise<SwapBuildResult> {
    return this.buildExactIn({
      inputMint: WSOL_MINT,
      outputMint: params.mint,
      amountIn: params.amountInLamports,
      slippageBps: params.slippageBps,
      user: params.user,
      currentSlot: params.currentSlot,
      pool: params.pool,
      keepWSolAta: params.keepWSolAta,
    });
  }

  /** Build a sell: spend `amountInTokens` (raw base units) of `mint` for wSOL. */
  async sell(params: {
    mint: PublicKey;
    amountInTokens: bigint;
    slippageBps: number;
    user: PublicKey;
    currentSlot?: number;
    pool?: Pool;
    /** Keep the received wSOL instead of unwrapping to native SOL (bots/MMs). Default false. */
    keepWSolAta?: boolean;
  }): Promise<SwapBuildResult> {
    return this.buildExactIn({
      inputMint: params.mint,
      outputMint: WSOL_MINT,
      amountIn: params.amountInTokens,
      slippageBps: params.slippageBps,
      user: params.user,
      currentSlot: params.currentSlot,
      pool: params.pool,
      keepWSolAta: params.keepWSolAta,
    });
  }

  private async buildExactIn(params: {
    inputMint: PublicKey;
    outputMint: PublicKey;
    amountIn: bigint;
    slippageBps: number;
    user: PublicKey;
    currentSlot?: number;
    pool?: Pool;
    keepWSolAta?: boolean;
  }): Promise<SwapBuildResult> {
    const baseMint = params.inputMint.equals(WSOL_MINT) ? params.outputMint : params.inputMint;
    const pool = params.pool ?? (await this.getPoolByMint(baseMint));
    if (!pool) throw new Error('buildExactIn: pool not found');

    const quote = await this.quote({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountIn: params.amountIn,
      slippageBps: params.slippageBps,
      pool,
    });

    const minAmountOut = applySlippage(quote.amountOut, params.slippageBps);
    const slot = params.currentSlot ?? (await this.connection.getSlot());
    const { user, inputMint, outputMint, amountIn } = params;

    const userSource = getAssociatedTokenAddressSync(inputMint, user, true);
    const userDestination = getAssociatedTokenAddressSync(outputMint, user, true);

    // Existence checks so we only create ATAs that are actually missing.
    const [srcInfo, dstInfo] = await Promise.all([
      this.connection.getAccountInfo(userSource),
      this.connection.getAccountInfo(userDestination),
    ]);

    const instructions: TransactionInstruction[] = [];

    // Ensure the output ATA exists (e.g. the token ATA on a buy, or a wSOL ATA
    // on a sell if the user has none yet).
    if (!dstInfo) {
      instructions.push(createAssociatedTokenAccountInstruction(user, userDestination, user, outputMint));
    }

    // Buy: wrap SOL into the wSOL source ATA (create if needed + fund + sync).
    if (inputMint.equals(WSOL_MINT)) {
      if (!srcInfo) {
        instructions.push(createAssociatedTokenAccountInstruction(user, userSource, user, inputMint));
      }
      instructions.push(
        SystemProgram.transfer({ fromPubkey: user, toPubkey: userSource, lamports: amountIn }),
        createSyncNativeInstruction(userSource),
      );
    }

    instructions.push(
      buildSwapBaseInInstruction({
        programId: this.programId,
        pool,
        user,
        inputMint,
        outputMint,
        amountIn,
        minAmountOut,
        deadlineSlot: computeDeadlineSlot(slot),
        quotedReserveA: pool.reserveA,
        quotedReserveB: pool.reserveB,
      }),
    );

    // Unless the caller opts to keep the wSOL ATA (bots/market makers avoiding
    // re-wrap churn), clean it up so the user deals only in native SOL:
    //  - sell: close the wSOL destination → user receives native SOL, not wrapped.
    //  - buy:  close the now-empty wSOL source → reclaim its rent, no residue.
    if (!params.keepWSolAta) {
      if (outputMint.equals(WSOL_MINT)) {
        instructions.push(createCloseAccountInstruction(userDestination, user, user));
      } else if (inputMint.equals(WSOL_MINT)) {
        instructions.push(createCloseAccountInstruction(userSource, user, user));
      }
    }

    return { instructions, quote, pool };
  }

  /** Turnkey buy as a ready-to-sign `Transaction` (wrap included, fresh blockhash). */
  async buildBuyTransaction(params: {
    mint: PublicKey;
    amountInLamports: bigint;
    slippageBps: number;
    user: PublicKey;
    currentSlot?: number;
    pool?: Pool;
    keepWSolAta?: boolean;
  }): Promise<{ transaction: Transaction; quote: SwapQuote; pool: Pool }> {
    return this.assemble(await this.buy(params), params.user);
  }

  /** Turnkey sell as a ready-to-sign `Transaction` (unwrap included, fresh blockhash). */
  async buildSellTransaction(params: {
    mint: PublicKey;
    amountInTokens: bigint;
    slippageBps: number;
    user: PublicKey;
    currentSlot?: number;
    pool?: Pool;
    keepWSolAta?: boolean;
  }): Promise<{ transaction: Transaction; quote: SwapQuote; pool: Pool }> {
    return this.assemble(await this.sell(params), params.user);
  }

  private async assemble(built: SwapBuildResult, feePayer: PublicKey) {
    const tx = new Transaction().add(...built.instructions);
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    return { transaction: tx, quote: built.quote, pool: built.pool };
  }

  /** Low-level exact-in instruction builder (injects this client's programId). */
  buildSwapBaseIn(p: Omit<SwapBaseInParams, 'programId'>): TransactionInstruction {
    return buildSwapBaseInInstruction({ ...p, programId: this.programId });
  }

  /** Low-level exact-out instruction builder (injects this client's programId). */
  buildSwapBaseOut(p: Omit<SwapBaseOutParams, 'programId'>): TransactionInstruction {
    return buildSwapBaseOutInstruction({ ...p, programId: this.programId });
  }

  // ── App API (rich snapshot) ───────────────────────────────────────

  /** Base-token metadata for a market. */
  async getToken(mint: PublicKey | string): Promise<Token> {
    const snap = await this.snapshot(mint);
    return {
      mint: snap.mintAddress,
      name: (snap.tokenName as string) ?? null,
      symbol: (snap.tokenSymbol as string) ?? null,
      decimals: snap.tokenDecimals,
      poolAddress: snap.poolAddress,
    };
  }

  /** DBC→AMM graduation progress (from the server snapshot). */
  async getGraduationProgress(mint: PublicKey | string): Promise<GraduationProgress> {
    const snap = await this.snapshot(mint);
    return {
      mode: snap.poolMode,
      graduated: snap.graduated || snap.isMigrated,
      quoteReserve: BigInt(snap.quoteReserve),
      gradThreshold: BigInt(Math.round(snap.gradThresholdSol * 1e9)),
      percent: clampPercent(snap.migrationProgress, snap.graduated || snap.isMigrated),
    };
  }

  /** v1 liquidity/vesting snapshot for a graduated market. */
  async getLiquidity(mint: PublicKey | string): Promise<Liquidity | null> {
    const snap = await this.snapshot(mint);
    return (snap.liquidity as Liquidity) ?? null;
  }

  /** Creator wallet for a market. */
  async getCreator(mint: PublicKey | string): Promise<Creator> {
    const snap = await this.snapshot(mint);
    return { wallet: snap.creator };
  }

  /**
   * Claimable creator fees for a market, read from the on-chain creator fee
   * vault on the wSOL (quote) side.
   */
  async getCreatorFees(mint: PublicKey): Promise<CreatorFees> {
    const pool = await this.getPoolByMint(mint);
    if (!pool) throw new Error('getCreatorFees: pool not found');
    const feeVault = deriveCreatorFeeVault(this.programId, pool.address, WSOL_MINT);
    let claimable = 0n;
    try {
      const bal = await this.connection.getTokenAccountBalance(feeVault);
      claimable = BigInt(bal.value.amount);
    } catch { /* vault may not exist pre-graduation */ }
    return { mint: mint.toBase58(), creator: pool.creator.toBase58(), claimableLamports: claimable };
  }

  /** List launches from the aggregator token index. */
  async getLaunches(): Promise<Launch[]> {
    const raw = (await this.rest.listTokens()) as { tokens?: unknown };
    const list = Array.isArray(raw?.tokens) ? raw.tokens : Array.isArray(raw) ? raw : [];
    return (list as Array<Record<string, unknown>>).map((t) => ({
      mint: String(t.mint ?? t.address ?? ''),
      name: (t.name as string) ?? null,
      symbol: (t.symbol as string) ?? null,
      poolAddress: (t.poolAddress as string) ?? (t.poolId as string) ?? null,
      mode: (t.kind === 'dbc' ? 'DBC' : 'AMM'),
    }));
  }

  private snapshot(mint: PublicKey | string): Promise<PoolSnapshot> {
    return this.rest.getPoolSnapshot(typeof mint === 'string' ? mint : mint.toBase58());
  }
}

/** Apply a bps slippage floor to an expected output amount. */
export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.floor(slippageBps))));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

function clampPercent(pct: number, graduated: boolean): number {
  if (graduated) return 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(99, pct));
}

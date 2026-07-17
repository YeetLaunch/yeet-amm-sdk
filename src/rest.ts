import { DEFAULT_API_BASE_URL } from './constants.js';

/** Default YeetLaunch app API (rich per-mint trading snapshot). */
export const DEFAULT_APP_BASE_URL = 'https://yeetlaunch.io';

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/** Raw server-computed quote (bigint fields arrive as decimal strings). */
export interface RawSwapQuote {
  quoteId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  slippageBps: number;
  suggestedSlippageBps?: number;
  totalFeeAmount: string;
  priceImpactPct: number;
}

/** Rich per-mint trading snapshot from the YeetLaunch app API. */
export interface PoolSnapshot {
  poolAddress: string;
  mintAddress: string;
  creator: string;
  poolMode: 'DBC' | 'AMM';
  graduated: boolean;
  isMigrated: boolean;
  baseReserve: string;
  quoteReserve: string;
  gradThresholdSol: number;
  migrationProgress: number;
  marketCapSol: number;
  priceInSol: string;
  tokenDecimals: number;
  sellCapEnabled: boolean;
  maxSellBaseRaw: string | null;
  adaptiveSellCapBps: number;
  liquidity: unknown;
  verification: unknown;
  [key: string]: unknown;
}

export interface RestClientOptions {
  /** ag-api base (quotes, pools, trades, tokens). Default https://api.yeetlaunch.io */
  apiBaseUrl?: string;
  /** YeetLaunch app API (per-mint snapshot). Default https://yeetlaunch.io */
  appBaseUrl?: string;
  /** Override fetch (Node <18, tests). Defaults to global fetch. */
  fetch?: FetchLike;
}

/**
 * Thin wrapper over the public YeetLaunch REST endpoints. All pricing comes from
 * the server; the SDK never computes curve math locally.
 */
export class RestClient {
  private readonly apiBaseUrl: string;
  private readonly appBaseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: RestClientOptions = {}) {
    this.apiBaseUrl = (opts.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
    this.appBaseUrl = (opts.appBaseUrl ?? DEFAULT_APP_BASE_URL).replace(/\/$/, '');
    const f = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) throw new Error('RestClient: no fetch available; pass options.fetch');
    this.fetchImpl = f;
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`GET ${url} → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return (await res.json()) as T;
  }

  /** Server-computed swap quote (exact-in). Amount is raw base units. */
  getSwapQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: bigint | string;
    slippageBps: number;
  }): Promise<RawSwapQuote> {
    const q = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: String(params.amount),
      slippageBps: String(params.slippageBps),
    });
    return this.getJson<RawSwapQuote>(`${this.apiBaseUrl}/quote?${q.toString()}`);
  }

  /** Rich per-mint trading snapshot (reserves, mode, progress, liquidity, verification). */
  async getPoolSnapshot(mint: string): Promise<PoolSnapshot> {
    const body = await this.getJson<{ data?: { trading?: PoolSnapshot } }>(
      `${this.appBaseUrl}/api/yeet-amm/pool/${mint}`,
    );
    const trading = body?.data?.trading;
    if (!trading) throw new Error(`getPoolSnapshot: no trading data for ${mint}`);
    return trading;
  }

  /** All indexed tokens (aggregator schema). */
  listTokens(): Promise<unknown> {
    return this.getJson(`${this.apiBaseUrl}/api/tokens`);
  }

  /** Recent swaps, optionally filtered by pool. */
  getTrades(params: { poolId?: string; limit?: number } = {}): Promise<unknown> {
    const q = new URLSearchParams();
    if (params.poolId) q.set('poolId', params.poolId);
    if (params.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return this.getJson(`${this.apiBaseUrl}/api/trades${suffix}`);
  }

  /** All active pools (aggregator schema). */
  listPools(): Promise<unknown> {
    return this.getJson(`${this.apiBaseUrl}/pools`);
  }
}

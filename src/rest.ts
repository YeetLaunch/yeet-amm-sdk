import { DEFAULT_API_BASE_URL } from './constants.js';

/** Default YeetLaunch app API (rich per-mint trading snapshot). */
export const DEFAULT_APP_BASE_URL = 'https://yeetlaunch.io';

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
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

/** A token to launch through a signing link. Only `name` is required. */
export interface LaunchLinkParams {
  /** 1 to 32 characters. */
  name: string;
  /** 2 to 10 letters or digits, uppercased. Derived from the name if left out. */
  symbol?: string;
  /** Up to 280 characters. */
  description?: string;
  /** Direct https link to an image file. It is copied to yeetlaunch.io. */
  logoUrl?: string;
  /** Base64 or a data URL. Takes priority over the other logo fields. */
  logoBase64?: string;
  /** Up to 400 characters. YeetLaunch draws the logo from this if no image is given. */
  logoPrompt?: string;
  /** 0 to 10 SOL, bought after launch. Adds a second wallet prompt. */
  initialBuySol?: number;
  /** The creator's public address. Recommended, and needed for reliable status. */
  wallet?: string;
  /** Your site's name, for support. */
  source?: string;
  /** An https page on a site approved by YeetLaunch. Anything else is refused. */
  returnUrl?: string;
}

export interface LaunchLink {
  id: string;
  /** Send the creator here to approve the launch. */
  url: string;
  expiresInSeconds: number;
}

/**
 * `live` is the only state that proves anything. `launching` and `unknown` do
 * NOT mean the fee was unpaid.
 */
export type LaunchState = 'live' | 'launching' | 'unknown';

export interface LaunchStatus {
  id: string;
  state: LaunchState;
  /** Present only when `state` is `live`. */
  mintAddress?: string;
  poolAddress?: string;
  tokenUrl?: string;
  creatorWallet?: string;
}

/** Applies the rules the server only enforces once the creator opens the link. */
function checkedLaunchParams(params: LaunchLinkParams): LaunchLinkParams {
  const name = params.name?.trim().replace(/\s+/g, ' ') ?? '';
  if (name.length < 1 || name.length > 32) throw new Error('createLaunchLink: name must be 1 to 32 characters');
  const symbol = (params.symbol?.trim() || name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (symbol.length < 2) throw new Error('createLaunchLink: symbol must have 2 to 10 letters or digits');
  if (params.symbol && params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').length > 10) {
    throw new Error('createLaunchLink: symbol must have 2 to 10 letters or digits');
  }
  if ((params.description?.length ?? 0) > 280) throw new Error('createLaunchLink: description is limited to 280 characters');
  if (params.logoUrl && (params.logoUrl.length > 500 || !/^https:\/\/\S+$/i.test(params.logoUrl))) {
    throw new Error('createLaunchLink: logoUrl must be an https URL of up to 500 characters');
  }
  if ((params.logoPrompt?.length ?? 0) > 400) throw new Error('createLaunchLink: logoPrompt is limited to 400 characters');
  const initialBuySol = params.initialBuySol ?? 0;
  if (!Number.isFinite(initialBuySol) || initialBuySol < 0 || initialBuySol > 10) {
    throw new Error('createLaunchLink: initialBuySol must be between 0 and 10');
  }
  return { ...params, name, symbol, initialBuySol };
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

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new Error(`POST ${url} → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
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

  /**
   * Create a signing link for a new token. Nothing is minted and no funds move
   * until the creator opens it and approves in their own wallet. Links last 15
   * minutes. Call this from a server: browsers on other sites get a 403.
   */
  async createLaunchLink(params: LaunchLinkParams): Promise<LaunchLink> {
    const { wallet, source, returnUrl, ...createParams } = checkedLaunchParams(params);
    const body = await this.postJson<{ data?: LaunchLink }>(`${this.appBaseUrl}/api/sign-request`, {
      kind: 'create',
      wallet: wallet ?? null,
      source: source ?? 'sdk',
      ...(returnUrl ? { returnUrl } : {}),
      createParams,
    });
    const link = body?.data;
    if (!link?.id || !link.url?.startsWith(`${this.appBaseUrl}/sign/`)) {
      throw new Error('createLaunchLink: unexpected response');
    }
    return link;
  }

  /**
   * Where a launch link stands. Pass the creator's wallet.
   *
   * Never start another launch because of `launching`, `unknown` or a thrown
   * error. None of them proves the fee was unpaid, so a retry could charge the
   * creator twice. Status records last 7 days and are best effort, so keep the
   * result once it is `live`, and check `creatorWallet`.
   */
  async getLaunchStatus(id: string, opts: { wallet?: string } = {}): Promise<LaunchStatus> {
    const suffix = opts.wallet ? `?${new URLSearchParams({ wallet: opts.wallet }).toString()}` : '';
    const body = await this.getJson<{ data?: LaunchStatus }>(
      `${this.appBaseUrl}/api/sign-request/${encodeURIComponent(id)}/status${suffix}`,
    );
    const status = body?.data;
    if (!status?.state) throw new Error('getLaunchStatus: unexpected response');
    return status;
  }
}

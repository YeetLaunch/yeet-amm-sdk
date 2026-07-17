# @yeetlaunch/yeet-amm-sdk

[![npm](https://img.shields.io/npm/v/@yeetlaunch/yeet-amm-sdk?color=39FF14&logo=npm)](https://www.npmjs.com/package/@yeetlaunch/yeet-amm-sdk)
[![license](https://img.shields.io/npm/l/@yeetlaunch/yeet-amm-sdk?color=14F195)](./LICENSE)

TypeScript SDK for the [YeetAMM](https://yeetlaunch.io/dev) program on Solana —
PDA derivation, swap instruction builders, on-chain account decoding, error
decoding, decimal helpers, and a thin REST client.

**Pricing is served by the YeetLaunch API.** This SDK does not implement
bonding-curve math, graduation math, or economic constants — `quote()` calls the
server, and `buy()`/`sell()` build the on-chain swap with a server-derived
minimum-out plus the on-chain stale-quote guard.

## Install

```bash
npm install @yeetlaunch/yeet-amm-sdk @solana/web3.js @solana/spl-token
```

## Quick start

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import { YeetAmmClient, WSOL_MINT, toRawAmount } from '@yeetlaunch/yeet-amm-sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = new YeetAmmClient({ connection, cluster: 'mainnet' });

const mint = new PublicKey('<token mint>');

// Read on-chain pool state
const pool = await client.getPoolByMint(mint);

// Server-computed quote (0.1 SOL buy, 0.5% slippage)
const quote = await client.quote({
  inputMint: WSOL_MINT,
  outputMint: mint,
  amountIn: toRawAmount('0.1', 9),
  slippageBps: 50,
});

// Turnkey buy — wrap + swap assembled, ready to sign
const { transaction } = await client.buildBuyTransaction({
  mint,
  amountInLamports: toRawAmount('0.1', 9),
  slippageBps: 50,
  user: wallet.publicKey,
});
const sig = await wallet.sendTransaction(transaction, connection);
```

### Wrapped SOL — handled for you

`buy`/`sell` use wSOL as the quote side, but the SDK manages wrapping so callers
never touch wSOL directly, mirroring the yeetlaunch.io production swap path:

- **Buy** — creates the wSOL ATA if missing, transfers lamports, and `syncNative`
  before the swap.
- **Sell** — appends a `closeAccount` so the user receives **native SOL, not
  wrapped SOL**.

`buy()`/`sell()` return `{ instructions, quote, pool }` (compose into your own
transaction); `buildBuyTransaction()`/`buildSellTransaction()` return a
ready-to-sign `Transaction`.

**`keepWSolAta` (default `false`).** By default the wSOL ATA is closed after
every swap — on a sell the user receives native SOL, on a buy the temporary
wSOL account's rent is reclaimed — matching the website's clean-by-default UX.
Pass `keepWSolAta: true` (bots / market makers doing many swaps) to leave the
wSOL ATA open and avoid re-wrap/close churn; the caller then manages wSOL and
its rent.

## API

- **Client** — `YeetAmmClient`: `getPool`, `getPoolByMint`, `derivePoolAddress`,
  `quote`, `buy`, `sell`, `buildSwapBaseIn`, `buildSwapBaseOut`, `getToken`,
  `getGraduationProgress`, `getLiquidity`, `getCreator`, `getCreatorFees`,
  `getLaunches`.
- **PDA** — `derivePool`, `deriveAuthority`, `deriveVault`, `deriveLpMint`,
  `deriveCreatorFeeVault`, `deriveYeetFeeVault`, `sortMints`.
- **Instructions** — `buildSwapBaseInInstruction`, `buildSwapBaseOutInstruction`,
  `computeDeadlineSlot`.
- **Decode** — `decodePool`, `isCanonicalPool`.
- **Errors** — `decodeYeetAmmError`, `getYeetAmmError`, `YEET_AMM_ERRORS`.
- **Decimals** — `toRawAmount`, `fromRawAmount`, `fromRawToNumber`.
- **REST** — `RestClient` (quotes, snapshots, pools, tokens, trades).
- **Types** — `Pool`, `Token`, `SwapQuote`/`Quote`, `Launch`, `Creator`,
  `Liquidity`, `GraduationProgress`, `CreatorFees`.

## Constants

| | Mainnet | Devnet |
|---|---|---|
| Program ID | `yeetaecvxpd7DFzZAYTEYracRt1WYJ7DfMVjEeEt2Cp` | `yeetMcJ7nBfMZiQV8ns4h5m3WeVekT1ySq27bMWWfio` |

- Quote mint: wSOL (`So11111111111111111111111111111111111111112`)
- Total swap fee: 1.00% (`fee_bps = 100`)
- REST base: `https://api.yeetlaunch.io`

See the [DEX Integration Spec](https://yeetlaunch.io/docs/yeet-amm-integration.md)
for the on-chain layout, discriminators, and indexing guidance.

## Status

`v0.1` — implemented and verified against the program: pool reads, quotes,
swap-instruction building, and turnkey `buy`/`sell` transaction assembly with
automatic wSOL wrap/unwrap (`buildBuyTransaction` / `buildSellTransaction`).

On the roadmap: `createToken`, and exact-out convenience wrappers on the client
(the `swap_base_out` instruction builder is already exposed via
`buildSwapBaseOut`).

**Network:** YeetAMM currently runs on **devnet**. The mainnet program address
above is reserved but **not yet deployed** — see the
[developer portal](https://yeetlaunch.io/dev) for live status.

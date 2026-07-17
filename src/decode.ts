import { PublicKey } from '@solana/web3.js';
import { POOL_ACCOUNT_SIZE, POOL_DISCRIMINATOR, POOL_MODE } from './constants.js';
import type { Pool } from './types.js';

/**
 * Absolute byte offsets into a `Pool` account (byte 0 = first discriminator
 * byte). Packed Borsh, little-endian, no padding. Must match
 * programs/yeet-amm/src/state.rs. Total account size = 585 bytes.
 */
const OFFSET = {
  tokenMintA: 10,
  tokenMintB: 42,
  vaultA: 74,
  vaultB: 106,
  lpMint: 138,
  creator: 170,
  reserveA: 266,
  reserveB: 274,
  feeBps: 282, // u16
  lpSupply: 286,
  lockedLpAmount: 302,
  vestingLpAmount: 350,
  vestingReleased: 358,
  isInitialized: 414, // bool
  creationSlot: 448,
  virtualReserveA: 496,
  virtualReserveB: 504,
  poolMode: 520, // u8
  gradThreshold: 521,
  gradSlot: 529,
  quoteMint: 537,
} as const;

function readPubkey(buf: Buffer, off: number): PublicKey {
  return new PublicKey(buf.subarray(off, off + 32));
}
function readU64(buf: Buffer, off: number): bigint {
  return buf.readBigUInt64LE(off);
}
function readU16(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

/**
 * Decode a raw `Pool` account buffer. Throws if the size or discriminator does
 * not match — never returns a partially-decoded pool.
 *
 * @param address the pool PDA the data was fetched from
 * @param data    raw account data (585 bytes)
 */
export function decodePool(address: PublicKey, data: Buffer | Uint8Array): Pool {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length !== POOL_ACCOUNT_SIZE) {
    throw new Error(`decodePool: expected ${POOL_ACCOUNT_SIZE} bytes, got ${buf.length}`);
  }
  if (!buf.subarray(0, 8).equals(POOL_DISCRIMINATOR)) {
    throw new Error('decodePool: account discriminator is not a YeetAMM Pool');
  }
  const modeByte = buf.readUInt8(OFFSET.poolMode);
  return {
    address,
    tokenMintA: readPubkey(buf, OFFSET.tokenMintA),
    tokenMintB: readPubkey(buf, OFFSET.tokenMintB),
    vaultA: readPubkey(buf, OFFSET.vaultA),
    vaultB: readPubkey(buf, OFFSET.vaultB),
    lpMint: readPubkey(buf, OFFSET.lpMint),
    creator: readPubkey(buf, OFFSET.creator),
    reserveA: readU64(buf, OFFSET.reserveA),
    reserveB: readU64(buf, OFFSET.reserveB),
    feeBps: readU16(buf, OFFSET.feeBps),
    lpSupply: readU64(buf, OFFSET.lpSupply),
    lockedLpAmount: readU64(buf, OFFSET.lockedLpAmount),
    vestingLpAmount: readU64(buf, OFFSET.vestingLpAmount),
    vestingReleased: readU64(buf, OFFSET.vestingReleased),
    isInitialized: buf.readUInt8(OFFSET.isInitialized) !== 0,
    mode: modeByte === POOL_MODE.AMM ? 'AMM' : 'DBC',
    gradThreshold: readU64(buf, OFFSET.gradThreshold),
    gradSlot: readU64(buf, OFFSET.gradSlot),
    quoteMint: readPubkey(buf, OFFSET.quoteMint),
    virtualReserveA: readU64(buf, OFFSET.virtualReserveA),
    virtualReserveB: readU64(buf, OFFSET.virtualReserveB),
    creationSlot: readU64(buf, OFFSET.creationSlot),
  };
}

/**
 * Verify a pool is the canonical, program-owned market for a mint pair. Mirrors
 * the checks in the integration spec §9 (PDA + owner + initialized + quote mint).
 * `derivedPool` must be computed via `derivePool(...)`.
 */
export function isCanonicalPool(params: {
  pool: Pool;
  poolAddress: PublicKey;
  derivedPool: PublicKey;
  programOwner: PublicKey;
  programId: PublicKey;
  expectedQuoteMint: PublicKey;
}): boolean {
  return (
    params.poolAddress.equals(params.derivedPool) &&
    params.programOwner.equals(params.programId) &&
    params.pool.isInitialized &&
    params.pool.quoteMint.equals(params.expectedQuoteMint)
  );
}

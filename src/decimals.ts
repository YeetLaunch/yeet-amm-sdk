/**
 * Decimal helpers for converting between human-readable amounts and raw base
 * units. All on-chain amounts are integers in base units (bigint); these helpers
 * do the decimal shift without floating-point loss on the integer side.
 */

/** Convert a human amount (e.g. "1.5") to raw base units for a mint's decimals. */
export function toRawAmount(amount: string | number, decimals: number): bigint {
  const s = typeof amount === 'number' ? formatNumberPlain(amount) : amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') {
    throw new Error(`toRawAmount: invalid amount "${amount}"`);
  }
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(`toRawAmount: "${amount}" has more than ${decimals} decimal places`);
  }
  const paddedFrac = frac.padEnd(decimals, '0');
  return BigInt(`${whole || '0'}${paddedFrac}`);
}

/** Convert raw base units to a human-readable decimal string (no rounding). */
export function fromRawAmount(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const s = abs.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals > 0 ? s.slice(s.length - decimals).replace(/0+$/, '') : '';
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Convert raw base units to a JS number (may lose precision for huge values). */
export function fromRawToNumber(raw: bigint, decimals: number): number {
  return Number(fromRawAmount(raw, decimals));
}

function formatNumberPlain(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`toRawAmount: non-finite number ${n}`);
  // Avoid scientific notation for small/large magnitudes.
  if (Math.abs(n) < 1e-6 || Math.abs(n) >= 1e21) {
    return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  }
  return String(n);
}

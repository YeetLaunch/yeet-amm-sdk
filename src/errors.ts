/**
 * YeetAMM custom program error codes (Anchor errors start at 6000). Generated
 * from the program IDL; keep in sync on program upgrades.
 */
export const YEET_AMM_ERRORS: Record<number, { name: string; msg: string }> = {
  6000: { name: 'ZeroAmount', msg: 'ZERO_AMT' },
  6001: { name: 'ZeroOutput', msg: 'ZERO_OUT' },
  6002: { name: 'InvalidFee', msg: 'BAD_FEE' },
  6003: { name: 'InvalidCreatorFeeShare', msg: 'BAD_CFS' },
  6004: { name: 'TokensNotOrdered', msg: 'MINT_ORD' },
  6005: { name: 'SlippageExceeded', msg: 'SLIP' },
  6006: { name: 'MaxInputExceeded', msg: 'MAX_IN' },
  6007: { name: 'InsufficientLpOutput', msg: 'LP_MIN' },
  6008: { name: 'PoolNotInitialized', msg: 'POOL_NI' },
  6009: { name: 'PoolAlreadyInitialized', msg: 'POOL_INIT' },
  6010: { name: 'InsufficientLiquidity', msg: 'LIQ_LOW' },
  6011: { name: 'InvalidVault', msg: 'BAD_VAULT' },
  6012: { name: 'InvalidMint', msg: 'BAD_MINT' },
  6013: { name: 'InvalidFeeVault', msg: 'BAD_FV' },
  6014: { name: 'InvalidInputMint', msg: 'BAD_IN_M' },
  6015: { name: 'InvalidOutputMint', msg: 'BAD_OUT_M' },
  6016: { name: 'InvalidOwner', msg: 'BAD_OWNER' },
  6017: { name: 'InvalidCreator', msg: 'BAD_CREATOR' },
  6018: { name: 'InvalidSetupCanceller', msg: 'BAD_CANCEL' },
  6019: { name: 'InvalidSetupAuthority', msg: 'BAD_SETUP' },
  6020: { name: 'MintAuthorityEnabled', msg: 'MINT_AUTH' },
  6021: { name: 'FreezeAuthorityEnabled', msg: 'FRZ_AUTH' },
  6022: { name: 'LpStillLocked', msg: 'LP_LOCK' },
  6023: { name: 'NothingToClaim', msg: 'NO_CLAIM' },
  6024: { name: 'InvalidLpDistribution', msg: 'BAD_LP_DIST' },
  6025: { name: 'InvalidLockDuration', msg: 'BAD_LOCK_DUR' },
  6026: { name: 'InvalidVestingDuration', msg: 'BAD_VEST_DUR' },
  6027: { name: 'TransactionExpired', msg: 'EXPIRED' },
  6028: { name: 'QuotedStateMismatch', msg: 'STALE_Q' },
  6029: { name: 'LpHoldPeriodNotMet', msg: 'LP_HOLD' },
  6030: { name: 'InvalidAmplification', msg: 'BAD_AMP' },
  6031: { name: 'UnauthorizedPoolCreation', msg: 'BAD_PCA' },
  6032: { name: 'InvalidConfigAuthority', msg: 'BAD_CFG' },
  6033: { name: 'DbcModeRestricted', msg: 'DBC_ONLY' },
  6034: { name: 'InvalidGradThreshold', msg: 'BAD_GRAD' },
  6035: { name: 'GradThresholdUnachievable', msg: 'GRAD_UNR' },
  6036: { name: 'InvalidOrigin', msg: 'BAD_ORIGIN' },
  6037: { name: 'InvalidQuoteMint', msg: 'BAD_QUOTE' },
  6038: { name: 'AlreadyGraduated', msg: 'GRAD_DONE' },
  6039: { name: 'InvalidPoolMode', msg: 'BAD_MODE' },
  6040: { name: 'InvalidVestingSchedule', msg: 'BAD_VEST' },
  6041: { name: 'InvalidAdaptiveSellCap', msg: 'BAD_CAP' },
  6042: { name: 'AdaptiveSellCapExceeded', msg: 'CAP_HIT' },
  6043: { name: 'SameSlotPostGraduationSell', msg: 'GRAD_SELL_SLOT' },
  6044: { name: 'MathOverflow', msg: 'MATH' },
  6045: { name: 'FeeCalculationMismatch', msg: 'FEE_MM' },
  6046: { name: 'InvalidVirtualReserve', msg: 'BAD_VRES' },
};

export interface DecodedProgramError {
  code: number;
  name: string;
  msg: string;
}

/** Look up a YeetAMM error by its numeric custom code (e.g. 6028). */
export function getYeetAmmError(code: number): DecodedProgramError | null {
  const e = YEET_AMM_ERRORS[code];
  return e ? { code, ...e } : null;
}

/**
 * Best-effort decode of a YeetAMM custom error out of an arbitrary error thrown
 * by `@solana/web3.js` (SendTransactionError, simulation logs, or a plain
 * object with `InstructionError: [i, { Custom: code }]`). Returns null if no
 * YeetAMM custom code can be found.
 */
export function decodeYeetAmmError(err: unknown): DecodedProgramError | null {
  const codes = new Set<number>();

  const scanCustom = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const anyVal = value as Record<string, unknown>;
    if (typeof anyVal.Custom === 'number') codes.add(anyVal.Custom);
    if (Array.isArray(anyVal.InstructionError)) {
      const inner = anyVal.InstructionError[1];
      if (inner && typeof inner === 'object' && typeof (inner as Record<string, unknown>).Custom === 'number') {
        codes.add((inner as Record<string, number>).Custom);
      }
    }
    for (const v of Object.values(anyVal)) if (v && typeof v === 'object') scanCustom(v);
  };
  scanCustom(err);

  // Also scan any string form ("custom program error: 0x1794", "Custom":6028).
  const text = ((): string => {
    if (typeof err === 'string') return err;
    if (err instanceof Error) return `${err.message} ${JSON.stringify((err as { logs?: unknown }).logs ?? '')}`;
    try { return JSON.stringify(err); } catch { return String(err); }
  })();
  const hex = text.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (hex) codes.add(parseInt(hex[1], 16));
  const dec = text.match(/"Custom"\s*:\s*(\d+)/);
  if (dec) codes.add(parseInt(dec[1], 10));

  for (const code of codes) {
    const decoded = getYeetAmmError(code);
    if (decoded) return decoded;
  }
  return null;
}

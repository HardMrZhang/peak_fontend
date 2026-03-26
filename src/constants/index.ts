export const NODE_TRADE_DATE = '2026-06-06T00:00:00'
export const NODE_TRADE_DATE_DISPLAY = '2026.06.06'
export const CHAIN_NAME = 'Solana'
/** 与后端 config.withdraw.fixedFee 一致；estimate 接口未返回时的展示兜底 */
export const DEFAULT_WITHDRAW_FEE_BY_ASSET = {
  USDT: '1',
  PEAK: '5',
} as const
export const PEAK_TOTAL_SUPPLY = 1_000_000_000
export const PEAK_YEAR1_ALLOC = 360_000_000

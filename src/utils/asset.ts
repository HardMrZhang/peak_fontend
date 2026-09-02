/**
 * 资产代码 → 展示名。
 * 后端/账本内部统一用大写代码（USDT / PEAK / AIPK），界面上 Aipk 按品牌写法显示。
 */
const ASSET_LABELS: Record<string, string> = {
  USDT: 'USDT',
  PEAK: 'PEAK',
  AIPK: 'Aipk',
}

export function assetLabel(code?: string | null, fallback = ''): string {
  if (!code) return fallback
  return ASSET_LABELS[code.toUpperCase()] ?? code
}

import { get, post } from '@/utils/request'
import type {
  WalletUser,
  AssetBalance,
  DepositAddress,
  LedgerEntry,
  NodeSaleConfig,
  NodeInfo,
  NodeOrder,
  NodeBuyParams,
  RewardSummary,
  RewardLot,
  ReferralInfo,
  RankRecord,
  DirectReferralRecord,
  TeamNodeRecord,
  ReferralReward,
  WithdrawEstimate,
  WithdrawRequest,
  NftRecord,
  DailyEarning,
  DailyRelease,
  Banner,
  PageResult,
  TeamLevelInfo,
  GenesisSaleInfo,
  GenesisBuyParams,
} from '@/types'

// ==================== Auth ====================
export function getNonce(walletAddress: string) {
  return post<{ nonce: string }>('/auth/nonce', { walletAddress })
}

export function walletLogin(data: { walletAddress: string; nonce: string; signature: string }) {
  return post<{ token: string; user: WalletUser }>('/auth/login', data)
}

export function bindReferrer(inviteCode: string) {
  return post('/auth/bind-referrer', { inviteCode })
}

export function getMe() {
  return get<WalletUser>('/auth/me')
}

// ==================== Home ====================
export function getBanners(lang?: string) {
  return get<Banner[]>('/home/banners', { params: { lang } })
}

export function getSaleSummary() {
  return get<NodeSaleConfig>('/home/sale-summary')
}

// ==================== Account ====================
export function getBalances() {
  return get<AssetBalance[]>('/account/balances')
}

export function getLedger(params: { asset?: string; changeType?: string; page?: number; pageSize?: number }) {
  return get<PageResult<LedgerEntry>>('/account/ledger', { params })
}

export function getDepositAddress(asset?: string) {
  return get<DepositAddress>('/account/deposit-address', { params: { asset } })
}

// ==================== Node ====================
export function getNodeInfo() {
  return get<NodeInfo>('/node/info')
}

export function createNodeOrder(qty: number) {
  return post<NodeOrder>('/node/order', { qty })
}

export function getNodeOrders(params?: { status?: string; page?: number; pageSize?: number }) {
  return get<PageResult<NodeOrder>>('/node/orders', { params })
}

export function getNodeOrderDetail(orderId: string) {
  return get<NodeOrder>(`/node/order/${orderId}`)
}

export function getNodeBuyParams() {
  return get<NodeBuyParams>('/node/buy-params')
}

export function confirmNodeBuy(txHash: string, asset: string, intentId: string) {
  return post<NodeOrder>('/node/confirm-buy', { txHash, asset, intentId })
}

export function cancelNodeBuyIntent(intentId: string) {
  return post('/node/cancel-buy-intent', { intentId })
}

// ==================== Reward ====================
export function getRewardSummary() {
  return get<RewardSummary>('/reward/summary')
}

export function getRewardLots(params?: { status?: string; page?: number; pageSize?: number }) {
  return get<PageResult<RewardLot>>('/reward/lots', { params })
}

export function getReleaseProgress(lotId: string) {
  return get(`/reward/lots/${lotId}/progress`)
}

export function getDailyEarnings(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DailyEarning>>('/reward/daily-earnings', { params })
}

export function getDailyReleases(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DailyRelease>>('/reward/daily-releases', { params })
}

// ==================== Referral ====================
export function getReferralInfo() {
  return get<ReferralInfo>('/referral/info')
}

export function getDirectReferrals(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DirectReferralRecord>>('/referral/directs', { params })
}

export function getReferralRewards(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<ReferralReward>>('/referral/rewards', { params })
}

export function getTeamNodes(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<TeamNodeRecord>>('/referral/team-nodes', { params })
}

export function getRanking(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<RankRecord>>('/referral/ranking', { params })
}

export function getTeamLevelInfo() {
  return get<TeamLevelInfo>('/referral/team-level')
}

// ==================== Withdraw ====================
export function estimateWithdraw(asset: string, amount: number) {
  return post<WithdrawEstimate>('/withdraw/estimate', { asset, amount })
}

export function submitWithdraw(data: { asset: string; toAddress: string; amount: number }) {
  return post<WithdrawRequest>('/withdraw/submit', data)
}

export function getWithdrawHistory(params?: { status?: string; page?: number; pageSize?: number }) {
  return get<PageResult<WithdrawRequest>>('/withdraw/history', { params })
}

export function getWithdrawDetail(requestId: string) {
  return get<WithdrawRequest>(`/withdraw/${requestId}`)
}

// ==================== Genesis NFT ====================
export function getGenesisSaleInfo() {
  return get<GenesisSaleInfo>('/genesis/sale-info')
}

export function getGenesisBuyParams(quantity: number) {
  return get<GenesisBuyParams>('/genesis/buy-params', { params: { quantity } })
}

export function cancelGenesisBuyIntent(intentId: string) {
  return post('/genesis/cancel-buy-intent', { intentId })
}

export function confirmGenesisBuy(txHash: string, intentId: string) {
  return post('/genesis/confirm-buy', { txHash, intentId })
}

// ==================== Genesis VIP ====================
export function getGenesisVipLevel() {
  return get<{ vipLevel: number; vipLabel: string }>('/genesis-vip/my-level')
}

export function getMyGenesisNfts(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<NftRecord>>('/genesis/my-nfts', { params })
}

// ==================== NFT ====================
export function getMyNfts(params?: { status?: string; page?: number; pageSize?: number }) {
  return get<PageResult<NftRecord>>('/nft/list', { params })
}

export function getNftDetail(mintId: string) {
  return get<NftRecord>(`/nft/${mintId}`)
}

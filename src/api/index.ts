import { get, post, getText, getBlob } from '@/utils/request'
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
  Notice,
  PageResult,
  PointsExchangeRecord,
  PointsExchangeResult,
  PointsInflateResult,
  PointsOverview,
  TeamLevelInfo,
  GenesisSaleInfo,
  GenesisBuyParams,
  GenesisOrder,
  DappStakeOverview,
  DappStakeParams,
  DappUnstakeParams,
  DappStakeRecord,
  DappStakeRewardsInfo,
  DappClaimStakeRewardParams,
  DappPromoSummary,
  DappT7Summary,
  DappDividendClaimParams,
  DappMarketPrice,
  DappAirdropConfig,
  DappAirdropParams,
  DappAirdropRecord,
  DappAirdropReleaseRecord,
  DappAirdropSummary,
  DappWithdrawParams,
  DappZeroCardInfo,
  DappZeroCardParams,
  DappZeroCardRecord,
  DappConfirmResult,
  DramaProject,
  DramaIpoConfig,
  DramaAgreementPreview,
  DramaPendingAgreement,
  DramaSignPreview,
  DramaSignedAgreement,
  DramaMyContract,
  DramaSubscribeParams,
  DramaSubscriptionRecord,
  DramaEarningRecord,
  DramaIpoSummary,
  DramaHistoryRecord,
  DramaProjectRevenue,
} from '@/types'

// 需要在链上补记额度并等待确认的接口，确认耗时可能超过默认 15s，单独放宽超时
const ONCHAIN_CREDIT_TIMEOUT = 60000

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

export function getNotices(lang?: string) {
  return get<Notice[]>('/home/notices', { params: { lang } })
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

// ==================== Points ====================
// 积分页面以「邮箱」作为身份，无需登录态；email/钱包地址由前端随请求带上。
export function getPointsOverview(email?: string | null, walletAddress?: string | null) {
  return get<PointsOverview>('/points/overview', {
    params: { email: email || undefined, walletAddress: walletAddress || undefined },
  })
}

export function bindPointsEmail(email: string, walletAddress?: string | null) {
  return post<{ emailBound: boolean; email: string | null; rebound: boolean; hasPeakAccount: boolean; score: number }>(
    '/points/bind-email',
    { email, walletAddress: walletAddress || undefined },
  )
}

export function getPointsExchangeHistory(params?: {
  page?: number
  pageSize?: number
  email?: string | null
  walletAddress?: string | null
}) {
  return get<PageResult<PointsExchangeRecord>>('/points/exchange-history', { params })
}

// 积分膨胀：按 NFT 持有量加成（N 张 => N+1 倍），需绑定邮箱并连接钱包
export function inflatePoints(email: string, walletAddress: string) {
  return post<PointsInflateResult>('/points/inflate', { email, walletAddress })
}

// 兑换需要连接钱包：PEAK 发到该钱包账户的平台托管余额
export function submitPointsExchange(points: number, email: string, walletAddress: string) {
  return post<PointsExchangeResult>('/points/exchange', { points, email, walletAddress })
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
  // 股东节点风控（NEED_DRAMA_IPO_NODE）由页面本地化提示，跳过全局英文弹窗
  return post<WithdrawRequest>('/withdraw/submit', data, { skipErrorToast: true })
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

export interface GenesisVipTeamDetail {
  directs: {
    address: string
    totalAmountUsdt: string
    usdtAmount: string
    peakAmount: string
  }[]
  teamTotalUsdt: string
  directReferralIncomeUsdt: string | null
  referralFeeBps: number | null
}

export function getGenesisVipTeamDetail() {
  return get<GenesisVipTeamDetail>('/genesis-vip/team-detail')
}

export interface GenesisRecentPerformance {
  windows: {
    key: string
    usdt: string
    peak: string
  }[]
  custom?: {
    start: string
    end: string
    usdt: string
    peak: string
  } | null
}

export function getGenesisRecentPerformance(params?: { start?: string; end?: string }) {
  return get<GenesisRecentPerformance>('/genesis-vip/recent-performance', { params })
}

export function getMyGenesisNfts(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<NftRecord>>('/genesis/my-nfts', { params })
}

export function getGenesisOrders(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<GenesisOrder>>('/genesis/my-orders', { params })
}

// ==================== NFT ====================
export function getMyNfts(params?: { status?: string; page?: number; pageSize?: number }) {
  return get<PageResult<NftRecord>>('/nft/list', { params })
}

export function getNftDetail(mintId: string) {
  return get<NftRecord>(`/nft/${mintId}`)
}

// ==================== DApp: 质押 ====================
export function getStakeOverview() {
  return get<DappStakeOverview>('/dapp/stake/overview')
}

export function getStakeParams(periodDays: number, amount: string | number) {
  return get<DappStakeParams>('/dapp/stake/params', { params: { periodDays, amount } })
}

export function confirmStake(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/stake/confirm', data)
}

export function getUnstakeParams(positionId: string | number, periodDays: number) {
  return get<DappUnstakeParams>('/dapp/stake/unstake-params', { params: { positionId, periodDays } })
}

export function confirmUnstake(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/stake/unstake-confirm', data)
}

export function getStakeRecords(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DappStakeRecord>>('/dapp/stake/records', { params })
}

// ==================== DApp: 质押收益（日结可提，用户付 GAS） ====================
export function getStakeRewards(params?: { page?: number; pageSize?: number }) {
  return get<DappStakeRewardsInfo>('/dapp/stake/rewards', { params })
}

export function getClaimStakeRewardParams(positionId: string | number, periodDays: number) {
  // 该接口返回前需在链上补记分红额度并等待确认，主网确认可能 >15s，单独放宽超时。
  // 领取相关错误（已到账自愈 / 串行锁占用）由页面内联提示，跳过全局红色弹窗。
  return get<DappClaimStakeRewardParams>('/dapp/stake/claim-reward-params', { params: { positionId, periodDays }, timeout: ONCHAIN_CREDIT_TIMEOUT, skipErrorToast: true })
}

export function confirmClaimStakeReward(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/stake/claim-reward-confirm', data)
}

// ==================== DApp: 1推5 推广分红（每日平均分配，用户付 GAS 领取） ====================
export function getPromoSummary(params?: { page?: number; pageSize?: number }) {
  return get<DappPromoSummary>('/dapp/promo/summary', { params })
}

export function getPromoClaimParams() {
  // 同上：返回前链上补记分红额度并等待确认，放宽超时
  return get<DappDividendClaimParams>('/dapp/promo/claim-params', { timeout: ONCHAIN_CREDIT_TIMEOUT })
}

export function confirmPromoClaim(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/promo/claim-confirm', data)
}

// ==================== DApp: T7 加权分红（按小区业绩每日加权计提，用户付 GAS 领取） ====================
export function getT7Summary(params?: { page?: number; pageSize?: number }) {
  return get<DappT7Summary>('/dapp/t7/summary', { params })
}

export function getT7ClaimParams() {
  // 同上：返回前链上补记分红额度并等待确认，放宽超时
  return get<DappDividendClaimParams>('/dapp/t7/claim-params', { timeout: ONCHAIN_CREDIT_TIMEOUT })
}

export function confirmT7Claim(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/t7/claim-confirm', data)
}

// ==================== DApp: 行情（公开，无需登录） ====================
export function getPeakPrice() {
  return get<DappMarketPrice>('/dapp/market/price')
}

// ==================== DApp: 三倍空投 ====================
export function getAirdropConfig() {
  return get<DappAirdropConfig>('/dapp/airdrop/config')
}

export function getAirdropParams(
  amount: string | number,
  payCurrency: 'USDT' | 'PEAK' = 'USDT',
) {
  // 错误由空投页自行提示（如最低参与门槛），跳过全局错误弹窗
  // 兼容后端旧参数名 usdAmount：U 下单时同时传 amount 与 usdAmount
  const params: Record<string, string | number> = { amount, payCurrency }
  if (payCurrency === 'USDT') params.usdAmount = amount
  return get<DappAirdropParams>('/dapp/airdrop/params', { params, skipErrorToast: true })
}

export function confirmAirdrop(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/airdrop/confirm', data)
}

export function getAirdropRecords(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DappAirdropRecord>>('/dapp/airdrop/records', { params })
}

// 单个空投包的「每日可提（每日释放）记录」
export function getAirdropReleaseRecords(params: {
  packageId: string
  page?: number
  pageSize?: number
}) {
  return get<PageResult<DappAirdropReleaseRecord>>('/dapp/airdrop/release-records', { params })
}

// 加速汇总：直推加速（直推静态实时累加）+ 团队加速（最近日结）+ 链上可提余额
export function getAirdropSummary() {
  return get<DappAirdropSummary>('/dapp/airdrop/summary')
}

// ==================== DApp: 空投收益提现（扣 20% 手续费，用户单签付 GAS） ====================
export function getDappWithdrawParams(amount: string | number, packageId: string) {
  // 返回前可能触发链上额度自愈补单并等待确认，放宽超时
  return get<DappWithdrawParams>('/dapp/withdraw/params', { params: { amount, packageId }, skipErrorToast: true, timeout: ONCHAIN_CREDIT_TIMEOUT })
}

export function confirmDappWithdraw(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/withdraw/confirm', data)
}

// ==================== DApp: 100U 投资包 / 零撸卡 ====================
export function getZeroCardInfo() {
  return get<DappZeroCardInfo>('/dapp/zero-card/info')
}

export function getZeroCardParams() {
  return get<DappZeroCardParams>('/dapp/zero-card/params')
}

export function confirmZeroCard(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/dapp/zero-card/confirm', data)
}

export function getZeroCardRecords(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DappZeroCardRecord>>('/dapp/zero-card/records', { params })
}

// ==================== AI 短剧打新 ====================
export function getDramaIpoConfig() {
  return get<DramaIpoConfig>('/drama-ipo/config')
}

export function getDramaProjects(params?: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
  return get<PageResult<DramaProject>>('/drama-ipo/projects', { params })
}

export function getDramaProject(serialNo: string) {
  return get<DramaProject>(`/drama-ipo/projects/${serialNo}`)
}

export function getDramaProjectRevenue(serialNo: string) {
  return get<DramaProjectRevenue>(`/drama-ipo/projects/${serialNo}/revenue`)
}

// 付款前的《认购须知》：轻量风险提示，勾选即可下单
export function previewDramaAgreement(serialNo: string, shares: number) {
  return get<DramaAgreementPreview>('/drama-ipo/agreement/preview', { params: { serialNo, shares } })
}

// 付款成功但还没签正式协议的认购，用于自动弹窗与账户页提醒
export function getDramaPendingAgreements() {
  return get<DramaPendingAgreement[]>('/drama-ipo/agreement/pending')
}

// 签署前的合同定稿预览：把已填的实名信息回填进正文
export function previewSignDramaAgreement(
  subscriptionId: string,
  draft: { signerName?: string; signerIdNo?: string; signerPhone?: string },
) {
  return post<DramaSignPreview>(`/drama-ipo/agreement/${subscriptionId}/preview`, draft)
}

// 签署《本金返还及收益分配电子协议》
export function signDramaAgreement(data: {
  subscriptionId: string
  signerName: string
  signerIdNo: string
  signerPhone: string
  /** 手写签名画布导出的 PNG data URL */
  signatureImage: string
}) {
  return post<{ id: string; contractNo: string; contentHash: string; signedAt: string }>(
    '/drama-ipo/agreement/sign',
    data,
    { skipErrorToast: true },
  )
}

// 已签署合同快照（站内查看，深色主题）
export function getDramaAgreement(subscriptionId: string) {
  return get<DramaSignedAgreement>(`/drama-ipo/agreement/${subscriptionId}`)
}

// 「我的合同」列表
export function getDramaMyContracts(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DramaMyContract>>('/drama-ipo/agreements', { params })
}

/**
 * 拉取下载/打印用的单文件 HTML（白底纸质样式 + 内联签名图）。
 * 走 axios 而不是直接开新窗口，因为下载接口要带 JWT 鉴权头。
 */
export function fetchDramaContractDocument(subscriptionId: string) {
  return getText(`/drama-ipo/agreement/${subscriptionId}/download`)
}

/** 服务端 headless Chrome 渲染的矢量 PDF（文字可选，中文清晰） */
export function fetchDramaContractPdf(subscriptionId: string) {
  return getBlob(`/drama-ipo/agreement/${subscriptionId}/download.pdf`)
}

export function getDramaSubscribeParams(serialNo: string, shares: number) {
  // 份额不足等错误由打新页自行提示，跳过全局错误弹窗
  return get<DramaSubscribeParams>('/drama-ipo/params', {
    params: { serialNo, shares, agreementAccepted: true },
    skipErrorToast: true,
  })
}

export function confirmDramaSubscribe(data: { txHash: string; intentId: string }) {
  return post<DappConfirmResult>('/drama-ipo/confirm', data)
}

export function getDramaSubscriptions(params?: { page?: number; pageSize?: number }) {
  return get<PageResult<DramaSubscriptionRecord>>('/drama-ipo/subscriptions', { params })
}

export function getDramaEarningRecords(params: {
  type: 'AIRDROP' | 'USDT'
  page?: number
  pageSize?: number
}) {
  return get<PageResult<DramaEarningRecord>>('/drama-ipo/records', { params })
}

export function getDramaSummary() {
  return get<DramaIpoSummary>('/drama-ipo/summary')
}

// 历史查询（公开）：按钱包地址或剧目编号查认购记录与各期分红
export function getDramaHistory(params: {
  wallet?: string
  serialNo?: string
  page?: number
  pageSize?: number
}) {
  return get<PageResult<DramaHistoryRecord>>('/drama-ipo/history', { params, skipErrorToast: true })
}

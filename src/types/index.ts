export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PageResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface WalletUser {
  id: string
  walletAddress: string
  inviteCode: string
  referrerUserId: string | null
  languageCode: string
  status: number
  lastLoginAt: string | null
  createdAt: string
}

export interface AssetBalance {
  asset: 'USDT' | 'PEAK'
  availableAmount: string
  lockedAmount: string
  pendingWithdrawAmount: string
  totalInAmount: string
  totalOutAmount: string
}

export interface DepositAddress {
  chain: string
  network: string
  asset: string
  address: string
  programId: string
  vaultAuthority: string
  collectionOwner: string
  collectionTokenAccount: string
  mintAddress: string
  tokenProgramId: string
  depositMethod: string
}

export interface LedgerEntry {
  id: string
  entryNo: string
  asset: string
  changeType: string
  direction: 'IN' | 'OUT'
  amount: string
  balanceBefore: string
  balanceAfter: string
  bizType: string | null
  bizId: string | null
  remark: string | null
  createdAt: string
}

export interface PointsExchangeRecord {
  id: string
  points: number
  peak: string
  createdAt: string
}

export interface PointsExchangeResult {
  points: number
  peak: string
  createdAt: string
}

export interface PointsOverview {
  score: number
  appPoints: number
  inflatedPoints: number
  nftMultiplier: number
  scoreInflated: boolean
  emailBound: boolean
  email: string | null
  username?: string | null
  avatar?: string | null
  nftCount: number
  cardCount?: number
  tierLevels?: number
  peakAvailable: string
  hasPeakAccount?: boolean
  redeemRate: {
    pointsPerUnit: number
    peakPerUnit: number
    minPoints: number
    estimatedPeak: string
  }
}

export interface PointsInflateResult {
  appPoints: number
  score: number
  inflatedPoints: number
  nftCount: number
  nftMultiplier: number
  scoreInflated: boolean
}

export interface NodeSaleConfig {
  totalNodes: number
  soldNodes: number
  remaining: number
  nodePriceUsdt: string
  status: string
  saleStartAt: string | null
  saleEndAt: string | null
}

export interface NodeInfo {
  config: NodeSaleConfig
  userNodes: number
}

export interface NodeOrder {
  id: string
  orderNo: string
  qty: number
  unitPriceUsdt: string
  totalAmountUsdt: string
  status: string
  expiredAt: string | null
  paidAt: string | null
  createdAt: string
}

export interface RewardSummary {
  yesterdayPerNode: string
  myYesterdayReward: string
  totalLocked: string
  totalReleased: string
}

export interface RewardLot {
  id: string
  lotNo: string
  sourceType: string
  asset: string
  lockedAmount: string
  releasedAmount: string
  releaseDays: number
  startDate: string
  endDate: string
  status: string
}

export interface ReferralInfo {
  walletAddress: string
  inviteCode: string
  directCount: number
  teamNodes: number
  teamShareholderNodes: number
  teamGenesisNodes: number
  directPushNodes: number
  directPushRewards: string
  referralLink: string
  referrerWallet: string | null
}

export interface RankRecord {
  rank: number
  address: string
  totalPeak: string
}

export interface DirectReferralRecord {
  walletAddress: string
  joinedAt: string
  nodeQty: number
  rewardAmount: string
  // 累计三倍空投金额（USDT）；仅当达标（单笔≥500U 资产包 或 持影视节点NFT）时返回
  airdropQualified?: boolean
  airdropUsdValue?: string | null
  // 「一推五」星标：该直推自身也满足推广分红资格
  //（本人单笔≥500U + 有效直推≥5 + 持影视节点NFT）
  promoQualified?: boolean
}

export interface TeamNodeRecord {
  walletAddress: string
  level: number
  joinedAt: string
  nodeQty: number
  genesisNodeQty: number
}

export interface ReferralReward {
  id: string
  rewardNo: string
  rewardLevel: number
  rewardType?: 'DIRECT' | 'TEAM'
  relationDepth?: number
  teamLevelAtIssue?: number | null
  commissionRateAtIssue?: string | null
  fromUserWallet: string
  orderNo: string
  orderQty: number
  orderAmount: string
  amount: string
  asset: string
  status: string
  createdAt: string
}

export interface WithdrawEstimate {
  asset: string
  amount: string
  fee: string
  actual: string
}

export interface WithdrawRequest {
  id: string
  requestNo: string
  asset: string
  toAddress: string
  amount: string
  feeAmount: string
  actualAmount: string
  status: string
  submittedAt: string
}

export interface NodeBuyParams {
  intentId: string
  peakProgramId: string
  nextNodeIndex: number
  asset: string
  collection: string
  configPda: string
  saleStatePda: string
  emissionPda: string
  inventoryPda: string
  nodeInfoPda: string
  buyerReferralPda: string
  nodePriceUsdt: string
}

export interface NftRecord {
  id: string
  mintNo: string
  orderNo?: string
  orderQty?: number
  nftContract: string
  tokenId: string | null
  metadataUri?: string | null
  txHash: string | null
  status: string
  mintedAt: string | null
  createdAt: string
  rewardToken?: string
  accumulatedReward?: string
}

export interface DailyEarning {
  id: string
  bizDate: string
  perNodePeak: string
  myNodes: number
  myTotal: string
}

export interface DailyRelease {
  id: string
  bizDate: string
  totalRelease: string
  perNodeRelease: string
  myNodes: number
}

export interface Banner {
  id: string
  title: string | null
  mediaType: 'IMAGE' | 'VIDEO'
  mediaUrl: string
  targetUrl: string | null
  sortOrder: number
}

export interface GenesisSaleInfo {
  premintedTotal: number
  soldTotal: number
  maxSupply: number
  nftPriceUsdt: string
  peakAirdropAmount: string
  saleStartTime: string | null
  saleEndTime: string | null
  paused: boolean
}

export interface GenesisOrder {
  id: string
  orderNo: string
  qty: number
  unitPriceUsdt: string
  totalAmountUsdt: string
  peakAirdropTotal: string
  status: string
  paidAt: string | null
  createdAt: string
}

export interface GenesisBuyParams {
  intentId: string
  configPda: string
  salePda: string
  collection: string
  inventoryPda: string
  buyerUsdtAta: string
  mixerUsdtAta: string
  multisigUsdtAta: string
  buyerPeakAta: string
  peakSourceAta: string
  programAuthority: string
  usdtMint: string
  peakMint: string
  referrerUsdtAta: string | null
  referrerWallet: string | null
  nfts: Array<{ asset: string; nftInfoPda: string }>
}

export interface TeamLevelConfig {
  level: number
  label: string
  minNft: number
  maxNft: number | null
  commissionRate: number
  lockDays: number
}

export interface TeamLevelInfo {
  level: number
  label: string
  commissionRate: number
  commissionPerNft: number
  teamCommissionEligible?: boolean
  lockDays: number
  teamNftCount: number
  ownNftCount: number
  pointsMultiplier: number
  levels: TeamLevelConfig[]
}

// ==================== DApp (IPO / 质押 / 三倍空投 / 投资包) ====================

export interface DappIxKey {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

// 后端已完成账户布局与编码，前端据此构造 TransactionInstruction 并用钱包签名。
// 两种形态二选一：
//   1) programId/keys/data —— 裸指令（仅用户单签的操作：质押、赎回）
//   2) transactionBase64  —— operator 已部分签名的完整交易（空投、零撸卡、各类领取），
//      前端 Transaction.from 反序列化后由用户钱包补签发送（用户付 GAS），
//      不可改动交易内容（含加 ComputeBudget），否则 operator 签名失效；
//      需在 blockhash 失效前（约 1~2 分钟）完成签名发送。
export interface DappIxParams {
  intentId: string
  programId?: string
  keys?: DappIxKey[]
  data?: string // base64
  transactionBase64?: string
  recentBlockhash?: string
  lastValidBlockHeight?: number
  feePayer?: string
  userPeakAta: string
}

export interface DappStakePool {
  periodDays: number
  totalStakedRaw: string
  totalStaked: string
  rewardBps: number
  rewardPercent: string
}

export interface DappStakeOverview {
  minStakePeak: number
  pools: DappStakePool[]
}

export interface DappStakeParams extends DappIxParams {
  positionId: string
  periodDays: number
  amountRaw: string
}

export interface DappUnstakeParams extends DappIxParams {
  positionId: string
  periodDays: number
}

export interface DappStakeRecord {
  id: string
  positionId: string
  periodDays: number
  amount: string
  claimedReward: string
  startTime: string | null
  unlockTime: string | null
  status: 'STAKING' | 'REDEEMABLE' | 'REDEEMED'
  stakeTxHash: string | null
  unstakeTxHash: string | null
  createdAt: string
}

export interface DappStakeRewardPosition {
  positionId: string
  periodDays: number
  amount: string
  pendingReward: string
  pendingRewardRaw: string
  claimedReward: string
  redeemed: boolean
}

export interface DappStakeRewardDaily {
  bizDate: string
  periodDays: number
  positionId: string
  staked: string
  poolStaked: string
  reward: string
  status: string
}

export interface DappStakeRewardsInfo {
  totalPending: string
  totalPendingRaw: string
  positions: DappStakeRewardPosition[]
  list: DappStakeRewardDaily[]
  total: number
  page: number
  pageSize: number
}

export interface DappClaimStakeRewardParams extends DappIxParams {
  positionId: string
  periodDays: number
  rewardRaw: string
  reward: string
}

// ---- 1推5 推广分红 / T7 加权分红 ----
export interface DappPromoDividendDaily {
  bizDate: string
  qualifiedCount: number
  directCount: number
  share: string
  status: 'ACCRUED' | 'CLAIMED'
  claimTxHash: string | null
}

export interface DappPromoSummary {
  pending: string
  pendingRaw: string
  // 实时统计（与每日结算同一口径）：全网达标总人数 / 本人是否达标 / 本人有效直推数
  qualifiedCount: number
  myQualified: boolean
  myValidDirectCount: number
  list: DappPromoDividendDaily[]
  total: number
  page: number
  pageSize: number
}

export interface DappT7DividendDaily {
  bizDate: string
  smallAreaUsdt: string
  share: string
  status: 'ACCRUED' | 'CLAIMED'
  claimTxHash: string | null
}

export interface DappT7Summary {
  pending: string
  pendingRaw: string
  list: DappT7DividendDaily[]
  total: number
  page: number
  pageSize: number
}

export interface DappDividendClaimParams extends DappIxParams {
  amountRaw: string
  amount: string
  recipientAta: string
}

export interface DappMarketPrice {
  symbol: string
  priceUsdt: string | null
  source: string | null
  ts: number
}

export interface DappAirdropConfig {
  priceUsdt: string | null
  multiplier: number
  dailyRateLow: string
  dailyRateHigh: string
  tierThresholdUsd: number
  minUsd: number
}

export interface DappAirdropParams extends DappIxParams {
  grantId: string
  amountRaw: string
  usdValueRaw: string
  usdValue: string
  dailyRate: string
  dailyAmount: string
  totalCap: string
}

export interface DappAirdropRecord {
  id: string
  grantId: string
  principal: string
  usdValue: string
  dailyRate: string
  dailyAmount: string
  totalCap: string
  released: string
  // 本包可提 = 本包累计释放 − 本包已提（每个订单单独计算）
  withdrawableRaw: string
  withdrawable: string
  withdrawableInt: string
  remainDays: number
  isOut: boolean
  sourceTxHash: string | null
  createdAt: string
}

// 单个空投包的每日释放（每日可提）记录
export interface DappAirdropReleaseRecord {
  id: string
  bizDate: string
  dayNo: number
  amount: string
  status: string
  txHash: string | null
  createdAt: string
}

// 空投加速汇总 + 链上可提余额（参与记录页展示）
export interface DappAirdropSummary {
  directStaticRaw: string
  directStatic: string
  directAccelRaw: string
  directAccel: string
  // 直推一次性加速（当日触发、次日归零）
  directOnceRaw: string
  directOnce: string
  // 团队级差加速（不含平级）
  teamAccelRaw: string
  teamAccel: string
  // 平级加速（单独展示）
  peerAccelRaw: string
  peerAccel: string
  teamAccelDate: string | null
  airdropCreditRaw: string
  airdropCredit: string
  // 小数点前整数（直接截断、不四舍五入），提币按钮可提数量
  withdrawableInt: string
}

// 空投收益提现（链上 withdraw_airdrop，扣 20% 手续费七份拆分，用户单签付 GAS）
export interface DappWithdrawParams extends DappIxParams {
  amountRaw: string
  amount: string
}

export interface DappZeroCardInfo {
  priceUsdt: string | null
  priceUsdtFixed: number
  peakAmount: string | null
  appPointsLayers: number
  myCount: number
}

export interface DappZeroCardParams extends DappIxParams {
  cardId: string
  amountRaw: string
  peakAmount: string
  usdValue: number
}

export interface DappZeroCardRecord {
  id: string
  cardId: string
  peakAmount: string
  usdValue: string
  status: string
  txHash: string | null
  createdAt: string
}

export interface DappConfirmResult {
  status: string
  txHash?: string
  message?: string
  [key: string]: unknown
}


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
  directPushNodes: number
  directPushRewards: string
  currentRanking: number
  referralLink: string
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
}

export interface TeamNodeRecord {
  walletAddress: string
  level: number
  joinedAt: string
  nodeQty: number
}

export interface ReferralReward {
  id: string
  rewardNo: string
  rewardLevel: number
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
  peakProgramId: string
  nextNodeIndex: number
  asset: string
  collection: string
  usdtMint: string
  treasury: string
  configPda: string
  saleStatePda: string
  emissionPda: string
  inventoryPda: string
  nodeInfoPda: string
  referralVaultPda: string
  buyerReferralPda: string
  buyerUsdtAta: string
  treasuryUsdtAta: string
  tokenProgramId: string
  referrerInfoPda?: string | null
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

export interface Banner {
  id: string
  title: string | null
  mediaType: 'IMAGE' | 'VIDEO'
  mediaUrl: string
  targetUrl: string | null
  sortOrder: number
}




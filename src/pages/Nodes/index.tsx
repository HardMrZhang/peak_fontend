import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Table, Pagination, message, Spin } from 'antd'
import {
  InboxOutlined,
  CrownOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  StarOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, TransactionInstruction, Transaction } from '@solana/web3.js'
import {
  getNodeInfo,
  getNodeBuyParams,
  confirmNodeBuy,
  cancelNodeBuyIntent,
  getRewardSummary,
  getDailyEarnings,
  getDailyReleases,
  getBalances,
  getMyNfts,
  getSaleSummary,
  getTeamLevelInfo,
} from '@/api'
import type {
  NodeSaleConfig,
  RewardSummary,
  DailyEarning,
  DailyRelease,
  AssetBalance,
  NftRecord,
  PageResult,
  TeamLevelInfo,
} from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { PEAK_YEAR1_ALLOC } from '@/constants'
import nftPreviewVideo from '@/assets/nft-preview.mp4'
import './index.css'
import '../TeamLevel/index.css'

const BUY_NODE_DISCRIMINATOR = new Uint8Array([224, 164, 165, 140, 70, 25, 52, 247])
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const TEAM_LEVEL_COLORS: Record<number, string> = {
  5: '#f5a623',
  4: '#52c41a',
  3: '#1890ff',
  2: '#722ed1',
  1: '#13c2c2',
}

async function waitForSignatureConfirmed(connection: ReturnType<typeof useConnection>['connection'], signature: string, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const resp = await connection.getSignatureStatuses([signature])
    const status = resp?.value?.[0]
    if (status) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`Transaction not confirmed within ${timeoutMs / 1000}s: ${signature}`)
}

export default function Nodes() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const token = useAuthStore((s) => s.token)
  const [activeTab, setActiveTab] = useState<'revenue' | 'release'>('revenue')
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const purchasingLock = useRef(false)
  const [cooldownSec, setCooldownSec] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pageSize = 10

  const [saleConfig, setSaleConfig] = useState<NodeSaleConfig | null>(null)
  const [userNodes, setUserNodes] = useState(0)
  const [reward, setReward] = useState<RewardSummary | null>(null)
  const [revenueData, setRevenueData] = useState<PageResult<DailyEarning> | null>(null)
  const [releaseData, setReleaseData] = useState<PageResult<DailyRelease> | null>(null)
  const [balances, setBalances] = useState<AssetBalance[]>([])
  const [nftData, setNftData] = useState<PageResult<NftRecord> | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [teamLevelInfo, setTeamLevelInfo] = useState<TeamLevelInfo | null>(null)

  const refreshSaleConfig = useCallback(() => {
    return getSaleSummary()
      .then((r) => setSaleConfig(r.data))
      .catch(() => { })
  }, [])

  const refreshUserData = useCallback(() => {
    if (!token) return Promise.resolve()
    return Promise.all([
      getNodeInfo().then((r) => {
        setSaleConfig(r.data.config)
        setUserNodes(r.data.userNodes)
      }).catch(() => { }),
      getRewardSummary().then((r) => setReward(r.data)).catch(() => { }),
      getBalances().then((r) => setBalances(r.data)).catch(() => { }),
      getMyNfts({ page: 1, pageSize: 20 }).then((r) => setNftData(r.data)).catch(() => { }),
      getTeamLevelInfo().then((r) => setTeamLevelInfo(r.data)).catch(() => { }),
    ])
  }, [token])

  const refreshData = useCallback(() => {
    refreshSaleConfig()
    refreshUserData()
  }, [refreshSaleConfig, refreshUserData])

  useEffect(() => {
    setInfoLoading(true)
    refreshSaleConfig().finally(() => setInfoLoading(false))
  }, [refreshSaleConfig])

  useEffect(() => {
    if (!token) { return }
    setInfoLoading(true)
    refreshUserData().finally(() => setInfoLoading(false))
  }, [token, refreshUserData])

  const fetchTab = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    const done = () => setTableLoading(false)
    if (activeTab === 'revenue') {
      getDailyEarnings({ page, pageSize }).then((r) => setRevenueData(r.data)).catch(() => { }).finally(done)
    } else {
      getDailyReleases({ page, pageSize }).then((r) => setReleaseData(r.data)).catch(() => { }).finally(done)
    }
  }, [token, activeTab, page, pageSize])

  useEffect(() => { fetchTab() }, [fetchTab])

  const emptyText = (
    <div className="table-empty">
      <InboxOutlined className="table-empty-icon" />
      <span className="table-empty-text">{t('common.noData')}</span>
    </div>
  )

  const startCooldown = useCallback((seconds = 10) => {
    setCooldownSec(seconds)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldownSec((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  const confirmWithRetry = useCallback(async (sig: string, asset: string, intentId: string, maxRetries = 5) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await confirmNodeBuy(sig, asset, intentId)
        return
      } catch (err) {
        if (attempt === maxRetries - 1) throw err
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      }
    }
  }, [])

  const handlePurchase = async () => {
    if (purchasingLock.current) return
    if (!publicKey || !sendTransaction || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }

    if (insufficientBalance) {
      message.warning(t('nodes.insufficientBalance'))
      return
    }

    purchasingLock.current = true
    setPurchasing(true)
    let intentIdForCancel = ''
    let txSignature = ''
    try {
      const paramsRes = await getNodeBuyParams()
      const p = paramsRes.data
      intentIdForCancel = p.intentId

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(p.configPda), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(p.saleStatePda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.emissionPda), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(p.asset), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.collection), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.inventoryPda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.nodeInfoPda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.buyerReferralPda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ]

      const ix = new TransactionInstruction({
        programId: new PublicKey(p.peakProgramId),
        keys,
        data: Buffer.from(BUY_NODE_DISCRIMINATOR),
      })
      const memoIx = new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(`PEAK Buy Node NFT #${p.nextNodeIndex}`, 'utf-8'),
      })

      const tx = new Transaction().add(memoIx, ix)
      const sig = await sendTransaction(tx, connection)
      txSignature = sig
      await waitForSignatureConfirmed(connection, sig)

      await confirmWithRetry(sig, p.asset, p.intentId)

      message.success(t('nodes.purchaseSuccess'))
      setPurchaseOpen(false)
      startCooldown(10)
      refreshData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const isUserRejected = errMsg.includes('User rejected') || errMsg.includes('rejected the request')
      const shouldCancelIntent = !!intentIdForCancel && !txSignature && isUserRejected
      if (shouldCancelIntent) {
        try {
          await cancelNodeBuyIntent(intentIdForCancel)
          message.info('Purchase cancelled, funds released')
        } catch {
          // keep original error as main output
        }
      }
      if (!errMsg.includes('User rejected')) {
        message.error(errMsg)
      }
      startCooldown(10)
      refreshData()
    } finally {
      purchasingLock.current = false
      setPurchasing(false)
    }
  }

  const soldNodes = saleConfig?.soldNodes ?? 0
  const totalNodes = saleConfig?.totalNodes ?? 10000
  const nodePrice = saleConfig?.nodePriceUsdt ?? '500'
  const estimatedCost = Number(nodePrice) || 0
  const availableUsdt = parseFloat(balances.find(b => b.asset === 'USDT')?.availableAmount ?? '0')
  const insufficientBalance = availableUsdt < estimatedCost
  const progress = totalNodes > 0 ? (soldNodes / totalNodes) * 100 : 0
  const isSoldOut = saleConfig?.status === 'SOLD_OUT' || (totalNodes > 0 && soldNodes >= totalNodes)

  const revenueColumns: ColumnsType<DailyEarning> = [
    { title: t('nodes.colDate'), dataIndex: 'bizDate', width: 120 },
    { title: t('nodes.colPerNodeEarning'), dataIndex: 'perNodePeak', width: 160, render: (v: string) => <span style={{ color: '#52c41a' }}>+{parseFloat(v).toFixed(4)} PEAK</span> },
    { title: t('nodes.colMyTotal'), dataIndex: 'myTotal', width: 160, render: (v: string) => <span style={{ color: '#52c41a' }}>+{parseFloat(v).toFixed(4)} PEAK</span> },
  ]

  const releaseColumns: ColumnsType<DailyRelease> = [
    { title: t('nodes.colDate'), dataIndex: 'bizDate', width: 120 },
    { title: t('nodes.colMyTotalRelease'), dataIndex: 'totalRelease', width: 160, render: (v: string) => <span style={{ color: '#52c41a' }}>+{parseFloat(v).toFixed(4)} PEAK</span> },
  ]

  const currentData = activeTab === 'revenue' ? revenueData : releaseData

  const teamCurrentLevelLabel = teamLevelInfo
    ? teamLevelInfo.level < 0
      ? t('teamLevel.normalUser')
      : teamLevelInfo.label
    : '--'
  const teamCurrentLevelNum = teamLevelInfo?.level ?? -1

  const nftColumns: ColumnsType<NftRecord> = [
    { title: t('nodes.nftMintNo'), dataIndex: 'mintNo', width: 150 },
    { title: t('nodes.nftTokenId'), dataIndex: 'tokenId', width: 220, render: (v: string | null) => v || '--' },
    { title: t('nodes.nftRewardToken'), dataIndex: 'rewardToken', width: 120, render: (v?: string) => v || 'PEAK' },
    {
      title: t('nodes.nftMintDate'),
      dataIndex: 'mintedAt',
      width: 160,
      render: (v: string | null, record: NftRecord) => (v || record.createdAt)?.slice(0, 10) || '--',
    },
    {
      title: t('nodes.nftAccumulatedReward'),
      dataIndex: 'accumulatedReward',
      width: 170,
      render: (v: string | undefined, record: NftRecord) => `${parseFloat(v || '0').toFixed(2)} ${record.rewardToken || 'PEAK'}`,
    },
    { title: t('table.status'), dataIndex: 'status', width: 120, render: (v: string) => t(`account.status.${v}`, v) },
  ]

  return (
    <div className="nodes-page">
      <div className="nodes-hero">
        <div className="nodes-hero-bg" />
        <div className="nodes-inner">
          <h1 className="page-title">{t('nodes.title')}</h1>

          <div className="sale-section">
            <div className="sale-header">
              <span className="sale-icon">✦</span>
              <span className="sale-title">{t('nodes.nodeSales')}</span>
              <span className="what-is-nft" onClick={() => setInfoOpen(true)}>{t('nodes.whatIsNft')}</span>
            </div>
            <div className="sale-info">
              <Button
                className="purchase-btn"
                onClick={() => setPurchaseOpen(true)}
                disabled={isSoldOut}
              >
                {isSoldOut ? t('nodes.soldOut') : t('nodes.purchaseNodes')}
              </Button>
            </div>
            {/* 销毁倒计时文字已隐藏，对应销毁程序不执行 */}
            <div className="sale-benefit">
              ✦ {t('nodes.benefitText')}
            </div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}>
                  <span className="progress-text">{soldNodes}</span>
                </div>
              </div>
              <span className="progress-total">/{totalNodes}</span>
            </div>
            
          </div>
        </div>
      </div>

      <Spin spinning={infoLoading}>
        <div className="nodes-inner">
          <div className="info-section">
            <h2 className="section-title">
              {t('nodes.nodeInfo')}
            </h2>
            <div className="info-cards">
              <div className="info-card">
                <span className="info-label">{t('nodes.peakAllocLabel')}</span>
                <span className="info-value">{PEAK_YEAR1_ALLOC.toLocaleString()}</span>
              </div>
              <div className="info-card">
                <span className="info-label">{t('nodes.nodesSoldLabel')}</span>
                <span className="info-value">{infoLoading ? '--' : soldNodes.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="my-section">
            <h2 className="section-title">{t('nodes.myInfo')}</h2>
            <div className="info-cards">
              <div className="info-card">
                <div className="peak-dual">
                  <div className="peak-dual-item">
                    <span className="info-label">{t('nodes.availablePeak')}</span>
                    <span className="info-value orange">{infoLoading ? '--' : parseFloat(reward?.totalLocked ?? '0').toFixed(2)} PEAK</span>
                  </div>
                  <div className="peak-dual-divider" />
                  <div className="peak-dual-item">
                    <span className="info-label">{t('nodes.peakReleased')}</span>
                    <div className="peak-released-row">
                      <span className="info-value orange">{infoLoading ? '--' : parseFloat(reward?.totalReleased ?? '0').toFixed(2)} PEAK</span>
                      <Button className="withdrawal-small-btn" onClick={() => navigate('/account/withdrawal')}>{t('nodes.withdrawal')}</Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="info-card">
                <span className="info-label">{t('nodes.myNodes')}</span>
                <span className="info-value orange">{infoLoading ? '--' : userNodes}</span>
              </div>
              <div className="info-card">
                <span className="info-label">{t('nodes.yesterdayRevenue')}</span>
                <span className="info-value orange">{infoLoading ? '--' : parseFloat(reward?.myYesterdayReward ?? '0').toFixed(2)} PEAK</span>
              </div>
            </div>
          </div>

          <div className="records-section">
            <div className="nft-rewards-section">
              <h2 className="section-title">{t('nodes.nftRewardTitle')}</h2>
              <Table
                columns={nftColumns}
                dataSource={nftData?.list ?? []}
                rowKey="id"
                pagination={false}
                size="small"
                locale={{ emptyText }}
              />
            </div>

            <div className="records-layout">
              <div className="records-tabs">
                <span
                  className={`records-tab ${activeTab === 'revenue' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('revenue'); setPage(1) }}
                >
                  {activeTab === 'revenue' && <span className="tab-indicator">|</span>}
                  {t('nodes.revenueRecord')}
                </span>
                <span
                  className={`records-tab ${activeTab === 'release' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('release'); setPage(1) }}
                >
                  {activeTab === 'release' && <span className="tab-indicator">|</span>}
                  {t('nodes.releaseRecord')}
                </span>
              </div>

              <div className="records-table">
                <Table
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  columns={(activeTab === 'revenue' ? revenueColumns : releaseColumns) as ColumnsType<any>}
                  dataSource={currentData?.list ?? []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  loading={tableLoading}
                  locale={{ emptyText }}
                />
                {(currentData?.total ?? 0) > 0 && (
                  <div className="records-pagination">
                    <Pagination
                      current={page}
                      total={currentData?.total ?? 0}
                      pageSize={pageSize}
                      onChange={setPage}
                      showSizeChanger={false}
                      showQuickJumper
                      size="small"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Spin>

      {/* Team Level Section */}
      <div className="nodes-inner">
        <div className="team-level-embedded">
          <h2 className="section-title">{t('teamLevel.title')}</h2>
          <p className="team-level-subtitle">{t('teamLevel.subtitle')}</p>

          <Spin spinning={infoLoading}>
            <div className="my-level-section">
              <h2 className="section-title-tl">
                <CrownOutlined className="section-icon" />
                {t('teamLevel.myTeamLevel')}
              </h2>
              <div className="level-cards">
                <div className="level-card level-card-main">
                  <div className="level-badge-wrap">
                    <div
                      className="level-badge"
                      style={{
                        background: teamCurrentLevelNum >= 1
                          ? `linear-gradient(135deg, ${TEAM_LEVEL_COLORS[teamCurrentLevelNum] || '#f5a623'}, ${TEAM_LEVEL_COLORS[teamCurrentLevelNum] || '#f5a623'}88)`
                          : 'linear-gradient(135deg, #555, #333)',
                      }}
                    >
                      <CrownOutlined className="level-badge-icon" />
                      <span className="level-badge-text">{teamCurrentLevelLabel}</span>
                    </div>
                  </div>
                  <div className="level-meta">
                    <span className="level-meta-label">{t('teamLevel.currentLevel')}</span>
                    <span className="level-meta-value">{teamCurrentLevelLabel}</span>
                  </div>
                </div>

                <div className="level-card">
                  <TeamOutlined className="level-card-icon" />
                  <span className="level-card-label">{t('teamLevel.teamNftCount')}</span>
                  <span className="level-card-value orange">{teamLevelInfo?.teamNftCount ?? '--'}</span>
                </div>

                <div className="level-card">
                  <SafetyCertificateOutlined className="level-card-icon" />
                  <span className="level-card-label">{t('teamLevel.ownNftCount')}</span>
                  <span className="level-card-value">{teamLevelInfo?.ownNftCount ?? '--'}</span>
                </div>

                <div className="level-card">
                  <LockOutlined className="level-card-icon" />
                  <span className="level-card-label">{t('teamLevel.lockDays')}</span>
                  <span className="level-card-value">
                    {teamLevelInfo ? `${teamLevelInfo.lockDays}${t('teamLevel.days')}` : '--'}
                  </span>
                </div>

                <div className="level-card">
                  <StarOutlined className="level-card-icon" />
                  <span className="level-card-label">{t('teamLevel.pointsMultiplier')}</span>
                  <span className="level-card-value orange">
                    {teamLevelInfo ? `${teamLevelInfo.pointsMultiplier}${t('teamLevel.times')}` : '--'}
                  </span>
                </div>
              </div>
            </div>
          </Spin>

          {/* 等级规则表已隐藏，功能保留 */}

          <div className="rules-desc-section">
            <div className="rules-desc-list">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="rules-desc-item">
                  <span className="rules-desc-num">{n}</span>
                  <span className="rules-desc-text">{t(`teamLevel.ruleDesc${n}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={purchaseOpen}
        onCancel={() => setPurchaseOpen(false)}
        footer={null}
        centered
        className="purchase-cool-modal"
        width={720}
      >
        <h2 className="purchase-modal-title">{t('nodes.purchaseTitle')}</h2>
        <p className="purchase-nft-note">{t('nodes.nftNote')}</p>
        <div className="purchase-content">
          <div className="purchase-nft-preview">
            <video
              key={purchaseOpen ? 'open' : 'closed'}
              src={nftPreviewVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              aria-hidden="true"
              className="preview-video"
              onCanPlay={(e) => {
                const v = e.currentTarget
                if (v.paused) v.play().catch(() => { })
              }}
            />
            <span className="nft-qty">x1</span>
          </div>
          <div className="purchase-form">
            <div className="form-row">
              <span className="form-label">{t('nodes.nodeName')}</span>
              <span className="form-value">{t('nodes.nodeNameValue')}</span>
            </div>
            <div className="form-row">
              <span className="form-label">{t('nodes.nodePrice')}</span>
              <span className="form-value orange">{nodePrice} USDT</span>
            </div>
            <div className="form-row">
              <span className="form-label">{t('nodes.qtyLabel')}</span>
              <span className="form-value">1</span>
            </div>
            <div className="form-row form-row-emphasis">
              <span className="form-label">{t('nodes.estimatedCost')}</span>
              <span className="form-value orange">{estimatedCost.toFixed(2)} USDT</span>
            </div>
            <div className="form-row">
              <span className="form-label">{t('nodes.balanceAvailable')}</span>
              <span className="form-value orange">
                {balances.find(b => b.asset === 'USDT')?.availableAmount ?? '0'} USDT
                <span className="topup-link" onClick={() => { setPurchaseOpen(false); navigate('/account/topup') }}>{t('nodes.topUp')}</span>
              </span>
            </div>
            {insufficientBalance && (
              <div className="insufficient-tip">{t('nodes.insufficientBalance')}</div>
            )}
            <Button className="confirm-purchase-btn" block onClick={handlePurchase} loading={purchasing} disabled={insufficientBalance || cooldownSec > 0}>
              {cooldownSec > 0 ? `${t('nodes.confirmPurchase')} (${cooldownSec}s)` : t('nodes.confirmPurchase')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        footer={null}
        centered
        className="dark-modal"
        width={560}
      >
        <div className="info-modal">
          <h2>{t('nodes.nftTitle')}</h2>
          <p>{t('nodes.nftDesc1')}</p>
          <p>{t('nodes.nftDesc2')}</p>
          <h3>{t('nodes.nftBenefit')}</h3>
          <p>{t('nodes.nftBenefitDesc')}</p>
          <h3>{t('nodes.nftBonusTitle')}</h3>
          <p>{t('nodes.nftBonusDesc')}</p>
          <h3>{t('nodes.nftPromoTitle')}</h3>
          <p>{t('nodes.nftPromoDesc')}</p>
          <h3>{t('nodes.nftWhitelistTitle')}</h3>
          <p>{t('nodes.nftWhitelistDesc')}</p>
        </div>
      </Modal>
    </div>
  )
}

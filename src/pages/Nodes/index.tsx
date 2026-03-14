import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, InputNumber, Table, Pagination, message, Spin } from 'antd'
import { MinusOutlined, PlusOutlined, InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, TransactionInstruction, Transaction } from '@solana/web3.js'
import {
  getNodeInfo,
  getNodeBuyParams,
  confirmNodeBuy,
  getRewardSummary,
  getRewardLots,
  getLedger,
  getBalances,
  getMyNfts,
  getSaleSummary,
} from '@/api'
import type {
  NodeSaleConfig,
  RewardSummary,
  RewardLot,
  LedgerEntry,
  AssetBalance,
  NftRecord,
  PageResult,
} from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { PEAK_TOTAL_SUPPLY, PEAK_YEAR1_ALLOC } from '@/constants'
import nftPreviewVideo from '@/assets/nft-preview.mp4'
import './index.css'

const BUY_NODE_DISCRIMINATOR = Buffer.from([224, 164, 165, 140, 70, 25, 52, 247])
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
const NODE_DESTROY_DATE = new Date('2026-06-06T00:00:00')

function useCountdown(target: Date) {
  const calc = useCallback(() => {
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff / 3600000) % 24),
      minutes: Math.floor((diff / 60000) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    }
  }, [target])
  const [timeLeft, setTimeLeft] = useState(calc)
  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calc()), 1000)
    return () => clearInterval(timer)
  }, [calc])
  return timeLeft
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
  const destroyCountdown = useCountdown(NODE_DESTROY_DATE)
  const token = useAuthStore((s) => s.token)
  const [activeTab, setActiveTab] = useState<'revenue' | 'release'>('revenue')
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [qty, setQty] = useState(1)
  const [page, setPage] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const pageSize = 10

  const [saleConfig, setSaleConfig] = useState<NodeSaleConfig | null>(null)
  const [userNodes, setUserNodes] = useState(0)
  const [reward, setReward] = useState<RewardSummary | null>(null)
  const [revenueData, setRevenueData] = useState<PageResult<LedgerEntry> | null>(null)
  const [releaseData, setReleaseData] = useState<PageResult<RewardLot> | null>(null)
  const [balances, setBalances] = useState<AssetBalance[]>([])
  const [nftData, setNftData] = useState<PageResult<NftRecord> | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)

  const refreshSaleConfig = useCallback(() => {
    getSaleSummary().then((r) => setSaleConfig(r.data)).catch(() => { })
  }, [])

  const refreshUserData = useCallback(() => {
    if (!token) return
    Promise.all([
      getNodeInfo().then((r) => {
        setSaleConfig(r.data.config)
        setUserNodes(r.data.userNodes)
      }).catch(() => { }),
      getRewardSummary().then((r) => setReward(r.data)).catch(() => { }),
      getBalances().then((r) => setBalances(r.data)).catch(() => { }),
      getMyNfts({ page: 1, pageSize: 20 }).then((r) => setNftData(r.data)).catch(() => { }),
    ])
  }, [token])

  const refreshData = useCallback(() => {
    refreshSaleConfig()
    refreshUserData()
  }, [refreshSaleConfig, refreshUserData])

  useEffect(() => {
    setInfoLoading(true)
    refreshSaleConfig()
    setInfoLoading(false)
  }, [refreshSaleConfig])

  useEffect(() => {
    if (!token) { return }
    setInfoLoading(true)
    refreshUserData()
    setInfoLoading(false)
  }, [token, refreshUserData])

  const fetchTab = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    const done = () => setTableLoading(false)
    if (activeTab === 'revenue') {
      getLedger({ asset: 'PEAK', page, pageSize }).then((r) => setRevenueData(r.data)).catch(() => { }).finally(done)
    } else {
      getRewardLots({ page, pageSize }).then((r) => setReleaseData(r.data)).catch(() => { }).finally(done)
    }
  }, [token, activeTab, page, pageSize])

  useEffect(() => { fetchTab() }, [fetchTab])

  const emptyText = (
    <div className="table-empty">
      <InboxOutlined className="table-empty-icon" />
      <span className="table-empty-text">{t('common.noData')}</span>
    </div>
  )

  const handlePurchase = async () => {
    if (!publicKey || !sendTransaction || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }

    if (insufficientBalance) {
      message.warning(t('nodes.insufficientBalance'))
      return
    }

    setPurchasing(true)
    try {
      for (let i = 0; i < qty; i++) {
        const paramsRes = await getNodeBuyParams()
        const p = paramsRes.data

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
          data: BUY_NODE_DISCRIMINATOR,
        })

        const tx = new Transaction().add(ix)
        const sig = await sendTransaction(tx, connection)
        await waitForSignatureConfirmed(connection, sig)

        await confirmNodeBuy(sig, p.asset)

        if (qty > 1) {
          message.success(`${t('nodes.purchaseSuccess')} (${i + 1}/${qty})`)
        }
      }

      message.success(t('nodes.purchaseSuccess'))
      setPurchaseOpen(false)
      refreshData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('User rejected')) {
        message.error(errMsg)
      }
    } finally {
      setPurchasing(false)
    }
  }

  const soldNodes = saleConfig?.soldNodes ?? 0
  const totalNodes = saleConfig?.totalNodes ?? 10000
  const nodePrice = saleConfig?.nodePriceUsdt ?? '500'
  const estimatedCost = qty * (Number(nodePrice) || 0)
  const availableUsdt = parseFloat(balances.find(b => b.asset === 'USDT')?.availableAmount ?? '0')
  const insufficientBalance = availableUsdt < estimatedCost
  const progress = totalNodes > 0 ? (soldNodes / totalNodes) * 100 : 0

  const revenueColumns: ColumnsType<LedgerEntry> = [
    { title: t('table.type'), dataIndex: 'changeType', width: 120, render: (v: string) => t(`account.changeType.${v}`, v) },
    { title: t('table.time'), dataIndex: 'createdAt', width: 160, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
    { title: t('table.status'), dataIndex: 'direction', width: 100, render: (v: string) => v === 'IN' ? t('data.revenue') : t('data.purchase') },
    { title: t('table.quantity'), dataIndex: 'amount', width: 120, render: (v: string, r: LedgerEntry) => <span style={{ color: r.direction === 'IN' ? '#52c41a' : '#ff4d4f' }}>{r.direction === 'IN' ? '+' : '-'}{parseFloat(v).toFixed(2)}</span> },
  ]

  const releaseColumns: ColumnsType<RewardLot> = [
    { title: t('table.type'), dataIndex: 'sourceType', width: 140, render: (v: string) => t(`account.bizType.${v}`, v) },
    { title: t('table.quantity'), dataIndex: 'lockedAmount', width: 120, render: (v: string) => <span style={{ color: '#52c41a' }}>+{parseFloat(v).toFixed(2)}</span> },
    { title: t('table.status'), dataIndex: 'status', width: 120, render: (v: string) => t(`account.status.${v}`, v) },
    { title: t('table.time'), dataIndex: 'startDate', width: 160 },
  ]

  const currentData = activeTab === 'revenue' ? revenueData : releaseData
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
              <span className="sale-text">
                {t('nodes.salePeriod')}: {saleConfig?.saleStartAt?.slice(0, 10) ?? '—'} — {saleConfig?.saleEndAt?.slice(0, 10) ?? '—'}
              </span>
              <Button
                className="purchase-btn"
                onClick={() => setPurchaseOpen(true)}
              >
                {t('nodes.purchaseNodes')}
              </Button>
            </div>
            <div className="sale-destroy">
              <span className="sale-destroy-text">
                {t('nodes.destroyNotice', { date: 'June 6, 2026' })}
              </span>
              <span className="sale-destroy-countdown">
                <span className="cd-block">{String(destroyCountdown.days).padStart(2, '0')}</span>
                <span className="cd-label">{t('nodes.cdDays')}</span>
                <span className="cd-block">{String(destroyCountdown.hours).padStart(2, '0')}</span>
                <span className="cd-label">{t('nodes.cdHours')}</span>
                <span className="cd-block">{String(destroyCountdown.minutes).padStart(2, '0')}</span>
                <span className="cd-label">{t('nodes.cdMinutes')}</span>
                <span className="cd-block">{String(destroyCountdown.seconds).padStart(2, '0')}</span>
                <span className="cd-label">{t('nodes.cdSeconds')}</span>
              </span>
            </div>
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
                <span className="info-label">{t('nodes.perNodePeakLabel')}</span>
                <span className="info-value orange">{infoLoading ? '--' : soldNodes > 0 ? (PEAK_TOTAL_SUPPLY / soldNodes).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'} PEAK</span>
                <span className="info-formula">{PEAK_TOTAL_SUPPLY.toLocaleString()} PEAK ÷ {soldNodes.toLocaleString()} {t('nodes.formulaSoldNodes')}</span>
              </div>
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
                <span className="info-formula">{t('nodes.yesterdayRevenueFormula')}</span>
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
            <video src={nftPreviewVideo} autoPlay loop muted playsInline className="preview-video" />
            <span className="nft-qty">x{qty}</span>
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
              <div className="qty-control">
                <button className="qty-btn" onClick={() => setQty(Math.max(1, qty - 1))}><MinusOutlined /></button>
                <InputNumber
                  min={1}
                  max={10}
                  value={qty}
                  onChange={(v) => setQty(v ?? 1)}
                  controls={false}
                  className="qty-input"
                />
                <button className="qty-btn" onClick={() => setQty(Math.min(10, qty + 1))}><PlusOutlined /></button>
              </div>
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
            <Button className="confirm-purchase-btn" block onClick={handlePurchase} loading={purchasing} disabled={insufficientBalance}>
              {t('nodes.confirmPurchase')}
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

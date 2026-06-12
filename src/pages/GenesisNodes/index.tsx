import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Table, Pagination, message, Spin, Tooltip } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, TransactionInstruction, Transaction, SystemProgram, Connection, ComputeBudgetProgram } from '@solana/web3.js'
import {
  getGenesisSaleInfo,
  getGenesisBuyParams,
  cancelGenesisBuyIntent,
  confirmGenesisBuy,
  getGenesisVipLevel,
  getGenesisVipTeamDetail,
  getGenesisOrders,
} from '@/api'
import type { GenesisVipTeamDetail } from '@/api'
import type { GenesisOrder, PageResult } from '@/types'
import './index.css'

const GENESIS_PROGRAM_ID = new PublicKey('Fm8qxJKKZPGQyMezF7NkAQT5wHkDyDTp1KVDeRDKmzVg')
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const FAST_RPC = new Connection('https://mainnet.helius-rpc.com/?api-key=fc56707a-a30e-4676-9895-b5c37cbba6a2', 'confirmed')

const BUY_GENESIS_DISCRIMINATOR = new Uint8Array([
  0x59, 0xb4, 0x33, 0x97, 0x8d, 0x10, 0xd4, 0xb8,
])

const SALE_PDA = new PublicKey('Ahj2bbRwTMnKyyk3pNgpAe1WgvT3BUesYJTDdnJCu5mn')

const NODE_PRICE = 500
const MAX_SUPPLY = 3000
async function hasTransactionLanded(signature: string, connection: ReturnType<typeof useConnection>['connection']) {
  for (let i = 0; i < 3; i += 1) {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (tx) {
      if (tx.meta?.err) {
        throw new Error('Transaction failed on chain')
      }
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  return false
}

interface GenesisSaleData {
  premintedTotal: number
  soldTotal: number
  peakAirdropAmount: number
}

function parseGenesisSaleState(data: Buffer): Omit<GenesisSaleData, 'peakAirdropAmount'> | null {
  if (data.length < 17) return null
  return {
    premintedTotal: data.readUInt32LE(8),
    soldTotal: data.readUInt32LE(12),
  }
}

export default function GenesisNodes() {
  const { t } = useTranslation()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const purchasingLock = useRef(false)

  const [saleData, setSaleData] = useState<GenesisSaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [vipLevel, setVipLevel] = useState(0)
  const [vipLabel, setVipLabel] = useState('T0')
  const [orderData, setOrderData] = useState<PageResult<GenesisOrder> | null>(null)
  const [orderPage, setOrderPage] = useState(1)
  const [orderLoading, setOrderLoading] = useState(false)
  const orderPageSize = 10

  const [teamDetail, setTeamDetail] = useState<GenesisVipTeamDetail | null>(null)
  const [teamDetailLoading, setTeamDetailLoading] = useState(false)
  const teamDetailLoaded = useRef(false)

  const loadTeamDetail = useCallback(async () => {
    if (teamDetailLoaded.current || !localStorage.getItem('peak_token')) return
    teamDetailLoaded.current = true
    setTeamDetailLoading(true)
    try {
      const res = await getGenesisVipTeamDetail()
      if (res.data) setTeamDetail(res.data)
    } catch {
      teamDetailLoaded.current = false
    } finally {
      setTeamDetailLoading(false)
    }
  }, [])

  const readChainSaleState = useCallback(async () => {
    try {
      const accountInfo = await connection.getAccountInfo(SALE_PDA)
      if (accountInfo?.data) {
        const parsed = parseGenesisSaleState(accountInfo.data as Buffer)
        if (parsed) setSaleData((prev) => ({ peakAirdropAmount: prev?.peakAirdropAmount ?? 0, ...parsed }))
      }
    } catch {
      /* chain read failed, try API fallback */
    }
  }, [connection])

  const refreshData = useCallback(async () => {
    setLoading(true)
    try {
      await readChainSaleState()

      try {
        const res = await getGenesisSaleInfo()
        if (res.data) {
          setSaleData({
            premintedTotal: res.data.premintedTotal,
            soldTotal: res.data.soldTotal,
            peakAirdropAmount: Number(res.data.peakAirdropAmount) || 0,
          })
        }
      } catch {
        /* API not ready, use chain data */
      }

      const token = localStorage.getItem('peak_token')
      if (token) {
        try {
          const vipRes = await getGenesisVipLevel()
          if (vipRes.data) {
            setVipLevel(vipRes.data.vipLevel)
            const label = vipRes.data.vipLabel || 'T0'
            setVipLabel(label.replace(/^V/i, 'T'))
          }
        } catch {
          /* VIP not available yet */
        }
      }
    } finally {
      setLoading(false)
    }
  }, [readChainSaleState])

  const fetchOrders = useCallback(() => {
    const token = localStorage.getItem('peak_token')
    if (!token) return
    setOrderLoading(true)
    getGenesisOrders({ page: orderPage, pageSize: orderPageSize })
      .then((r) => setOrderData(r.data))
      .catch(() => {})
      .finally(() => setOrderLoading(false))
  }, [orderPage, orderPageSize])

  useEffect(() => {
    refreshData()
  }, [refreshData, connected])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])


  const handlePurchase = async () => {
    if (purchasingLock.current) return
    if (!publicKey || !sendTransaction || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    purchasingLock.current = true
    setPurchasing(true)
    let intentId: string | null = null
    let txSig: string | null = null
    try {
      const paramsRes = await getGenesisBuyParams(quantity)
      const p = paramsRes.data
      intentId = p.intentId
      const buyerUsdtAtaPk = new PublicKey(p.buyerUsdtAta)
      const buyerPeakAtaPk = new PublicKey(p.buyerPeakAta)
      const usdtMintPk = new PublicKey(p.usdtMint)
      const peakMintPk = new PublicKey(p.peakMint)

      const ataEntries: { ata: PublicKey; owner: PublicKey; mint: PublicKey }[] = [
        { ata: buyerUsdtAtaPk, owner: publicKey, mint: usdtMintPk },
        { ata: buyerPeakAtaPk, owner: publicKey, mint: peakMintPk },
      ]
      if (p.referrerUsdtAta && p.referrerWallet) {
        ataEntries.push({
          ata: new PublicKey(p.referrerUsdtAta),
          owner: new PublicKey(p.referrerWallet),
          mint: usdtMintPk,
        })
      }
      const ataCreateIxs = ataEntries.map((item) => new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: item.ata, isSigner: false, isWritable: true },
          { pubkey: item.owner, isSigner: false, isWritable: false },
          { pubkey: item.mint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]),
      }))

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(p.configPda), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(p.salePda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.collection), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.inventoryPda), isSigner: false, isWritable: true },
        { pubkey: buyerUsdtAtaPk, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.mixerUsdtAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.multisigUsdtAta), isSigner: false, isWritable: true },
        { pubkey: buyerPeakAtaPk, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.peakSourceAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.programAuthority), isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ]

      // remaining_accounts layout must match on-chain exactly:
      // [assets...][nftInfoPdas...][referrerUsdtAta?]
      const assetKeys = p.nfts.map((nft) => ({
        pubkey: new PublicKey(nft.asset),
        isSigner: false,
        isWritable: true,
      }))
      const nftInfoKeys = p.nfts.map((nft) => ({
        pubkey: new PublicKey(nft.nftInfoPda),
        isSigner: false,
        isWritable: true,
      }))
      keys.push(...assetKeys, ...nftInfoKeys)
      if (p.referrerUsdtAta) {
        keys.push({ pubkey: new PublicKey(p.referrerUsdtAta), isSigner: false, isWritable: true })
      }

      const dataBuffer = new Uint8Array(10)
      dataBuffer.set(BUY_GENESIS_DISCRIMINATOR, 0)
      dataBuffer[8] = quantity
      dataBuffer[9] = p.referrerUsdtAta ? 1 : 0

      const ix = new TransactionInstruction({
        programId: GENESIS_PROGRAM_ID,
        keys,
        data: Buffer.from(dataBuffer),
      })

      const memoIx = new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(`PEAK Genesis NFT x${quantity}`, 'utf-8'),
      })

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ...ataCreateIxs,
        memoIx,
        ix,
      )

      const sig = await sendTransaction(tx, connection, {
        skipPreflight: true,
      })
      txSig = sig

      const startMs = Date.now()
      const TIMEOUT_MS = 60_000
      let confirmed = false
      while (Date.now() - startMs < TIMEOUT_MS) {
        const resp = await FAST_RPC.getSignatureStatuses([sig])
        const status = resp?.value?.[0]
        if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          confirmed = true
          break
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (!confirmed) {
        const landed = await hasTransactionLanded(sig, FAST_RPC)
        if (!landed) throw new Error('Transaction confirmation timeout')
      }

      const confirmedSig = sig

      try {
        await confirmGenesisBuy(confirmedSig, p.intentId)
      } catch { /* backend confirm optional */ }

      message.success(t('genesis.purchaseSuccess'))
      setPurchaseOpen(false)
      setQuantity(1)
      refreshData()
      fetchOrders()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (intentId && txSig) {
        try {
          await confirmGenesisBuy(txSig, intentId)
          message.success(t('genesis.purchaseSuccess'))
          setPurchaseOpen(false)
          setQuantity(1)
          refreshData()
          fetchOrders()
          return
        } catch {
          // fallback to regular error path below
        }
      }

      if (intentId) {
        try {
          await cancelGenesisBuyIntent(intentId)
        } catch {
          // best-effort rollback
        }
      }
      if (!errMsg.includes('User rejected')) {
        console.error('[Genesis Purchase Error]', err)
        const displayMsg = errMsg.length > 120 ? errMsg.slice(0, 120) + '...' : errMsg
        message.error(`${t('genesis.purchaseFailed')}: ${displayMsg}`)
      }
      refreshData()
      fetchOrders()
    } finally {
      purchasingLock.current = false
      setPurchasing(false)
    }
  }

  const soldTotal = saleData?.soldTotal ?? 0
  const remaining = MAX_SUPPLY - soldTotal
  const progress = MAX_SUPPLY > 0 ? (soldTotal / MAX_SUPPLY) * 100 : 0
  const totalCost = NODE_PRICE * quantity

  const statusLabelMap: Record<string, string> = {
    PENDING: t('account.status.PENDING'),
    PAID: t('account.status.PAID'),
    FAILED: t('account.status.FAILED'),
    CANCELLED: t('account.status.CANCELLED'),
    CONFIRMED: t('account.status.CONFIRMED'),
    SUCCESS: t('account.status.SUCCESS'),
    COMPLETED: t('account.status.COMPLETED'),
  }

  const orderColumns: ColumnsType<GenesisOrder> = [
    { title: t('genesis.orderColNo'), dataIndex: 'orderNo', width: 140 },
    { title: t('genesis.orderColProduct'), width: 130, render: () => t('genesis.orderColProductName') },
    { title: t('genesis.orderColQty'), dataIndex: 'qty', width: 70, render: (v: number) => <span style={{ color: '#f5a623' }}>{v}</span> },
    { title: t('genesis.orderColUnitPrice'), dataIndex: 'unitPriceUsdt', width: 110, render: (v: string) => <span style={{ color: '#f5a623' }}>{v} USDT</span> },
    { title: t('genesis.orderColTotal'), dataIndex: 'totalAmountUsdt', width: 120, render: (v: string) => <span style={{ color: '#f5a623' }}>{v} USDT</span> },
    { title: t('genesis.orderColPeakAirdrop'), dataIndex: 'peakAirdropTotal', width: 120, render: (v: string) => <span style={{ color: '#52c41a' }}>+{v} PEAK</span> },
    { title: t('genesis.orderColStatus'), dataIndex: 'status', width: 100, render: (v: string) => statusLabelMap[v] || v },
    { title: t('genesis.orderColTime'), dataIndex: 'createdAt', width: 170, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ]

  const emptyText = (
    <div className="table-empty">
      <InboxOutlined className="table-empty-icon" />
      <span className="table-empty-text">{t('common.noData')}</span>
    </div>
  )

  return (
    <div className="genesis-page">
      <div className="genesis-hero">
        <div className="genesis-hero-bg" />
        <div className="genesis-inner">
          <h1 className="page-title">{t('genesis.title')}</h1>

          <Spin spinning={loading}>
            <div className="genesis-sale-card">
              <div className="genesis-sale-header">
                <div className="genesis-sale-left">
                  <div className="genesis-sale-icon">G</div>
                  <div className="genesis-sale-title-group">
                    <span className="genesis-sale-title">{t('genesis.saleTitle')}</span>
                    <span className="genesis-sale-subtitle">{t('genesis.saleSubtitle')}</span>
                  </div>
                </div>
                <Button className="genesis-purchase-btn" onClick={() => setPurchaseOpen(true)}>
                  {t('genesis.purchase')}
                </Button>
              </div>

              <div className="genesis-stats">
                <div className="genesis-stat">
                  <span className="genesis-stat-label">{t('genesis.price')}</span>
                  <span className="genesis-stat-value orange">{NODE_PRICE} USDT</span>
                </div>
                <div className="genesis-stat">
                  <span className="genesis-stat-label">{t('genesis.totalSupply')}</span>
                  <span className="genesis-stat-value">{MAX_SUPPLY.toLocaleString()}</span>
                </div>
                <div className="genesis-stat">
                  <span className="genesis-stat-label">{t('genesis.sold')}</span>
                  <span className="genesis-stat-value orange">{soldTotal.toLocaleString()}</span>
                </div>
                <div className="genesis-stat">
                  <span className="genesis-stat-label">{t('genesis.remaining')}</span>
                  <span className="genesis-stat-value">{remaining.toLocaleString()}</span>
                </div>
              </div>

              <div className="genesis-progress-wrapper">
                <div className="genesis-progress-bar">
                  <div className="genesis-progress-fill" style={{ width: `${Math.max(progress, 2)}%` }}>
                    <span className="genesis-progress-text">{soldTotal}</span>
                  </div>
                </div>
                <span className="genesis-progress-total">/{MAX_SUPPLY.toLocaleString()}</span>
              </div>
            </div>
          </Spin>
        </div>
      </div>

      <div className="genesis-inner">
        {/* Rights */}
        <div className="genesis-rights">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.rightsTitle')}
          </h2>
          <div className="genesis-rights-grid">
            <div className="genesis-right-card">
              <div className="genesis-right-icon nft">&#x2726;</div>
              <div className="genesis-right-title">{t('genesis.rightNftTitle')}</div>
              <div className="genesis-right-desc">{t('genesis.rightNftDesc')}</div>
              <span className="genesis-right-badge active">{t('genesis.badgeActive')}</span>
            </div>
            <div className="genesis-right-card">
              <div className="genesis-right-icon airdrop">&#x2728;</div>
              <div className="genesis-right-title">{t('genesis.rightAirdropTitle')}</div>
              <div className="genesis-right-desc">{t('genesis.rightAirdropDesc')}</div>
              <span className="genesis-right-badge coming">{t('genesis.badgeComing')}</span>
            </div>
          </div>
        </div>

        {/* Fund Usage */}
        <div className="genesis-distribution">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.distributionTitle')}
          </h2>
          <div className="genesis-dist-card">
            <div className="genesis-fund-usage">
              <span className="genesis-fund-usage-icon">ⓘ</span>
              <span className="genesis-fund-usage-text">{t('genesis.fundUsageDesc')}</span>
            </div>
          </div>
        </div>

        {/* VIP Level */}
        <div className="genesis-vip-section">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.vipTitle')}
          </h2>
          <div className="genesis-vip-card">
            <div className="genesis-vip-badge-wrap">
              <div className={`genesis-vip-badge level-${vipLevel}`}>
                <span className="genesis-vip-badge-text">{vipLabel}</span>
              </div>
            </div>
            <div className="genesis-vip-info">
              <div className="genesis-vip-desc">{t('genesis.vipDesc')}</div>
            </div>
            <div className="genesis-vip-tiers">
              {[
                { label: 'T0', lvl: 0 },
                { label: 'T1', lvl: 1 },
                { label: 'T2', lvl: 2 },
                { label: 'T3', lvl: 3 },
                { label: 'T4', lvl: 4 },
                { label: 'T5', lvl: 5 },
                { label: 'T6', lvl: 6 },
                { label: 'T7', lvl: 7 },
              ].map((tier) => {
                const chip = (
                  <span
                    key={tier.lvl}
                    className={`genesis-vip-tier ${vipLevel >= tier.lvl ? 'reached' : ''} ${vipLevel === tier.lvl ? 'current' : ''}`}
                    onMouseEnter={vipLevel === tier.lvl ? loadTeamDetail : undefined}
                  >
                    {tier.label}
                  </span>
                )
                if (vipLevel !== tier.lvl) return chip
                return (
                  <Tooltip
                    key={tier.lvl}
                    overlayClassName="genesis-vip-tooltip"
                    title={
                      teamDetailLoading || !teamDetail ? (
                        <div className="vip-tooltip-loading"><Spin size="small" /></div>
                      ) : (
                        <div className="vip-tooltip-body">
                          <div className="vip-tooltip-title">{t('genesis.vipTooltipDirects')}</div>
                          {teamDetail.directs.length === 0 ? (
                            <div className="vip-tooltip-empty">{t('genesis.vipTooltipEmpty')}</div>
                          ) : (
                            teamDetail.directs.map((d, i) => (
                              <div className="vip-tooltip-row" key={d.address || i}>
                                <span className="vip-tooltip-addr">
                                  {d.address ? `${d.address.slice(0, 6)}...${d.address.slice(-6)}` : '--'}
                                </span>
                                <span className="vip-tooltip-amount">{d.totalAmountUsdt} USDT</span>
                              </div>
                            ))
                          )}
                          <div className="vip-tooltip-total">
                            <span>{t('genesis.vipTooltipIncome')}</span>
                            <span className="vip-tooltip-amount">
                              {teamDetail.directReferralIncomeUsdt != null
                                ? `${teamDetail.directReferralIncomeUsdt} USDT`
                                : '--'}
                            </span>
                          </div>
                        </div>
                      )
                    }
                  >
                    {chip}
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </div>

        {/* Purchase Records */}
        <div className="genesis-records-section">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.orderRecordTitle')}
          </h2>
          <Table
            columns={orderColumns}
            dataSource={orderData?.list ?? []}
            rowKey="id"
            pagination={false}
            size="small"
            loading={orderLoading}
            locale={{ emptyText }}
          />
          {(orderData?.total ?? 0) > 0 && (
            <div className="genesis-records-pagination">
              <Pagination
                current={orderPage}
                total={orderData?.total ?? 0}
                pageSize={orderPageSize}
                onChange={setOrderPage}
                showSizeChanger={false}
                showQuickJumper
                size="small"
              />
            </div>
          )}
        </div>
      </div>

      {/* Purchase Modal */}
      <Modal
        open={purchaseOpen}
        onCancel={() => {
          setPurchaseOpen(false)
          setQuantity(1)
        }}
        footer={null}
        centered
        className="genesis-modal"
        width={680}
      >
        <h2 className="genesis-modal-title">{t('genesis.purchaseTitle')}</h2>
        <div className="genesis-modal-content">
          <div className="genesis-nft-preview">
            <div className="genesis-nft-card">
              <img src="https://gateway.irys.xyz/MLn_mnm3dZc56zIEMd296vzh16UoJacvBCy5xsKZbyg" alt="GenesisNodes NFT" className="genesis-nft-card-img" />
              <div className="genesis-nft-card-label">{t('genesis.saleTitle')}</div>
            </div>
            <span className="genesis-nft-qty">x{quantity}</span>
          </div>
          <div className="genesis-modal-body">
            <div className="genesis-qty-row">
              <span className="genesis-modal-label">{t('genesis.qty')}</span>
              <div className="genesis-qty-controls">
                <button
                  className="genesis-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <span className="genesis-qty-display">{quantity}</span>
                <button
                  className="genesis-qty-btn"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  disabled={quantity >= 10}
                >
                  +
                </button>
              </div>
            </div>

            <div className="genesis-modal-row">
              <span className="genesis-modal-label">{t('genesis.unitPrice')}</span>
              <span className="genesis-modal-value orange">{NODE_PRICE} USDT</span>
            </div>

            <div className="genesis-modal-row">
              <span className="genesis-modal-label">{t('genesis.airdropPeak')}</span>
              <span className="genesis-modal-value" style={{ color: 'var(--accent-green)' }}>
                +{(saleData?.peakAirdropAmount ?? 0) * quantity} PEAK
              </span>
            </div>

            <div className="genesis-modal-highlight">
              <span className="genesis-modal-highlight-label">{t('genesis.totalCost')}</span>
              <span className="genesis-modal-highlight-value">{totalCost.toLocaleString()} USDT</span>
            </div>

            <Button
              className="genesis-confirm-btn"
              block
              onClick={handlePurchase}
              loading={purchasing}
            >
              {t('genesis.confirmPurchase')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Info Modal */}
      <Modal
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        footer={null}
        centered
        className="dark-modal"
        width={560}
      >
        <div className="info-modal">
          <h2>{t('genesis.infoTitle')}</h2>
          <p>{t('genesis.infoDesc1')}</p>
          <p>{t('genesis.infoDesc2')}</p>
          <h3>{t('genesis.infoBenefitTitle')}</h3>
          <p>{t('genesis.infoBenefitDesc')}</p>
        </div>
      </Modal>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, message, Spin } from 'antd'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, TransactionInstruction, Transaction } from '@solana/web3.js'
import {
  getGenesisSaleInfo,
  getGenesisBuyParams,
  cancelGenesisBuyIntent,
  confirmGenesisBuy,
  getGenesisVipLevel,
} from '@/api'
import './index.css'

const GENESIS_PROGRAM_ID = new PublicKey('Fm8qxJKKZPGQyMezF7NkAQT5wHkDyDTp1KVDeRDKmzVg')
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

const BUY_GENESIS_DISCRIMINATOR = Buffer.from([
  0x59, 0xb4, 0x33, 0x97, 0x8d, 0x10, 0xd4, 0xb8,
])

const SALE_PDA = new PublicKey('Ahj2bbRwTMnKyyk3pNgpAe1WgvT3BUesYJTDdnJCu5mn')

const NODE_PRICE = 500
const MAX_SUPPLY = 3000
const PEAK_AIRDROP = 200
const MAX_TX_SEND_ATTEMPTS = 2

function isBlockhashExpiredError(message: string): boolean {
  const msg = message.toLowerCase()
  return msg.includes('block height exceeded')
    || msg.includes('transactionexpiredblockheightexceedederror')
    || msg.includes('blockhash not found')
}

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
}

function parseGenesisSaleState(data: Buffer): GenesisSaleData | null {
  if (data.length < 17) return null
  return {
    premintedTotal: data.readUInt32LE(8),
    soldTotal: data.readUInt32LE(12),
  }
}

export default function GenesisNodes() {
  const { t } = useTranslation()
  const { connection } = useConnection()
  const { publicKey, signTransaction, connected } = useWallet()

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const purchasingLock = useRef(false)
  const [cooldownSec, setCooldownSec] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [saleData, setSaleData] = useState<GenesisSaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [vipLevel, setVipLevel] = useState(0)
  const [vipLabel, setVipLabel] = useState('V0')

  const readChainSaleState = useCallback(async () => {
    try {
      const accountInfo = await connection.getAccountInfo(SALE_PDA)
      if (accountInfo?.data) {
        const parsed = parseGenesisSaleState(accountInfo.data as Buffer)
        if (parsed) setSaleData(parsed)
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
            setVipLabel(vipRes.data.vipLabel)
          }
        } catch {
          /* VIP not available yet */
        }
      }
    } finally {
      setLoading(false)
    }
  }, [readChainSaleState])

  useEffect(() => {
    refreshData()
  }, [refreshData, connected])

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
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  const handlePurchase = async () => {
    if (purchasingLock.current) return
    if (!publicKey || !signTransaction || !connected) {
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

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(p.configPda), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(p.salePda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.collection), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.inventoryPda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.buyerUsdtAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.mixerUsdtAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.multisigUsdtAta), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(p.buyerPeakAta), isSigner: false, isWritable: true },
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

      const dataBuffer = Buffer.alloc(10)
      BUY_GENESIS_DISCRIMINATOR.copy(dataBuffer, 0)
      dataBuffer.writeUInt8(quantity, 8)
      dataBuffer.writeUInt8(p.referrerUsdtAta ? 1 : 0, 9)

      const ix = new TransactionInstruction({
        programId: GENESIS_PROGRAM_ID,
        keys,
        data: dataBuffer,
      })

      const memoIx = new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(`PEAK Genesis NFT x${quantity}`, 'utf-8'),
      })

      let confirmedSig: string | null = null
      for (let attempt = 1; attempt <= MAX_TX_SEND_ATTEMPTS; attempt += 1) {
        let currentSig: string | null = null
        try {
          const tx = new Transaction().add(memoIx, ix)
          tx.feePayer = publicKey
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed')
          tx.recentBlockhash = blockhash

          const signed = await signTransaction(tx)
          const rawTx = signed.serialize()
          const sig = await connection.sendRawTransaction(rawTx, {
            skipPreflight: false,
            preflightCommitment: 'processed',
            maxRetries: 5,
          })
          currentSig = sig
          txSig = sig

          await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            'confirmed',
          )
          confirmedSig = sig
          break
        } catch (sendErr: unknown) {
          const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr)

          // confirmTransaction may throw expiry even when tx actually lands later.
          if (currentSig) {
            try {
              const landed = await hasTransactionLanded(currentSig, connection)
              if (landed) {
                txSig = currentSig
                confirmedSig = currentSig
                break
              }
            } catch {
              // Keep original error path below.
            }
          }

          const retryable = isBlockhashExpiredError(sendMsg)
          if (retryable && attempt < MAX_TX_SEND_ATTEMPTS) {
            txSig = null
            message.warning(t('genesis.txRetrying'))
            continue
          }
          throw sendErr
        }
      }

      if (!confirmedSig) {
        throw new Error('Transaction was not confirmed')
      }

      try {
        await confirmGenesisBuy(confirmedSig, p.intentId)
      } catch { /* backend confirm optional */ }

      message.success(t('genesis.purchaseSuccess'))
      setPurchaseOpen(false)
      setQuantity(1)
      startCooldown(10)
      refreshData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // If signature already exists but local confirmation timed out, try backend reconciliation first.
      if (intentId && txSig && isBlockhashExpiredError(errMsg)) {
        try {
          await confirmGenesisBuy(txSig, intentId)
          message.success(t('genesis.purchaseSuccess'))
          setPurchaseOpen(false)
          setQuantity(1)
          startCooldown(10)
          refreshData()
          return
        } catch {
          // fallback to regular error path below
        }
      }

      if (intentId && !txSig) {
        try {
          await cancelGenesisBuyIntent(intentId)
        } catch {
          // best-effort rollback for local intent lock only
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

  const soldTotal = saleData?.soldTotal ?? 0
  const remaining = MAX_SUPPLY - soldTotal
  const progress = MAX_SUPPLY > 0 ? (soldTotal / MAX_SUPPLY) * 100 : 0
  const totalCost = NODE_PRICE * quantity

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
              <div className="genesis-right-icon peak">P</div>
              <div className="genesis-right-title">{t('genesis.rightPeakTitle')}</div>
              <div className="genesis-right-desc">{t('genesis.rightPeakDesc')}</div>
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

        {/* Fund Distribution */}
        <div className="genesis-distribution">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.distributionTitle')}
          </h2>
          <div className="genesis-dist-card">
            <div className="genesis-dist-items">
              <div className="genesis-dist-item">
                <span className="genesis-dist-pct">5%</span>
                <div className="genesis-dist-info">
                  <span className="genesis-dist-name">{t('genesis.distReferrer')}</span>
                  <span className="genesis-dist-detail">{t('genesis.distReferrerDesc')}</span>
                </div>
              </div>
              <div className="genesis-dist-item">
                <span className="genesis-dist-pct">25%</span>
                <div className="genesis-dist-info">
                  <span className="genesis-dist-name">{t('genesis.distMixer')}</span>
                  <span className="genesis-dist-detail">{t('genesis.distMixerDesc')}</span>
                </div>
              </div>
              <div className="genesis-dist-item">
                <span className="genesis-dist-pct">70%</span>
                <div className="genesis-dist-info">
                  <span className="genesis-dist-name">{t('genesis.distMultisig')}</span>
                  <span className="genesis-dist-detail">{t('genesis.distMultisigDesc')}</span>
                </div>
              </div>
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
              <div className="genesis-vip-level-name">{vipLabel}</div>
              <div className="genesis-vip-desc">{t('genesis.vipDesc')}</div>
            </div>
            <div className="genesis-vip-tiers">
              {[
                { label: 'V0', lvl: 0 },
                { label: 'V1', lvl: 1 },
                { label: 'V2', lvl: 2 },
                { label: 'V3', lvl: 3 },
                { label: 'V4', lvl: 4 },
                { label: 'V5', lvl: 5 },
                { label: 'V6', lvl: 6 },
                { label: t('genesis.vipShareholder'), lvl: 7 },
              ].map((tier) => (
                <span
                  key={tier.lvl}
                  className={`genesis-vip-tier ${vipLevel >= tier.lvl ? 'reached' : ''} ${vipLevel === tier.lvl ? 'current' : ''}`}
                >
                  {tier.label}
                </span>
              ))}
            </div>
          </div>
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
        width={520}
      >
        <h2 className="genesis-modal-title">{t('genesis.purchaseTitle')}</h2>
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
              +{PEAK_AIRDROP * quantity} PEAK
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
            disabled={cooldownSec > 0}
          >
            {cooldownSec > 0
              ? `${t('genesis.confirmPurchase')} (${cooldownSec}s)`
              : t('genesis.confirmPurchase')}
          </Button>
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

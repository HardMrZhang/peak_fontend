import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Button, message, Spin, Modal, Input } from 'antd'
import { SwapOutlined, InboxOutlined, MailOutlined } from '@ant-design/icons'
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  getPointsExchangeHistory,
  submitPointsExchange,
  getPointsOverview,
  bindPointsEmail,
  getZeroCardInfo,
  getZeroCardParams,
  confirmZeroCard,
  getZeroCardRecords,
  getPeakPrice,
} from '@/api'
import type {
  PointsExchangeRecord,
  PointsOverview,
  DappIxParams,
  DappZeroCardInfo,
  DappZeroCardRecord,
} from '@/types'
import { PEAK_MINT_ADDRESS } from '@/constants'
import logoImg from '@/assets/logo.png'
import './index.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* exchange floor: 10000 points => 价值 1U 的 PEAK（按实时价格折算，取整）；40 为价格未加载时的兜底值 */
const RATE_POINTS = 10000
const RATE_PEAK_FALLBACK = 40
const RATE_USDT = 1

const DASH = '-'

/* profile is injected by the app via URL query, e.g.
   /points?username=Tom&avatar=https%3A%2F%2Fcdn.x.com%2Fa.jpg&is_vip=1&score=120&nft=3
   We cache it in localStorage so navigating away and back (which drops the
   query string) keeps the data, and it persists across tab/browser restarts. */
const STORAGE_KEY = 'peak_points_profile'

interface PointsProfile {
  username: string | null
  avatar: string | null
  isVip: string | null
  score: string | null
  nft: string | null
}

function extractFromUrl(params: URLSearchParams): PointsProfile | null {
  const username = params.get('username')
  const score = params.get('score')
  const nft = params.get('nft')
  if (!username && score == null && nft == null) return null
  return {
    username,
    avatar: params.get('avatar'),
    isVip: params.get('is_vip'),
    score,
    nft,
  }
}

function loadCachedProfile(): PointsProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PointsProfile) : null
  } catch {
    return null
  }
}

// 积分页面以「邮箱」作为身份，绑定后把邮箱持久化，刷新/重进仍可按邮箱拉取数据
const EMAIL_STORAGE_KEY = 'peak_points_email'

function loadBoundEmail(): string {
  try {
    return localStorage.getItem(EMAIL_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function hasToken(): boolean {
  return !!localStorage.getItem('peak_token')
}

export default function Points() {
  const { t } = useTranslation()
  const [params] = useSearchParams()

  // first paint: prefer fresh URL data, fall back to the cached session profile
  const [profile, setProfile] = useState<PointsProfile | null>(
    () => extractFromUrl(params) ?? loadCachedProfile(),
  )

  // when the app opens the page with query params, persist & refresh them
  useEffect(() => {
    const fromUrl = extractFromUrl(params)
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl))
      setProfile(fromUrl)
    }
  }, [params])

  const isGuest = !profile
  const isVip = profile?.isVip === '1'
  const urlScore = profile?.score != null ? Number(profile.score) || 0 : 0
  const urlNft = profile?.nft != null ? Number(profile.nft) || 0 : 0

  const [exchanging, setExchanging] = useState(false)
  const [records, setRecords] = useState<PointsExchangeRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  // authoritative data from backend (points + email-bound status), keyed by email
  const [overview, setOverview] = useState<PointsOverview | null>(null)
  const [boundEmail, setBoundEmail] = useState<string>(() => loadBoundEmail())
  const [bindOpen, setBindOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [binding, setBinding] = useState(false)

  // 钱包：兑换得到的 PEAK 会发到该钱包账户的平台托管余额
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const { setVisible: setWalletModalVisible } = useWalletModal()
  const walletAddress = publicKey ? publicKey.toBase58() : null

  const emailBound = Boolean(boundEmail)
  // prefer backend data (by email) when available, fall back to URL-injected profile
  const score = overview ? overview.score : urlScore
  const nftCount = overview ? overview.nftCount : urlNft
  // 权益层级：未持有 NFT 为 1 层，持有 NFT 为 10 层
  const tierLevels = nftCount > 0 ? 10 : 1
  const available = score
  // 头像/昵称：优先后端按邮箱取到的 ling 资料，回退到 APP 注入的 profile
  const username = overview?.username || profile?.username || null
  const avatarUrl = overview?.avatar || profile?.avatar || null

  // show real values when backend overview loaded or when URL profile exists
  const displayReady = Boolean(overview) || !isGuest
  const num = (v: number) => (displayReady ? v.toLocaleString() : DASH)

  const fetchOverview = useCallback(async (email: string, wallet: string | null) => {
    if (!email) {
      setOverview(null)
      return
    }
    try {
      const res = await getPointsOverview(email, wallet)
      setOverview(res.data ?? null)
    } catch {
      setOverview(null)
    }
  }, [])

  const fetchRecords = useCallback(async (email: string, wallet: string | null) => {
    if (!email) {
      setRecords([])
      return
    }
    setRecordsLoading(true)
    try {
      const res = await getPointsExchangeHistory({ page: 1, pageSize: 50, email, walletAddress: wallet })
      setRecords(res.data?.list ?? [])
    } catch {
      setRecords([])
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview(boundEmail, walletAddress)
    fetchRecords(boundEmail, walletAddress)
  }, [boundEmail, walletAddress, fetchOverview, fetchRecords])

  const openBind = () => {
    setEmailInput(boundEmail)
    setBindOpen(true)
  }

  const handleBindEmail = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      message.error(t('points.emailInvalid'))
      return
    }
    setBinding(true)
    try {
      const res = await bindPointsEmail(email)
      message.success(res.data?.rebound ? t('points.rebindSuccess') : t('points.bindSuccess'))
      try {
        localStorage.setItem(EMAIL_STORAGE_KEY, email)
      } catch {
        // ignore storage errors (private mode etc.)
      }
      setBindOpen(false)
      // updating boundEmail triggers overview + records refresh via effect
      setBoundEmail(email)
    } catch {
      // request util already surfaces the server error message
    } finally {
      setBinding(false)
    }
  }

  const handleExchange = async () => {
    if (exchanging) return
    if (available <= 0) {
      message.info(t('points.noPoints'))
      return
    }
    // gate 1: must bind email before exchanging
    if (!emailBound) {
      message.warning(t('points.emailRequired'))
      openBind()
      return
    }
    // gate 2: must connect wallet (PEAK is credited to the wallet account)
    if (!walletAddress) {
      message.warning(t('points.walletRequired'))
      setWalletModalVisible(true)
      return
    }
    setExchanging(true)
    try {
      await submitPointsExchange(available, boundEmail, walletAddress)
      message.success(t('points.exchangeSuccess'))
      await Promise.all([fetchOverview(boundEmail, walletAddress), fetchRecords(boundEmail, walletAddress)])
    } catch {
      // request util already surfaces the server error message
    } finally {
      setExchanging(false)
    }
  }

  /* ── 积分卡牌（100U 零撸投资包：PEAK 100% 销毁，获得 10 层积分零撸权益） ── */
  const [cardInfo, setCardInfo] = useState<DappZeroCardInfo | null>(null)
  const [cardRecords, setCardRecords] = useState<DappZeroCardRecord[]>([])
  const [peakBalance, setPeakBalance] = useState<number | null>(null)
  const [buyingCard, setBuyingCard] = useState(false)

  // 发送后端构造好的链上指令 / 部分签名交易（用户钱包签名并付 GAS）
  const sendDappIx = useCallback(
    async (p: DappIxParams): Promise<string> => {
      if (!publicKey || !sendTransaction || !connected) {
        throw new Error(t('points.walletRequired'))
      }
      let tx: Transaction
      if (p.transactionBase64) {
        tx = Transaction.from(Buffer.from(p.transactionBase64, 'base64'))
      } else {
        const ix = new TransactionInstruction({
          programId: new PublicKey(p.programId!),
          keys: (p.keys || []).map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(p.data!, 'base64'),
        })
        tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ix,
        )
      }
      const sig = await sendTransaction(tx, connection, { skipPreflight: true })
      const startMs = Date.now()
      const TIMEOUT_MS = 60_000
      while (Date.now() - startMs < TIMEOUT_MS) {
        const resp = await connection.getSignatureStatuses([sig])
        const status = resp?.value?.[0]
        if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          return sig
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      throw new Error('Transaction confirmation timeout')
    },
    [publicKey, sendTransaction, connected, connection, t],
  )

  // 钱包 PEAK 余额（链上实时读取）
  const fetchPeakBalance = useCallback(async () => {
    if (!publicKey) {
      setPeakBalance(null)
      return
    }
    try {
      const resp = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: new PublicKey(PEAK_MINT_ADDRESS),
      })
      const total = resp.value.reduce(
        (acc, acct) => acc + (acct.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
        0,
      )
      setPeakBalance(total)
    } catch {
      setPeakBalance(null)
    }
  }, [connection, publicKey])

  const refreshCard = useCallback(async () => {
    if (!hasToken()) return
    try {
      const res = await getZeroCardInfo()
      setCardInfo(res.data)
    } catch { /* ignore */ }
    try {
      const rec = await getZeroCardRecords({ page: 1, pageSize: 50 })
      setCardRecords(rec.data?.list ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refreshCard()
  }, [refreshCard, connected])

  /* ---------------- 实时价格轮询（公开接口，无需登录） ---------------- */
  const [livePrice, setLivePrice] = useState<number | null>(null)

  useEffect(() => {
    let stopped = false
    const fetchPrice = async () => {
      try {
        const res = await getPeakPrice()
        const p = res.data?.priceUsdt ? parseFloat(res.data.priceUsdt) : 0
        if (!stopped && p > 0) setLivePrice(p)
      } catch { /* ignore */ }
    }
    fetchPrice()
    const timer = setInterval(fetchPrice, 5000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])

  const cardPrice = livePrice ?? (cardInfo?.priceUsdt ? parseFloat(cardInfo.priceUsdt) : null)
  // 兑换价底：价值 1U 的 PEAK 数量（按实时价格折算，取整数）
  const ratePeak = cardPrice && cardPrice > 0
    ? Math.max(1, Math.round(RATE_USDT / cardPrice))
    : RATE_PEAK_FALLBACK
  const cardUsdtFixed = cardInfo?.priceUsdtFixed ?? 100
  // 价值 100U 的 PEAK 数量（按实时价格折算）
  const cardPeakAmountNum = cardPrice && cardPrice > 0 ? cardUsdtFixed / cardPrice : null
  const cardPeakAmount = cardPeakAmountNum !== null
    ? cardPeakAmountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : cardInfo?.peakAmount ?? null
  // 钱包余额不足时，距离 100U 还差多少 PEAK
  const peakShortfall = peakBalance !== null && cardPeakAmountNum !== null && peakBalance < cardPeakAmountNum
    ? cardPeakAmountNum - peakBalance
    : null

  // 钱包 PEAK 余额：连接后立即读取，并每 10 秒刷新一次
  useEffect(() => {
    fetchPeakBalance()
    const timer = setInterval(fetchPeakBalance, 10000)
    return () => clearInterval(timer)
  }, [fetchPeakBalance, connected])

  const handleBuyCard = async () => {
    if (buyingCard) return
    if (!hasToken() || !connected) {
      message.warning(t('points.walletRequired'))
      setWalletModalVisible(true)
      return
    }
    if (peakShortfall !== null) {
      message.warning(t('points.cardShortfall', {
        amount: peakShortfall.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      }))
      return
    }
    setBuyingCard(true)
    try {
      const paramsRes = await getZeroCardParams()
      const sig = await sendDappIx(paramsRes.data)
      await confirmZeroCard({ txHash: sig, intentId: paramsRes.data.intentId })
      message.success(t('points.cardBuySuccess'))
      refreshCard()
      fetchPeakBalance()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        message.error(`${t('points.cardBuyFail')}: ${msg.slice(0, 80)}`)
      }
    } finally {
      setBuyingCard(false)
    }
  }

  return (
    <div className="pts-page">
      <div className="pts-inner">
        <div className="pts-grid">
        {/* ── Exchange card ── */}
        <div className="pts-card glow-card">
          <div className="pts-card-glow" />

          {/* header: avatar + member + username */}
          <div className="pts-head">
            <div className="pts-avatar">
              <img src={avatarUrl || logoImg} alt="avatar" />
            </div>
            <div className="pts-head-info">
              {isGuest ? (
                <div className="pts-member pts-member-guest">{DASH}</div>
              ) : isVip ? (
                <div className="pts-member">
                  <img src={logoImg} alt="" className="pts-member-logo" />
                  <span>{t('points.member')}</span>
                </div>
              ) : null}
              <div className="pts-nft-name">{username || DASH}</div>
            </div>
          </div>

          {/* nft count */}
          <div className="pts-nft-count">
            <span className="pts-label">{t('points.nftHolding')}</span>
            <span className="pts-nft-count-val">{num(nftCount)}</span>
          </div>

          {/* rights: 推广层级（按 NFT 持有量） */}
          <div className="pts-rights">
            <span className="pts-label">{t('points.rightsLabel')}</span>
            <span className="pts-nft-count-val">
              {displayReady ? t('points.tierLevels', { count: tierLevels }) : DASH}
            </span>
          </div>

          <div className="pts-divider" />

          {/* points stats */}
          <div className="pts-stat-row">
            <span className="pts-stat-label">{t('points.appPoints')}</span>
            <span className="pts-stat-val">{num(score)}</span>
          </div>

          <div className="pts-stat-row pts-available-row">
            <span className="pts-stat-label">{t('points.available')}</span>
            <span className="pts-stat-val orange big">{num(available)}</span>
          </div>

          {/* email binding */}
          <div className="pts-stat-row pts-email-row">
            <span className="pts-stat-label">
              <MailOutlined className="pts-email-icon" />
              {emailBound ? overview?.email : t('points.bindEmail')}
            </span>
            <Button
              size="small"
              className="pts-email-btn"
              onClick={openBind}
            >
              {emailBound ? t('points.rebindEmail') : t('points.bindEmail')}
            </Button>
          </div>

          <Button
            className="pts-action-btn pts-exchange-btn"
            onClick={handleExchange}
            loading={exchanging}
            disabled={!displayReady}
            block
          >
            {t('points.exchange')}
          </Button>

          {/* exchange rate */}
          <div className="pts-rate-title">{t('points.rateTitle')}</div>
          <div className="pts-rate-box">
            <div className="pts-rate-side">
              <span className="pts-rate-num">{RATE_POINTS.toLocaleString()}</span>
              <span className="pts-rate-unit">{t('points.pointsUnit')}</span>
            </div>
            <div className="pts-rate-swap">
              <SwapOutlined />
            </div>
            <div className="pts-rate-side right">
              <span className="pts-rate-num">{ratePeak.toLocaleString()}</span>
              <span className="pts-rate-unit">PEAK</span>
            </div>
          </div>
        </div>

        {/* ── Records ── */}
        <div className="pts-records glow-card">
          <div className="section-title pts-records-title">
            <span className="pts-accent-dot" />
            {t('points.recordTitle')}
          </div>

          <div className="pts-table">
            <div className="pts-thead">
              <span>{t('points.colTime')}</span>
              <span>{t('points.colPoints')}</span>
              <span>{t('points.colPeak')}</span>
            </div>
            {recordsLoading ? (
              <div className="table-empty">
                <Spin />
              </div>
            ) : records.length > 0 ? (
              records.map((row) => (
                <div className="pts-trow" key={row.id}>
                  <span className="pts-td-time">{formatTime(row.createdAt)}</span>
                  <span>{row.points.toLocaleString()}</span>
                  <span className="orange">{row.peak}</span>
                </div>
              ))
            ) : (
              <div className="table-empty">
                <InboxOutlined className="table-empty-icon" />
                <span className="table-empty-text">{t('common.noData')}</span>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* ── 积分卡牌（100U 零撸投资包） ── */}
        <div className="pts-section-divider" />

        <div className="section-title pts-records-title">
          <span className="pts-accent-dot" />
          {t('points.cardTitle')}
        </div>

        <div className="pts-card-grid">
          {/* 卡牌购买 */}
          <div className="pts-card glow-card">
            <div className="pts-card-glow" />

            <div className="pts-buycard-visual">
              <img src={logoImg} alt="PEAK" className="pts-buycard-logo" />
              <span className="pts-buycard-value">100USDT</span>
            </div>

            <h3 className="pts-buycard-name">{t('points.cardName')}</h3>
            <p className="pts-buycard-desc">{t('points.cardDesc')}</p>

            <div className="pts-divider" />

            <div className="pts-stat-row">
              <span className="pts-stat-label">{t('points.cardBalance')}</span>
              <span className="pts-stat-val">
                {peakBalance !== null
                  ? `${peakBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PEAK`
                  : `${DASH} PEAK`}
              </span>
            </div>
            <div className="pts-stat-row">
              <span className="pts-stat-label">{t('points.cardPrice')}</span>
              <span className="pts-stat-val">
                {cardPrice && cardPrice > 0 ? `${cardPrice.toFixed(4)} USDT` : DASH}
              </span>
            </div>
            <div className="pts-stat-row">
              <span className="pts-stat-label">{t('points.cardPeakAmount')}</span>
              <span className="pts-stat-val orange">{cardPeakAmount ?? DASH} PEAK</span>
            </div>

            {peakShortfall !== null && (
              <div className="pts-shortfall-tip">
                {t('points.cardShortfall', {
                  amount: peakShortfall.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                })}
              </div>
            )}

            <Button
              className="pts-action-btn pts-exchange-btn"
              onClick={handleBuyCard}
              loading={buyingCard}
              disabled={peakShortfall !== null}
              block
            >
              {t('points.cardBuy')}
            </Button>
          </div>

          {/* 购买记录 */}
          <div className="pts-records glow-card">
            <div className="section-title pts-records-title">
              <span className="pts-accent-dot" />
              {t('points.cardRecordTitle')}
            </div>

            <div className="pts-table">
              <div className="pts-thead">
                <span>{t('points.cardColTime')}</span>
                <span>{t('points.cardColPeak')}</span>
                <span>{t('points.cardColValue')}</span>
              </div>
              {cardRecords.length > 0 ? (
                cardRecords.map((row) => (
                  <div className="pts-trow" key={row.id}>
                    <span className="pts-td-time">{formatTime(row.createdAt)}</span>
                    <span className="orange">{row.peakAmount}</span>
                    <span>{row.usdValue}</span>
                  </div>
                ))
              ) : (
                <div className="table-empty">
                  <InboxOutlined className="table-empty-icon" />
                  <span className="table-empty-text">{t('common.noData')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        title={emailBound ? t('points.rebindEmailTitle') : t('points.bindEmailTitle')}
        open={bindOpen}
        onOk={handleBindEmail}
        onCancel={() => setBindOpen(false)}
        confirmLoading={binding}
        okText={t('points.confirm')}
        cancelText={t('points.cancel')}
        destroyOnClose
      >
        <Input
          type="email"
          size="large"
          prefix={<MailOutlined />}
          placeholder={t('points.emailPlaceholder')}
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          onPressEnter={handleBindEmail}
          maxLength={100}
          allowClear
        />
      </Modal>
    </div>
  )
}

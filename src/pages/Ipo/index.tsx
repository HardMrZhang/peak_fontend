import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import logoImg from '@/assets/logo.png'
import {
  getStakeOverview,
  getStakeParams,
  confirmStake,
  getUnstakeParams,
  confirmUnstake,
  getStakeRecords,
  getAirdropConfig,
  getAirdropParams,
  confirmAirdrop,
  getAirdropRecords,
  getPeakPrice,
} from '@/api'
import type {
  DappIxParams,
  DappStakePool,
  DappStakeRecord,
  DappAirdropConfig,
  DappAirdropRecord,
} from '@/types'
import './index.css'

const BLOCK_EXPLORER_URL = 'https://solscan.io/tx/'
const DURATIONS = [15, 30, 90, 150] as const
type Duration = (typeof DURATIONS)[number]
const AIRDROP_MULTIPLE = 3

function shortenHash(hash: string | null): string {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

function hasToken(): boolean {
  return !!localStorage.getItem('peak_token')
}

export default function Ipo() {
  const { t } = useTranslation()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()

  /* ---------------- 链上交易：发送后端构造好的指令 / 部分签名交易 ---------------- */
  const sendDappIx = useCallback(
    async (p: DappIxParams): Promise<string> => {
      if (!publicKey || !sendTransaction || !connected) {
        throw new Error(t('account.walletRequired'))
      }
      let tx: Transaction
      if (p.transactionBase64) {
        // operator 已部分签名的完整交易：直接反序列化补签发送，
        // 不可改动内容（含加 ComputeBudget 指令），否则 operator 签名失效
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
      let confirmed = false
      while (Date.now() - startMs < TIMEOUT_MS) {
        const resp = await connection.getSignatureStatuses([sig])
        const status = resp?.value?.[0]
        if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          confirmed = true
          break
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (!confirmed) throw new Error('Transaction confirmation timeout')
      return sig
    },
    [publicKey, sendTransaction, connected, connection, t],
  )

  /* ---------------- 质押状态 ---------------- */
  const [pools, setPools] = useState<DappStakePool[]>([])
  const [minStake, setMinStake] = useState(1000)
  const [selectedDay, setSelectedDay] = useState<Duration | null>(null)
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeTip, setStakeTip] = useState<{ text: string; type: 'success' | 'fail' | '' }>({ text: '', type: '' })
  const [staking, setStaking] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [stakeRecords, setStakeRecords] = useState<DappStakeRecord[]>([])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const stakeTotals = useMemo(() => {
    const map: Record<number, string> = { 15: '0', 30: '0', 90: '0', 150: '0' }
    pools.forEach((p) => { map[p.periodDays] = p.totalStaked })
    return map
  }, [pools])

  const refreshStake = useCallback(async () => {
    try {
      const res = await getStakeOverview()
      if (res.data) {
        setPools(res.data.pools)
        setMinStake(res.data.minStakePeak)
      }
    } catch { /* chain/overview not ready */ }
    if (hasToken()) {
      try {
        const rec = await getStakeRecords({ page: 1, pageSize: 50 })
        setStakeRecords(rec.data?.list ?? [])
      } catch { /* ignore */ }
    }
  }, [])

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return ''
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${d}${t('ipo.dayUnit')} ${h}${t('ipo.hourUnit')} ${m}${t('ipo.minUnit')}`
  }

  const handleConfirmStake = async () => {
    setStakeTip({ text: '', type: '' })
    if (staking) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    if (!selectedDay) {
      setStakeTip({ text: t('ipo.selectDurationFirst'), type: 'fail' })
      return
    }
    const amount = parseFloat(stakeAmount || '0')
    if (!amount || amount < minStake) {
      setStakeTip({ text: t('ipo.amountTooLow'), type: 'fail' })
      setStakeAmount('')
      return
    }

    setStaking(true)
    setStakeTip({ text: t('ipo.staking'), type: '' })
    try {
      const paramsRes = await getStakeParams(selectedDay, Math.floor(amount))
      const sig = await sendDappIx(paramsRes.data)
      await confirmStake({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeAmount('')
      setStakeTip({ text: t('ipo.stakeSuccess'), type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setStakeTip({ text: `${t('ipo.stakeFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setStakeTip({ text: '', type: '' })
      }
    } finally {
      setStaking(false)
    }
  }

  const handleRedeem = async (record: DappStakeRecord) => {
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    setStakeTip({ text: t('ipo.redeeming'), type: '' })
    try {
      const paramsRes = await getUnstakeParams(record.positionId, record.periodDays)
      const sig = await sendDappIx(paramsRes.data)
      await confirmUnstake({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeTip({ text: t('ipo.redeemSuccess'), type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setStakeTip({ text: `${t('ipo.redeemFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setStakeTip({ text: '', type: '' })
      }
    }
  }

  /* ---------------- 三倍空投状态 ---------------- */
  const [airdropConfig, setAirdropConfig] = useState<DappAirdropConfig | null>(null)
  const [quantity, setQuantity] = useState('1000')
  const [airdropRecords, setAirdropRecords] = useState<DappAirdropRecord[]>([])
  const [joining, setJoining] = useState(false)
  const [joinTip, setJoinTip] = useState('')
  const joinTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshAirdrop = useCallback(async () => {
    try {
      const res = await getAirdropConfig()
      setAirdropConfig(res.data)
    } catch { /* ignore */ }
    if (hasToken()) {
      try {
        const rec = await getAirdropRecords({ page: 1, pageSize: 50 })
        setAirdropRecords(rec.data?.list ?? [])
      } catch { /* ignore */ }
    }
  }, [])

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

  const price = livePrice ?? (airdropConfig?.priceUsdt ? parseFloat(airdropConfig.priceUsdt) : 0)

  const airdropCalc = useMemo(() => {
    let qty = parseFloat(quantity) || 0
    if (qty < 1) qty = 1
    const totalValue = qty * price
    const threshold = airdropConfig?.tierThresholdUsd ?? 500
    const rateLow = airdropConfig ? parseFloat(airdropConfig.dailyRateLow) : 1.4
    const rateHigh = airdropConfig ? parseFloat(airdropConfig.dailyRateHigh) : 1.5
    const dailyRatePct = totalValue < threshold ? rateLow : rateHigh
    const rateText = `${dailyRatePct}%`
    const totalAirdrop = qty * AIRDROP_MULTIPLE
    const dailyAirdrop = (qty * dailyRatePct) / 100
    const referAccel = 0
    const teamAccel = 0
    const dailyTotal = dailyAirdrop + referAccel + teamAccel
    const totalDays = dailyTotal > 0 ? Math.ceil(totalAirdrop / dailyTotal) : 0
    return { qty, totalValue, rateText, totalAirdrop, dailyAirdrop, referAccel, teamAccel, totalDays }
  }, [quantity, price, airdropConfig])

  const handleJoin = async () => {
    if (joining) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const qty = parseFloat(quantity) || 0
    if (qty < 1) {
      message.warning(t('ipo.quantityPlaceholder'))
      return
    }
    setJoining(true)
    try {
      const paramsRes = await getAirdropParams(Math.floor(qty))
      const sig = await sendDappIx(paramsRes.data)
      await confirmAirdrop({ txHash: sig, intentId: paramsRes.data.intentId })
      setJoinTip(t('ipo.joinSuccess'))
      if (joinTipTimer.current) clearTimeout(joinTipTimer.current)
      joinTipTimer.current = setTimeout(() => setJoinTip(''), 2500)
      refreshAirdrop()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        message.error(`${t('ipo.joinFail')}: ${msg.slice(0, 80)}`)
      }
    } finally {
      setJoining(false)
    }
  }

  useEffect(() => {
    refreshStake()
    refreshAirdrop()
  }, [refreshStake, refreshAirdrop, connected])

  return (
    <div className="staking-page">
      <div className="staking-header">
        <img src={logoImg} alt="Peak" className="staking-logo" />
        <h1 className="staking-title">{t('ipo.title')}</h1>
        <p className="staking-subtitle">{t('ipo.subtitle')}</p>
      </div>

      <div className="staking-grid">
        {/* ---------------- 三倍空投卡片 ---------------- */}
        <section className="sp-card">
          <h2 className="sp-card-title">{t('ipo.airdropTitle')}</h2>

          <div className="sp-field-block">
            <label className="sp-field-label">{t('ipo.quantityLabel')}</label>
            <div className="sp-input-wrap">
              <input
                type="number"
                className="sp-qty-input"
                min={1}
                value={quantity}
                placeholder={t('ipo.quantityPlaceholder')}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <span className="sp-input-unit">PEAK</span>
            </div>
          </div>

          <div className="sp-info-box">
            <div className="sp-info-line">
              <span>{t('ipo.realTimePrice')}</span>
              <span className="sp-highlight">{price > 0 ? price.toFixed(4) : '--'} USDT</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.totalValue')}</span>
              <span className="sp-highlight">{airdropCalc.totalValue.toFixed(2)} USDT</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.todayRate')}</span>
              <span className="sp-highlight">{airdropCalc.rateText}</span>
            </div>
          </div>

          <div className="sp-airdrop-tip">✅ {t('ipo.airdropTip')}</div>

          <div className="sp-earn-card">
            <h3 className="sp-earn-title">{t('ipo.estimateTitle')}</h3>
            <div className="sp-info-line">
              <span>{t('ipo.totalAirdrop')}</span>
              <span className="sp-highlight">{airdropCalc.totalAirdrop.toFixed(2)} PEAK</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.dailyAirdrop')}</span>
              <span className="sp-highlight">{airdropCalc.dailyAirdrop.toFixed(4)} PEAK</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.referAirdrop')}</span>
              <span className="sp-highlight">{airdropCalc.referAccel.toFixed(2)} PEAK</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.teamAirdrop')}</span>
              <span className="sp-highlight">{airdropCalc.teamAccel.toFixed(2)} PEAK</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.estimateDays')}</span>
              <span className="sp-highlight">
                {airdropCalc.totalDays} {t('ipo.dayUnit')}
              </span>
            </div>
          </div>

          <button type="button" className="sp-buy-btn" onClick={handleJoin} disabled={joining}>
            {t('ipo.confirmJoin')}
          </button>

          {joinTip && <div className="sp-tip success">{joinTip}</div>}

          <h3 className="sp-record-title">{t('ipo.airdropRecordTitle')}</h3>
          <div className="sp-record-list">
            {airdropRecords.length === 0 ? (
              <div className="sp-record-empty">{t('ipo.noAirdropRecord')}</div>
            ) : (
              airdropRecords.map((item) => (
                <div key={item.id} className="sp-record-card">
                  <div className="sp-record-header">
                    <span className="sp-record-id">
                      {t('ipo.airdropRecordId')}: {item.grantId}
                    </span>
                    <span className="sp-record-time">{item.createdAt.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                  <div className="sp-record-grid">
                    <div className="sp-record-item">
                      {t('ipo.airdropQuantity')}: {item.principal} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropTriple')}: {item.totalCap} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRateField')}: {item.dailyRate}%
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRemainDays')}: {item.remainDays} {t('ipo.dayUnit')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ---------------- 质押卡片 ---------------- */}
        <section className="sp-card">
          <h2 className="sp-card-title">{t('ipo.stakeTitle')}</h2>

          <div className="sp-rule">
            <p className="sp-rule-head">{t('ipo.ruleTitle')}</p>
            <p>1. {t('ipo.rule1')}</p>
            <p>2. {t('ipo.rule2')}</p>
            <p>3. {t('ipo.rule3')}</p>
          </div>

          <div className="sp-duration-grid">
            {DURATIONS.map((day) => (
              <button
                key={day}
                type="button"
                className={`sp-duration-btn day-${day} ${selectedDay === day ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDay(day)
                  setStakeTip({ text: '', type: '' })
                }}
              >
                <span className="sp-duration-day">
                  {day}
                  {t('ipo.dayUnit')}
                </span>
                <span className="sp-duration-total">
                  <span className="sp-duration-total-label">{t('ipo.stakedTotal')}</span>
                  <span className="sp-duration-total-value">{stakeTotals[day]} PEAK</span>
                </span>
              </button>
            ))}
          </div>

          <div className="sp-info-row">
            <span className="sp-info-label">{t('ipo.durationLabel')}</span>
            <span className="sp-info-value">
              {selectedDay ? `${selectedDay} ${t('ipo.dayUnit')}` : t('ipo.selectDuration')}
            </span>
          </div>

          <div className="sp-input-group">
            <input
              type="number"
              className="sp-amount-input"
              placeholder={t('ipo.amountPlaceholder')}
              min={0}
              step={1}
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
            />
            <button type="button" className="sp-confirm-btn" onClick={handleConfirmStake} disabled={staking}>
              {t('ipo.confirmStake')}
            </button>
          </div>

          {stakeTip.text && <div className={`sp-tip ${stakeTip.type}`}>{stakeTip.text}</div>}

          <h3 className="sp-record-title">{t('ipo.stakeRecordTitle')}</h3>
          <div className="sp-record-list">
            {stakeRecords.length === 0 ? (
              <div className="sp-record-empty">{t('ipo.noStakeRecord')}</div>
            ) : (
              stakeRecords.map((item) => {
                const timeLeft = item.unlockTime ? new Date(item.unlockTime).getTime() - now : 0
                const isRedeemed = item.status === 'REDEEMED'
                const txHash = isRedeemed ? item.unstakeTxHash : item.stakeTxHash
                return (
                  <div key={item.id} className={`sp-record-card ${isRedeemed ? 'redeemed' : ''}`}>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordId')}</span>
                      <span className="sp-record-value">{item.positionId}</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordAmount')}</span>
                      <span className="sp-record-value">{item.amount} PEAK</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordDuration')}</span>
                      <span className="sp-record-value">
                        {item.periodDays} {t('ipo.dayUnit')}
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordStatus')}</span>
                      <span className="sp-record-value">
                        {item.status === 'STAKING' && <span className="sp-countdown">{formatCountdown(timeLeft)}</span>}
                        {item.status === 'REDEEMABLE' && (
                          <button type="button" className="sp-redeem-btn" onClick={() => handleRedeem(item)}>
                            {t('ipo.statusRedeemable')}
                          </button>
                        )}
                        {item.status === 'REDEEMED' && <span className="sp-redeemed-text">{t('ipo.statusRedeemed')}</span>}
                      </span>
                    </div>
                    {txHash && (
                      <div className="sp-record-row">
                        <span className="sp-record-label">{t('ipo.recordTxHash')}</span>
                        <span className="sp-record-value">
                          <a
                            className="sp-tx-hash"
                            onClick={() => window.open(`${BLOCK_EXPLORER_URL}${txHash}`, '_blank')}
                          >
                            {shortenHash(txHash)}
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

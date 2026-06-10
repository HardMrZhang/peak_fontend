import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoImg from '@/assets/logo.png'
import './index.css'

const BLOCK_EXPLORER_URL = 'https://etherscan.io/tx/'
const DURATIONS = [15, 30, 90, 150] as const
type Duration = (typeof DURATIONS)[number]

const STAKE_PRICE = 0.05
const AIRDROP_MULTIPLE = 3

type StakeStatus = 'staking' | 'wait' | 'redeemed'

interface StakeRecord {
  id: string
  amount: number
  day: number
  endTime: number
  status: StakeStatus
  stakeHash: string
  redeemHash: string
}

interface AirdropRecord {
  id: string
  time: string
  quantity: number
  tripleQuantity: number
  rate: string
  remainDays: number
}

interface AccelRecord {
  id: string
  time: string
  qty: number
  price: number
}

const ACCEL_PACK = {
  boost: '+25%',
  validity: 30,
  stock: 100,
  price: 100,
}

function genHash(): string {
  const chars = '0123456789abcdef'
  let hash = ''
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * chars.length)]
  return hash
}

function shortenHash(hash: string): string {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

function genId(prefix = 'PK'): string {
  return prefix + Date.now().toString().slice(-8)
}

export default function Ipo() {
  const { t } = useTranslation()

  /* ---------------- Staking state ---------------- */
  const [stakeTotals, setStakeTotals] = useState<Record<Duration, number>>({
    15: 12800,
    30: 25600,
    90: 36900,
    150: 48200,
  })
  const [selectedDay, setSelectedDay] = useState<Duration | null>(null)
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeTip, setStakeTip] = useState<{ text: string; type: 'success' | 'fail' | '' }>({ text: '', type: '' })
  const [staking, setStaking] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [stakeRecords, setStakeRecords] = useState<StakeRecord[]>(() => {
    const base = Date.now()
    return [
      { id: 'PK001', amount: 5000, day: 15, endTime: base + 12 * 24 * 3600 * 1000, status: 'staking', stakeHash: genHash(), redeemHash: '' },
      { id: 'PK002', amount: 8000, day: 30, endTime: base + 10 * 60 * 1000, status: 'staking', stakeHash: genHash(), redeemHash: '' },
      { id: 'PK003', amount: 10000, day: 90, endTime: base - 3600 * 1000, status: 'wait', stakeHash: genHash(), redeemHash: '' },
      { id: 'PK004', amount: 6500, day: 150, endTime: base - 24 * 3600 * 1000, status: 'redeemed', stakeHash: genHash(), redeemHash: genHash() },
    ]
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
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

    if (!selectedDay) {
      setStakeTip({ text: t('ipo.selectDurationFirst'), type: 'fail' })
      return
    }
    const amount = parseFloat(stakeAmount || '0')
    if (!amount || amount < 1000) {
      setStakeTip({ text: t('ipo.amountTooLow'), type: 'fail' })
      setStakeAmount('')
      return
    }

    setStaking(true)
    setStakeTip({ text: t('ipo.staking'), type: '' })
    await new Promise((r) => setTimeout(r, 600))

    const dayNum = selectedDay
    const newItem: StakeRecord = {
      id: genId(),
      amount: Math.floor(amount),
      day: dayNum,
      endTime: Date.now() + dayNum * 24 * 3600 * 1000,
      status: 'staking',
      stakeHash: genHash(),
      redeemHash: '',
    }
    setStakeRecords((prev) => [newItem, ...prev])
    setStakeTotals((prev) => ({ ...prev, [dayNum]: prev[dayNum] + amount }))
    setStakeAmount('')
    setStakeTip({ text: t('ipo.stakeSuccess'), type: 'success' })
    setStaking(false)
  }

  const handleRedeem = async (recordId: string) => {
    setStakeTip({ text: t('ipo.redeeming'), type: '' })
    await new Promise((r) => setTimeout(r, 800))
    setStakeRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, status: 'redeemed' as StakeStatus, redeemHash: genHash() } : r)),
    )
    setStakeTip({ text: t('ipo.redeemSuccess'), type: 'success' })
  }

  /* ---------------- Airdrop state ---------------- */
  const [quantity, setQuantity] = useState('1000')
  const [airdropRecords, setAirdropRecords] = useState<AirdropRecord[]>([])
  const [joinTip, setJoinTip] = useState('')
  const joinTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ---------------- Accel pack (mock NFT) ---------------- */
  const [accelTip, setAccelTip] = useState('')
  const accelTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [accelRecords, setAccelRecords] = useState<AccelRecord[]>([])

  const handleBuyPack = () => {
    // mock: 后续对接 NFT 加速包合约 / 后台接口
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    const record: AccelRecord = { id: 'ACC' + Date.now().toString().slice(-8), time: timeStr, qty: 1, price: ACCEL_PACK.price }
    setAccelRecords((prev) => [record, ...prev])
    setAccelTip(t('ipo.accelBuySuccess'))
    if (accelTipTimer.current) clearTimeout(accelTipTimer.current)
    accelTipTimer.current = setTimeout(() => setAccelTip(''), 2500)
  }

  const airdropCalc = useMemo(() => {
    let qty = parseFloat(quantity) || 0
    if (qty < 1) qty = 1
    const totalValue = qty * STAKE_PRICE
    const dailyRate = totalValue < 500 ? 0.014 : 0.015
    const rateText = totalValue < 500 ? '1.4%' : '1.5%'
    const totalAirdrop = qty * AIRDROP_MULTIPLE
    const dailyAirdrop = qty * dailyRate
    const referAccel = 0
    const teamAccel = 0
    const dailyTotal = dailyAirdrop + referAccel + teamAccel
    const totalDays = dailyTotal > 0 ? Math.ceil(totalAirdrop / dailyTotal) : 0
    return { qty, totalValue, rateText, totalAirdrop, dailyAirdrop, referAccel, teamAccel, totalDays }
  }, [quantity])

  const handleJoin = () => {
    const c = airdropCalc
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    const record: AirdropRecord = {
      id: 'PEAK' + Date.now(),
      time: timeStr,
      quantity: c.qty,
      tripleQuantity: c.totalAirdrop,
      rate: c.rateText,
      remainDays: c.totalDays,
    }
    setAirdropRecords((prev) => [record, ...prev])
    setJoinTip(t('ipo.joinSuccess'))
    if (joinTipTimer.current) clearTimeout(joinTipTimer.current)
    joinTipTimer.current = setTimeout(() => setJoinTip(''), 2500)
  }

  return (
    <div className="staking-page">
      <div className="staking-header">
        <img src={logoImg} alt="Peak" className="staking-logo" />
        <h1 className="staking-title">{t('ipo.title')}</h1>
        <p className="staking-subtitle">{t('ipo.subtitle')}</p>
      </div>

      <div className="staking-grid">
        {/* ---------------- Staking card ---------------- */}
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
                  <span className="sp-duration-total-value">{stakeTotals[day].toLocaleString()} PEAK</span>
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
                const timeLeft = item.endTime - now
                const isRedeemed = item.status === 'redeemed'
                return (
                  <div key={item.id} className={`sp-record-card ${isRedeemed ? 'redeemed' : ''}`}>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordId')}</span>
                      <span className="sp-record-value">{item.id}</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordAmount')}</span>
                      <span className="sp-record-value">{item.amount.toLocaleString()} PEAK</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordDuration')}</span>
                      <span className="sp-record-value">
                        {item.day} {t('ipo.dayUnit')}
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordStatus')}</span>
                      <span className="sp-record-value">
                        {item.status === 'staking' && <span className="sp-countdown">{formatCountdown(timeLeft)}</span>}
                        {item.status === 'wait' && (
                          <button type="button" className="sp-redeem-btn" onClick={() => handleRedeem(item.id)}>
                            {t('ipo.statusRedeemable')}
                          </button>
                        )}
                        {item.status === 'redeemed' && <span className="sp-redeemed-text">{t('ipo.statusRedeemed')}</span>}
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordTxHash')}</span>
                      <span className="sp-record-value">
                        <a
                          className="sp-tx-hash"
                          onClick={() =>
                            window.open(`${BLOCK_EXPLORER_URL}${isRedeemed ? item.redeemHash : item.stakeHash}`, '_blank')
                          }
                        >
                          {shortenHash(isRedeemed ? item.redeemHash : item.stakeHash)}
                        </a>
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* ---------------- Airdrop card ---------------- */}
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
              <span className="sp-highlight">{STAKE_PRICE.toFixed(2)} USDT</span>
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

          <button type="button" className="sp-buy-btn" onClick={handleJoin}>
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
                      {t('ipo.airdropRecordId')}: {item.id}
                    </span>
                    <span className="sp-record-time">{item.time}</span>
                  </div>
                  <div className="sp-record-grid">
                    <div className="sp-record-item">
                      {t('ipo.airdropQuantity')}: {item.quantity.toLocaleString()} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropTriple')}: {item.tripleQuantity.toFixed(2)} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRateField')}: {item.rate}
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
      </div>

      {/* ---------------- Acceleration packs (NFT, mock) ---------------- */}
      <div className="staking-divider" />

      <section className="sp-accel-section">
        <h2 className="sp-accel-title">{t('ipo.accelTitle')}</h2>
        <p className="sp-accel-subtitle">{t('ipo.accelSubtitle')}</p>

        {accelTip && <div className="sp-tip success">{accelTip}</div>}

        <div className="sp-accel-layout">
          {/* Left: the single NFT pack */}
          <div className="sp-accel-card">
            <div className="sp-accel-visual">
              <span className="sp-accel-badge">{t('ipo.accelNftBadge')}</span>
              <img src={logoImg} alt="PEAK" className="sp-accel-logo" />
              <span className="sp-accel-visual-boost">{ACCEL_PACK.boost}</span>
            </div>
            <div className="sp-accel-body">
              <h3 className="sp-accel-name">{t('ipo.accelPackName')}</h3>
              <p className="sp-accel-desc">{t('ipo.accelPackDesc')}</p>
              <div className="sp-accel-row">
                <span className="sp-accel-row-label">{t('ipo.accelBoost')}</span>
                <span className="sp-accel-row-value sp-highlight">{ACCEL_PACK.boost}</span>
              </div>
              <div className="sp-accel-row">
                <span className="sp-accel-row-label">{t('ipo.accelValidity')}</span>
                <span className="sp-accel-row-value">
                  {ACCEL_PACK.validity} {t('ipo.accelDayUnit')}
                </span>
              </div>
              <div className="sp-accel-row">
                <span className="sp-accel-row-label">{t('ipo.accelStock')}</span>
                <span className="sp-accel-row-value">{ACCEL_PACK.stock}</span>
              </div>
              <div className="sp-accel-price-row">
                <span className="sp-accel-price">{ACCEL_PACK.price} USDT</span>
                <button type="button" className="sp-accel-buy-btn" onClick={handleBuyPack}>
                  {t('ipo.accelBuy')}
                </button>
              </div>
            </div>
          </div>

          {/* Right: purchase records */}
          <div className="sp-accel-records">
            <h3 className="sp-record-title">{t('ipo.accelRecordTitle')}</h3>
            <div className="sp-record-list">
              {accelRecords.length === 0 ? (
                <div className="sp-record-empty">{t('ipo.accelNoRecord')}</div>
              ) : (
                accelRecords.map((item) => (
                  <div key={item.id} className="sp-record-card">
                    <div className="sp-record-header">
                      <span className="sp-record-id">
                        {t('ipo.accelRecordId')}: {item.id}
                      </span>
                      <span className="sp-record-time">{item.time}</span>
                    </div>
                    <div className="sp-record-grid">
                      <div className="sp-record-item">
                        {t('ipo.accelRecordQty')}: {item.qty}
                      </div>
                      <div className="sp-record-item">
                        {t('ipo.accelRecordPrice')}: {item.price} USDT
                      </div>
                      <div className="sp-record-item">
                        {t('ipo.accelRecordStatus')}: {t('ipo.accelStatusOwned')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

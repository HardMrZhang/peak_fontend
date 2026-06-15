import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import {
  getAirdropConfig,
  getAirdropParams,
  confirmAirdrop,
  getAirdropRecords,
  getAirdropSummary,
  getDappWithdrawParams,
  confirmDappWithdraw,
  getPeakPrice,
} from '@/api'
import type { DappAirdropConfig, DappAirdropRecord, DappAirdropSummary } from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import './index.css'

const AIRDROP_MULTIPLE = 3

export default function Airdrop() {
  const { t } = useTranslation()
  const { sendDappIx, connected } = useDappTx()

  const [airdropConfig, setAirdropConfig] = useState<DappAirdropConfig | null>(null)
  const [quantity, setQuantity] = useState('1000')
  const [airdropRecords, setAirdropRecords] = useState<DappAirdropRecord[]>([])
  const [summary, setSummary] = useState<DappAirdropSummary | null>(null)
  const [joining, setJoining] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
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
      try {
        const sum = await getAirdropSummary()
        setSummary(sum.data)
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
    // 真实加速数据：直推加速 = 直推静态实时累加 ×10%；团队加速 = 最近日结级差+平级（封顶后）
    const referAccel = summary ? parseFloat(summary.directAccel) || 0 : 0
    const teamAccel = summary ? parseFloat(summary.teamAccel) || 0 : 0
    const dailyTotal = dailyAirdrop + referAccel + teamAccel
    const totalDays = dailyTotal > 0 ? Math.ceil(totalAirdrop / dailyTotal) : 0
    return { qty, totalValue, rateText, totalAirdrop, dailyAirdrop, referAccel, teamAccel, totalDays }
  }, [quantity, price, airdropConfig, summary])

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
    const minUsd = airdropConfig?.minUsd ?? 100
    if (price > 0 && qty * price < minUsd) {
      message.warning(t('ipo.minJoinUsd', { min: minUsd }))
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
      const serverMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      if (serverMsg.includes('Minimum participation')) {
        message.warning(t('ipo.minJoinUsd', { min: minUsd }))
      } else if (!msg.includes('User rejected')) {
        message.error(`${t('ipo.joinFail')}: ${(serverMsg || msg).slice(0, 80)}`)
      }
    } finally {
      setJoining(false)
    }
  }

  // 每个订单（空投包）单独提币：可提数量 = 本包累计释放 − 本包已提，取小数点前整数
  const handleWithdraw = async (record: DappAirdropRecord) => {
    if (withdrawing) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const withdrawableInt = record.withdrawableInt ?? '0'
    if (Number(withdrawableInt) <= 0) {
      message.warning(t('ipo.noWithdrawable'))
      return
    }
    setWithdrawing(true)
    setWithdrawingId(record.id)
    try {
      const paramsRes = await getDappWithdrawParams(withdrawableInt, record.id)
      const sig = await sendDappIx(paramsRes.data)
      await confirmDappWithdraw({ txHash: sig, intentId: paramsRes.data.intentId })
      message.success(t('ipo.withdrawSuccess'))
      refreshAirdrop()
    } catch (err: unknown) {
      const serverMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        message.error(`${t('ipo.withdrawFail')}: ${(serverMsg || msg).slice(0, 80)}`)
      }
    } finally {
      setWithdrawing(false)
      setWithdrawingId(null)
    }
  }

  useEffect(() => {
    refreshAirdrop()
  }, [refreshAirdrop, connected])

  return (
    <div className="airdrop-page">
      <div className="ad-grid">
        {/* ---------------- 左侧：参与表单 ---------------- */}
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
        </section>

        {/* ---------------- 右侧：参与记录 ---------------- */}
        <section className="sp-card">
          <h2 className="sp-card-title">{t('ipo.airdropRecordTitle')}</h2>
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
                      {t('ipo.dailyStatic')}: {item.dailyAmount} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRemainDays')}: {item.remainDays} {t('ipo.dayUnit')}
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.accelTeam')}: {summary?.teamAccel ?? '0'} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.accelDirect')}: {summary?.directAccel ?? '0'} PEAK
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.accelDirectOnce')}: {summary?.directOnce ?? '0'} PEAK
                    </div>
                  </div>
                  <div className="sp-record-footer">
                    <span className="sp-record-item">
                      {t('ipo.withdrawable')}: {item.withdrawable ?? '0'} PEAK
                    </span>
                    <button
                      type="button"
                      className="sp-withdraw-btn"
                      onClick={() => handleWithdraw(item)}
                      disabled={withdrawing || Number(item.withdrawableInt ?? '0') <= 0}
                    >
                      {withdrawing && withdrawingId === item.id
                        ? t('ipo.withdrawing')
                        : t('ipo.withdrawBtn')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

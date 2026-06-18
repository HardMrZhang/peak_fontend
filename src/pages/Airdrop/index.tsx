import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import {
  getAirdropConfig,
  getAirdropParams,
  confirmAirdrop,
  getAirdropRecords,
  getAirdropReleaseRecords,
  getAirdropSummary,
  getDappWithdrawParams,
  confirmDappWithdraw,
  getPeakPrice,
} from '@/api'
import type {
  DappAirdropConfig,
  DappAirdropRecord,
  DappAirdropReleaseRecord,
  DappAirdropSummary,
} from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import './index.css'

const AIRDROP_MULTIPLE = 3

// 记录编号展示格式：固定前缀 PK + 6 位补零编号（如 767 → PK000767）
const formatRecordNo = (grantId: string | number) => {
  const digits = String(grantId).replace(/\D/g, '')
  return `PK${digits.padStart(6, '0')}`
}

const toSafeBigInt = (value: string | number | bigint | null | undefined): bigint => {
  if (value === null || value === undefined) return 0n
  try {
    const parsed = BigInt(value)
    return parsed > 0n ? parsed : 0n
  } catch {
    return 0n
  }
}

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

  // 每日释放（每日可提）记录：按包展开加载
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [releaseMap, setReleaseMap] = useState<Record<string, DappAirdropReleaseRecord[]>>({})
  const [releaseLoadingId, setReleaseLoadingId] = useState<string | null>(null)
  const summaryWithdrawableInt = useMemo(
    () => toSafeBigInt(summary?.withdrawableInt),
    [summary?.withdrawableInt],
  )

  const toggleReleaseRecords = useCallback(async (packageId: string) => {
    if (expandedId === packageId) {
      setExpandedId(null)
      return
    }
    setExpandedId(packageId)
    if (!releaseMap[packageId]) {
      setReleaseLoadingId(packageId)
      try {
        const res = await getAirdropReleaseRecords({ packageId, page: 1, pageSize: 200 })
        setReleaseMap((prev) => ({ ...prev, [packageId]: res.data?.list ?? [] }))
      } catch {
        setReleaseMap((prev) => ({ ...prev, [packageId]: [] }))
      } finally {
        setReleaseLoadingId(null)
      }
    }
  }, [expandedId, releaseMap])

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
  const getPackageWithdrawableInt = useCallback(
    (record: DappAirdropRecord) => toSafeBigInt(record.withdrawableInt),
    [],
  )

  // 发送到后端的提币数量优先受链上余额约束；若链上暂时为 0 但包内有额度，仍发起请求触发后端自愈。
  const getWithdrawRequestInt = useCallback((record: DappAirdropRecord) => {
    const packageWithdrawable = getPackageWithdrawableInt(record)
    if (packageWithdrawable <= 0n) return 0n
    if (summaryWithdrawableInt <= 0n) return packageWithdrawable
    return packageWithdrawable < summaryWithdrawableInt ? packageWithdrawable : summaryWithdrawableInt
  }, [getPackageWithdrawableInt, summaryWithdrawableInt])

  const handleWithdraw = async (record: DappAirdropRecord) => {
    if (withdrawing) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const packageWithdrawableInt = getPackageWithdrawableInt(record)
    if (packageWithdrawableInt <= 0n) {
      message.warning(t('ipo.noWithdrawable'))
      return
    }
    const withdrawableInt = getWithdrawRequestInt(record)
    if (withdrawableInt <= 0n) {
      message.warning(t('ipo.noWithdrawable'))
      return
    }
    setWithdrawing(true)
    setWithdrawingId(record.id)
    try {
      const paramsRes = await getDappWithdrawParams(withdrawableInt.toString(), record.id)
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
                      {t('ipo.airdropRecordId')}: {formatRecordNo(item.grantId)}
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
                      disabled={withdrawing || getPackageWithdrawableInt(item) <= 0n}
                    >
                      {withdrawing && withdrawingId === item.id
                        ? t('ipo.withdrawing')
                        : t('ipo.withdrawBtn')}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="sp-release-toggle"
                    onClick={() => toggleReleaseRecords(item.id)}
                  >
                    {expandedId === item.id
                      ? t('ipo.releaseRecordsHide')
                      : t('ipo.releaseRecordsShow')}
                  </button>

                  {expandedId === item.id && (
                    <div className="sp-release-list">
                      {releaseLoadingId === item.id ? (
                        <div className="sp-release-empty">{t('ipo.loading')}</div>
                      ) : (releaseMap[item.id]?.length ?? 0) === 0 ? (
                        <div className="sp-release-empty">{t('ipo.noReleaseRecord')}</div>
                      ) : (
                        <>
                          <div className="sp-release-row sp-release-head">
                            <span>{t('ipo.releaseDate')}</span>
                            <span>{t('ipo.releaseAmount')}</span>
                          </div>
                          {releaseMap[item.id].map((r) => (
                            <div key={r.id} className="sp-release-row">
                              <span>{r.bizDate}</span>
                              <span>{r.amount} PEAK</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

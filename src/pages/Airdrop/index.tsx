import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const { sendDappIx, connected } = useDappTx()

  const [airdropConfig, setAirdropConfig] = useState<DappAirdropConfig | null>(null)
  const [payCurrency, setPayCurrency] = useState<'USDT' | 'PEAK'>('USDT')
  // 自定义币种下拉（原生 <select> 在 TP/部分钱包 webview 里弹不出，改用受控 div 下拉）
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const currencyRef = useRef<HTMLDivElement | null>(null)
  const [quantity, setQuantity] = useState('100')
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
  // 出局记录（已出局且无残留可提）：默认隐藏，点击下拉框统一展开查看
  const [outExpanded, setOutExpanded] = useState(false)

  // 点击/触摸下拉之外区域时收起币种下拉
  useEffect(() => {
    if (!currencyOpen) return undefined
    const onOutside = (e: Event) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setCurrencyOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [currencyOpen])

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
    const amt = parseFloat(quantity) || 0
    // 下拉选择的币种决定输入含义：USDT → 折算 PEAK；PEAK → 折算 USDT
    const usdAmount = payCurrency === 'USDT' ? amt : amt * price
    const peakQty = payCurrency === 'USDT' ? (price > 0 ? amt / price : 0) : amt
    const threshold = airdropConfig?.tierThresholdUsd ?? 500
    const rateLow = airdropConfig ? parseFloat(airdropConfig.dailyRateLow) : 1.4
    const rateHigh = airdropConfig ? parseFloat(airdropConfig.dailyRateHigh) : 1.5
    const dailyRatePct = usdAmount < threshold ? rateLow : rateHigh
    const rateText = `${dailyRatePct}%`
    const totalAirdrop = peakQty * AIRDROP_MULTIPLE
    const dailyAirdrop = (peakQty * dailyRatePct) / 100
    // 真实加速数据：直推静态收益 = 直推静态实时累加 ×10%；团队加速与平级加速分开展示
    const referAccel = summary ? parseFloat(summary.directAccel) || 0 : 0
    const teamAccel = summary ? parseFloat(summary.teamAccel) || 0 : 0
    const peerAccel = summary ? parseFloat(summary.peerAccel) || 0 : 0
    const dailyTotal = dailyAirdrop + referAccel + teamAccel + peerAccel
    const totalDays = dailyTotal > 0 ? Math.ceil(totalAirdrop / dailyTotal) : 0
    return { usdAmount, peakQty, rateText, totalAirdrop, dailyAirdrop, referAccel, teamAccel, peerAccel, totalDays }
  }, [quantity, price, payCurrency, airdropConfig, summary])

  const handleJoin = async () => {
    if (joining) return
    if (airdropConfig?.participateClosed) {
      message.warning(t('ipo.participateClosed'))
      return
    }
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const amt = parseFloat(quantity) || 0
    const minUsd = airdropConfig?.minUsd ?? 100
    if (amt <= 0) {
      message.warning(t('ipo.minJoinUsd', { min: minUsd }))
      return
    }
    // 最低参与门槛 100U：U 下单直接比金额；PEAK 下单按实时价折算 USD 后比
    if (payCurrency === 'USDT') {
      if (amt < minUsd) { message.warning(t('ipo.minJoinUsd', { min: minUsd })); return }
    } else if (price > 0 && amt * price < minUsd) {
      message.warning(t('ipo.minJoinUsd', { min: minUsd })); return
    }
    setJoining(true)
    try {
      const paramsRes = await getAirdropParams(quantity, payCurrency)
      const sig = await sendDappIx(paramsRes.data)
      // 链上已付 USDT 后 confirm 幂等；网络波动时自动重试，避免刷新导致丢单
      let confirmErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await confirmAirdrop({ txHash: sig, intentId: paramsRes.data.intentId })
          confirmErr = null
          break
        } catch (err) {
          confirmErr = err
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
        }
      }
      if (confirmErr) throw confirmErr
      setJoinTip(t('ipo.joinSuccess'))
      if (joinTipTimer.current) clearTimeout(joinTipTimer.current)
      joinTipTimer.current = setTimeout(() => setJoinTip(''), 2500)
      refreshAirdrop()
    } catch (err: unknown) {
      const respData = (err as {
        response?: { data?: { message?: string; errorCode?: string; data?: { missingUsd?: string } } }
      })?.response?.data
      const serverMsg = respData?.message ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      if (respData?.errorCode === 'NEED_DRAMA_IPO_REINVEST') {
        // 复投须配套等值 AI 打新认购，提示还差多少
        message.warning(t('ipo.needDramaIpoReinvest', { amount: respData?.data?.missingUsd ?? '' }), 6)
      } else if (serverMsg.includes('Minimum participation')) {
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

  // 出局判定：已出局(isOut) 且本包已无残留可提。这类订单归入「出局记录」下拉，
  // 主列表不再逐条展开展示，点击下拉框统一查看。
  const isFullyOut = useCallback(
    (record: DappAirdropRecord) => !!record.isOut && getPackageWithdrawableInt(record) <= 0n,
    [getPackageWithdrawableInt],
  )
  const activeRecords = useMemo(
    () => airdropRecords.filter((r) => !isFullyOut(r)),
    [airdropRecords, isFullyOut],
  )
  const outRecords = useMemo(
    () => airdropRecords.filter((r) => isFullyOut(r)),
    [airdropRecords, isFullyOut],
  )

  // 发送到后端的提币数量优先受链上余额约束；若链上暂时为 0 但包内有额度，仍发起请求触发后端自愈。
  const getWithdrawRequestInt = useCallback((record: DappAirdropRecord) => {
    // 提现额以「本包 DB 可提（已释放 − 已提）」为准，不再用可能滞后的链上 credit 压小额度。
    // 加速/释放刚记账、链上 credit 还没被每日对账补上时，旧逻辑会把额度压成极小值（曾导致只提到 0.8）；
    // 链上 credit 不足时由后端 getWithdrawParams 的自愈补差顶到本次额度。
    return getPackageWithdrawableInt(record)
  }, [getPackageWithdrawableInt])

  const handleWithdraw = async (record: DappAirdropRecord) => {
    if (withdrawing) return
    // 非 AI 打新包提币通道已关闭（白名单地址后端返回 nonDramaWithdrawClosed=false，放行）
    // AIpk 包的释放已记入 AIPK 账本，提现走账本提现页（提到钱包不收手续费）
    if (isAipkPkg(record)) {
      navigate('/withdrawal')
      return
    }
    if (!isDramaPkg(record) && (airdropConfig?.nonDramaWithdrawClosed ?? true)) {
      message.warning(t('ipo.withdrawClosed'))
      return
    }
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
      // 链上已扣额度后 confirm 幂等；网络波动时自动重试，避免刷新/断网导致后端漏记已提量、可提余额虚高
      let confirmErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await confirmDappWithdraw({ txHash: sig, intentId: paramsRes.data.intentId })
          confirmErr = null
          break
        } catch (err) {
          confirmErr = err
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
        }
      }
      if (confirmErr) throw confirmErr
      message.success(t('ipo.withdrawSuccess'))
      // 等刷新完成再解禁按钮：确保「可提金额」已更新为 0，
      // 按钮从点击 → 链上确认成功整个过程持续置灰、不回弹可点。
      await refreshAirdrop()
    } catch (err: unknown) {
      const respData = (err as {
        response?: { data?: { message?: string; errorCode?: string; data?: { requiredUsd?: number } } }
      })?.response?.data
      const serverMsg = respData?.message ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      if (respData?.errorCode === 'AIRDROP_WITHDRAW_CLOSED') {
        message.warning(t('ipo.withdrawClosed'), 6)
      } else if (respData?.errorCode === 'NEED_DRAMA_IPO') {
        // 提币量已达参与量：引导去 AI 打新，门槛按团队等级分档（T0/T1 500U，T2 1000U，T3+ 2000U）
        message.warning(t('ipo.needDramaIpo', { amount: respData?.data?.requiredUsd ?? 500 }), 6)
      } else if (!msg.includes('User rejected')) {
        message.error(`${t('ipo.withdrawFail')}: ${(serverMsg || msg).slice(0, 80)}`)
      }
      // 链上可能已扣额度但 confirm 失败：刷新触发后端按链上已提量自愈对账，把可提余额纠正为 0；
      // 同样等刷新完成再解禁，避免余额虚高时按钮回弹可点。
      await refreshAirdrop()
    } finally {
      setWithdrawing(false)
      setWithdrawingId(null)
    }
  }

  useEffect(() => {
    refreshAirdrop()
  }, [refreshAirdrop, connected])

  // 「查看每日释放记录」下拉：主列表卡片与出局记录卡片共用
  // 打新包（V1 PEAK / V2 AIpk）判定与计价单位
  const isDramaPkg = (r: DappAirdropRecord) => r.sourceType === 'DRAMA_IPO' || r.sourceType === 'DRAMA_IPO_AIPK'
  const isAipkPkg = (r: DappAirdropRecord) => r.asset === 'AIPK'
  const unitOf = (r: DappAirdropRecord) => (isAipkPkg(r) ? 'AIpk' : 'PEAK')

  const renderReleaseSection = (item: DappAirdropRecord) => (
    <>
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
                  <span>{r.amount} {unitOf(item)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  )

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
                min={payCurrency === 'USDT' ? (airdropConfig?.minUsd ?? 100) : 0}
                step="0.01"
                value={quantity}
                placeholder={payCurrency === 'USDT' ? t('ipo.quantityPlaceholder') : t('ipo.quantityPlaceholderPeak')}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <div className="sp-cur-select" ref={currencyRef}>
                <button
                  type="button"
                  className="sp-cur-trigger"
                  onClick={() => setCurrencyOpen((v) => !v)}
                >
                  <span>{payCurrency}</span>
                  <span className={`sp-cur-caret${currencyOpen ? ' open' : ''}`}>▾</span>
                </button>
                {currencyOpen && (
                  <div className="sp-cur-menu">
                    {(['USDT', 'PEAK'] as const).map((c) => (
                      <div
                        key={c}
                        className={`sp-cur-option${payCurrency === c ? ' active' : ''}`}
                        onClick={() => { setPayCurrency(c); setCurrencyOpen(false) }}
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="sp-info-box">
            <div className="sp-info-line">
              <span>{t('ipo.realTimePrice')}</span>
              <span className="sp-highlight">{price > 0 ? price.toFixed(4) : '--'} USDT</span>
            </div>
            {payCurrency === 'USDT' ? (
              <div className="sp-info-line">
                <span>{t('ipo.peakEquivalent')}</span>
                <span className="sp-highlight">{airdropCalc.peakQty > 0 ? airdropCalc.peakQty.toFixed(4) : '--'} PEAK</span>
              </div>
            ) : (
              <div className="sp-info-line">
                <span>{t('ipo.usdEquivalent')}</span>
                <span className="sp-highlight">{airdropCalc.usdAmount > 0 ? airdropCalc.usdAmount.toFixed(2) : '--'} USDT</span>
              </div>
            )}
            <div className="sp-info-line">
              <span>{t('ipo.totalValue')}</span>
              <span className="sp-highlight">{airdropCalc.usdAmount.toFixed(2)} USDT</span>
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
              <span>{t('ipo.peerAirdrop')}</span>
              <span className="sp-highlight">{airdropCalc.peerAccel.toFixed(2)} PEAK</span>
            </div>
            <div className="sp-info-line">
              <span>{t('ipo.estimateDays')}</span>
              <span className="sp-highlight">
                {airdropCalc.totalDays} {t('ipo.dayUnit')}
              </span>
            </div>
          </div>

          {airdropConfig?.participateClosed ? (
            <>
              <button type="button" className="sp-buy-btn" disabled>
                {t('ipo.participateClosedBtn')}
              </button>
              <div className="sp-airdrop-tip">{t('ipo.participateClosed')}</div>
            </>
          ) : (
            <button type="button" className="sp-buy-btn" onClick={handleJoin} disabled={joining}>
              {t('ipo.confirmJoin')}
            </button>
          )}

          {joinTip && <div className="sp-tip success">{joinTip}</div>}
        </section>

        {/* ---------------- 右侧：参与记录 ---------------- */}
        <section className="sp-card">
          <h2 className="sp-card-title">{t('ipo.airdropRecordTitle')}</h2>
          <div className="sp-record-list">
            {airdropRecords.length === 0 ? (
              <div className="sp-record-empty">{t('ipo.noAirdropRecord')}</div>
            ) : (
              <>
                {activeRecords.map((item) => (
                <div key={item.id} className="sp-record-card">
                  <div className="sp-record-header">
                    <span className="sp-record-id">
                      {t('ipo.airdropRecordId')}: {formatRecordNo(item.grantId)}
                    </span>
                    <span className="sp-record-time">{item.createdAt.slice(0, 19).replace('T', ' ')}</span>
                  </div>
                  <div className="sp-record-grid">
                    <div className="sp-record-item">
                      {isDramaPkg(item)
                        ? <>{t('ipo.airdropQuantityDrama')}: {item.dramaBaseAmount} {unitOf(item)}</>
                        : <>{t('ipo.airdropQuantity')}: {item.principal} PEAK</>}
                    </div>
                    <div className="sp-record-item">
                      {isAipkPkg(item) ? t('ipo.airdropPackTotal') : t('ipo.airdropTriple')}: {item.totalCap} {unitOf(item)}
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRateField')}: {item.dailyRate}%
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.dailyStatic')}: {item.dailyAmount} {unitOf(item)}
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRemainDays')}: {item.remainDays} {t('ipo.dayUnit')}
                    </div>
                    <div className="sp-record-item">
                      {t('ipo.airdropRemaining')}: {item.remaining ?? '0'} {unitOf(item)}
                    </div>
                    {/* AIpk 包不参与三倍空投加速：直推 / 级差在打新分红结算时另算，这里不展示加速行 */}
                    {!isAipkPkg(item) && (
                      <>
                        <div className="sp-record-item">
                          {t('ipo.accelTeam')}: {item.isAccelerationOrder ? (summary?.teamAccel ?? '0') : '0'} PEAK
                        </div>
                        <div className="sp-record-item">
                          {t('ipo.accelPeer')}: {item.isAccelerationOrder ? (summary?.peerAccel ?? '0') : '0'} PEAK
                        </div>
                        <div className="sp-record-item">
                          {t('ipo.accelDirect')}: {item.isAccelerationOrder ? (summary?.directAccel ?? '0') : '0'} PEAK
                        </div>
                        <div className="sp-record-item">
                          {t('ipo.accelDirectOnce')}: {item.isAccelerationOrder ? (summary?.directOnceTotal ?? '0') : '0'} PEAK
                          {item.isAccelerationOrder && Number(summary?.directOnce ?? 0) > 0 && (
                            <span className="sp-record-today">（{t('ipo.accelDirectOnceToday')} +{summary?.directOnce}）</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="sp-record-footer">
                    <span className="sp-record-item">
                      {isAipkPkg(item)
                        ? <>{t('ipo.airdropReleasedToBalance')}: {item.released ?? '0'} AIpk</>
                        : <>{t('ipo.withdrawable')}: {item.withdrawable ?? '0'} PEAK</>}
                    </span>
                    {(() => {
                      // 出局且已无残留可提 → 显示「已出局」并禁用；
                      // 出局但仍有最后一笔释放未提 → 仍允许提走，避免余额卡住。
                      // 非 AI 打新包（CHAIN/GENESIS）提币通道整体关闭。
                      if (isAipkPkg(item)) {
                        // AIpk 包：余额在 AIPK 账本，按钮直接跳转账本提现页
                        return (
                          <button type="button" className="sp-withdraw-btn" onClick={() => handleWithdraw(item)}>
                            {t('ipo.goLedgerWithdraw')}
                          </button>
                        )
                      }
                      const pkgWithdrawable = getPackageWithdrawableInt(item)
                      const fullyOut = item.isOut && pkgWithdrawable <= 0n
                      const closed = !isDramaPkg(item)
                        && (airdropConfig?.nonDramaWithdrawClosed ?? true)
                      return (
                        <button
                          type="button"
                          className="sp-withdraw-btn"
                          onClick={() => handleWithdraw(item)}
                          disabled={closed || fullyOut || withdrawing || item.withdrawnToday || pkgWithdrawable <= 0n}
                        >
                          {closed
                            ? t('ipo.withdrawClosedBtn')
                            : fullyOut
                              ? t('ipo.airdropOut')
                              : withdrawing && withdrawingId === item.id
                                ? t('ipo.withdrawing')
                                : item.withdrawnToday
                                  ? t('ipo.withdrawnToday')
                                  : t('ipo.withdrawBtn')}
                        </button>
                      )
                    })()}
                  </div>

                  {renderReleaseSection(item)}
                </div>
                ))}

                {outRecords.length > 0 && (
                  <div className="sp-out-section">
                    <button
                      type="button"
                      className="sp-out-toggle"
                      onClick={() => setOutExpanded((v) => !v)}
                    >
                      {outExpanded
                        ? t('ipo.outRecordsHide', { n: outRecords.length })
                        : t('ipo.outRecordsShow', { n: outRecords.length })}
                    </button>

                    {outExpanded && (
                      <div className="sp-out-list">
                        {outRecords.map((item) => (
                          <div key={item.id} className="sp-record-card sp-record-card--out">
                            <div className="sp-record-header">
                              <span className="sp-record-id">
                                {t('ipo.airdropRecordId')}: {formatRecordNo(item.grantId)}
                              </span>
                              <span className="sp-record-time">{item.createdAt.slice(0, 19).replace('T', ' ')}</span>
                            </div>
                            <div className="sp-record-grid">
                              <div className="sp-record-item">
                                {isDramaPkg(item)
                                  ? <>{t('ipo.airdropQuantityDrama')}: {item.dramaBaseAmount} {unitOf(item)}</>
                                  : <>{t('ipo.airdropQuantity')}: {item.principal} PEAK</>}
                              </div>
                              <div className="sp-record-item">
                                {isAipkPkg(item) ? t('ipo.airdropPackTotal') : t('ipo.airdropTriple')}: {item.totalCap} {unitOf(item)}
                              </div>
                              <div className="sp-record-item">
                                <span className="sp-out-badge">{t('ipo.airdropOut')}</span>
                              </div>
                            </div>
                            {renderReleaseSection(item)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

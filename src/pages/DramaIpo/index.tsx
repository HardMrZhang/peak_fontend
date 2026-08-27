import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import {
  getDramaIpoConfig,
  getDramaProjects,
  getDramaProject,
  getDramaSubscribeParams,
  confirmDramaSubscribe,
  previewDramaAgreement,
  getDramaPendingAgreements,
  getDramaSubscriptions,
} from '@/api'
import type { DramaIpoConfig, DramaProject, DramaPendingAgreement, DramaSubscriptionRecord } from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import ContractSignModal from '@/components/ContractSignModal'
import { downloadContract } from '@/utils/contractFile'
import './index.css'

const STATUS_CLASS: Record<string, string> = {
  OPEN: 'open',
  PENDING: 'pending',
  SOLD_OUT: 'soldout',
  CLOSED: 'closed',
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// 接口返回的是 UTC 时间串，直接 slice 会差一天（北京 9/1 00:00 = UTC 8/31 16:00），
// 统一按北京时间取日期
function formatBeijingDate(value?: string | null) {
  if (!value) return '--'
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return String(value).slice(0, 10)
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export default function DramaIpo() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { sendDappIx, connected } = useDappTx()

  const [config, setConfig] = useState<DramaIpoConfig | null>(null)
  const [projects, setProjects] = useState<DramaProject[]>([])
  const [activeSerial, setActiveSerial] = useState<string | null>(null)
  const [detail, setDetail] = useState<DramaProject | null>(null)

  const [shares, setShares] = useState('1')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tip, setTip] = useState('')
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [agreementOpen, setAgreementOpen] = useState(false)
  const [agreementHtml, setAgreementHtml] = useState('')
  const [agreementLoading, setAgreementLoading] = useState(false)

  // 正式协议在付款成功后签署：T 日与实际投资额要等链上到账才能定稿
  const [pending, setPending] = useState<DramaPendingAgreement[]>([])
  const [signTarget, setSignTarget] = useState<DramaPendingAgreement | null>(null)

  // 我的认购：本金返还到期入账后展示「去提现」入口
  const [mySubs, setMySubs] = useState<DramaSubscriptionRecord[]>([])
  // 正在下载合同的订单 id，防重复点击
  const [downloadingSub, setDownloadingSub] = useState('')

  const handleDownloadContract = async (s: DramaSubscriptionRecord) => {
    setDownloadingSub(s.id)
    try {
      await downloadContract(s.id, s.contractNo ?? null, s.projectName)
    } catch {
      message.error(t('dramaIpo.downloadFail'))
    } finally {
      setDownloadingSub('')
    }
  }

  // 待开盘剧目的倒计时基准：openInMs 是服务端算好的剩余毫秒，本地按秒递减
  const [nowTick, setNowTick] = useState(Date.now())
  const openBaseRef = useRef<{ serialNo: string; readyAt: number } | null>(null)

  // 桌面端剧目选择器（下拉菜单）的展开状态；手机端始终平铺不受影响
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => () => { if (tipTimer.current) clearTimeout(tipTimer.current) }, [])

  const loadProjects = useCallback(async () => {
    try {
      const res = await getDramaProjects({ page: 1, pageSize: 50 })
      const list = res.data?.list ?? []
      setProjects(list)
      setActiveSerial((prev) => {
        if (prev && list.some((p) => p.serialNo === prev)) return prev
        // 默认选中第一个可认购的剧目；售罄的只在历史查询里展示
        return (
          list.find((p) => p.status === 'OPEN')
          ?? list.find((p) => p.status !== 'SOLD_OUT')
          ?? list[0]
        )?.serialNo ?? null
      })
    } catch { /* ignore */ }
  }, [])

  const loadDetail = useCallback(async (serialNo: string) => {
    try {
      const res = await getDramaProject(serialNo)
      setDetail(res.data)
      openBaseRef.current = res.data.openInMs != null && res.data.openInMs > 0
        ? { serialNo, readyAt: Date.now() + res.data.openInMs }
        : null
    } catch { /* ignore */ }
  }, [])

  const loadPending = useCallback(async () => {
    if (!hasToken()) return []
    try {
      const res = await getDramaPendingAgreements()
      const list = res.data ?? []
      setPending(list)
      return list
    } catch {
      return []
    }
  }, [])

  const loadMySubs = useCallback(async () => {
    if (!hasToken()) return
    try {
      const res = await getDramaSubscriptions({ page: 1, pageSize: 20 })
      setMySubs(res.data?.list ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    getDramaIpoConfig().then((res) => setConfig(res.data)).catch(() => {})
    loadProjects()
    loadPending()
    loadMySubs()
  }, [loadProjects, loadPending, loadMySubs])

  useEffect(() => {
    if (activeSerial) loadDetail(activeSerial)
  }, [activeSerial, loadDetail])

  // 剩余份数与开盘倒计时都需要秒级刷新
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 开盘时间一到自动拉取最新状态，用户无需手动刷新
  const countdownMs = useMemo(() => {
    const base = openBaseRef.current
    if (!base || base.serialNo !== activeSerial) return 0
    return Math.max(0, base.readyAt - nowTick)
  }, [nowTick, activeSerial])

  useEffect(() => {
    if (openBaseRef.current && countdownMs === 0 && activeSerial) {
      openBaseRef.current = null
      loadDetail(activeSerial)
      loadProjects()
    }
  }, [countdownMs, activeSerial, loadDetail, loadProjects])

  const shareCount = Math.max(0, parseInt(shares, 10) || 0)
  const sharePrice = detail ? Number(detail.sharePriceUsdt) : (config?.sharePriceUsdt ?? 100)
  const peakPrice = config?.priceUsdt ? parseFloat(config.priceUsdt) : 0
  const remaining = detail?.remainingShares ?? 0
  const canSubscribe = detail?.status === 'OPEN' && remaining > 0

  /**
   * 预计收益，与链上 subscribe 指令同一套算法：
   *   空投 = 认购额 × 33% ÷ PEAK 现价 × 3，300 天线性释放
   *   本金 = 第 2、3 个月各返 50%
   *   分红 = 第 4 个月起 10 期，每期按份数分摊该月票房的 40%
   */
  const calc = useMemo(() => {
    const amount = shareCount * sharePrice
    const baseRate = config?.airdropBaseRate ?? 0.33
    const multiplier = config?.multiplier ?? 3
    const releaseDays = config?.releaseDays ?? 300
    const airdropBaseUsdt = amount * baseRate
    const airdropTotal = peakPrice > 0 ? (airdropBaseUsdt / peakPrice) * multiplier : 0
    const principalPerMonth = amount * (config?.principalReturnRate ?? 0.5)
    return {
      amount,
      airdropBaseUsdt,
      airdropTotal,
      airdropDaily: releaseDays > 0 ? airdropTotal / releaseDays : 0,
      releaseDays,
      principalPerMonth,
      principalMonths: config?.principalReturnMonths ?? [2, 3],
      dividendFirstMonth: config?.dividendFirstMonth ?? 4,
      dividendPeriods: config?.dividendPeriods ?? 10,
      dividendRate: config?.dividendRate ?? 0.4,
    }
  }, [shareCount, sharePrice, peakPrice, config])

  const adjustShares = (delta: number) => {
    const next = Math.max(1, Math.min(remaining || 1, shareCount + delta))
    setShares(String(next))
  }

  const openAgreement = async () => {
    if (!detail) return
    if (!hasToken()) {
      message.warning(t('account.walletRequired'))
      return
    }
    setAgreementOpen(true)
    setAgreementLoading(true)
    try {
      const res = await previewDramaAgreement(detail.serialNo, Math.max(1, shareCount))
      setAgreementHtml(res.data?.contentHtml ?? '')
    } catch {
      setAgreementHtml('')
    } finally {
      setAgreementLoading(false)
    }
  }

  const handleSubscribe = async () => {
    if (submitting || !detail) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    if (!agreed) {
      message.warning(t('dramaIpo.agreeRequired'))
      return
    }
    if (shareCount <= 0) {
      message.warning(t('dramaIpo.sharesRequired'))
      return
    }
    if (shareCount > remaining) {
      message.warning(t('dramaIpo.remainingOnly', { n: remaining }))
      return
    }

    setSubmitting(true)
    try {
      const paramsRes = await getDramaSubscribeParams(detail.serialNo, shareCount)
      const sig = await sendDappIx(paramsRes.data)
      // 链上已付 USDT 后 confirm 幂等；网络波动时重试，避免刷新导致丢单
      let confirmErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await confirmDramaSubscribe({ txHash: sig, intentId: paramsRes.data.intentId })
          confirmErr = null
          break
        } catch (err) {
          confirmErr = err
          if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
        }
      }
      if (confirmErr) throw confirmErr

      setTip(t('dramaIpo.subscribeSuccess'))
      if (tipTimer.current) clearTimeout(tipTimer.current)
      tipTimer.current = setTimeout(() => setTip(''), 3000)
      setAgreed(false)
      await Promise.all([loadDetail(detail.serialNo), loadProjects(), loadMySubs()])

      // 付款到账后正式协议才能定稿，这里立刻拉起签署弹窗；
      // 没有待签合同时直接整页刷新，保证余额、进度等全部是最新状态
      const list = await loadPending()
      const justNow = list.find((p) => p.serialNo === detail.serialNo) ?? list[0]
      if (justNow) {
        setSignTarget(justNow)
      } else {
        window.location.reload()
      }
    } catch (err: unknown) {
      const serverMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        message.error(`${t('dramaIpo.subscribeFail')}: ${(serverMsg || msg).slice(0, 80)}`)
      }
      if (detail) loadDetail(detail.serialNo)
    } finally {
      setSubmitting(false)
    }
  }

  const soldPercent = detail && detail.totalShares > 0
    ? Math.min(100, (detail.soldShares / detail.totalShares) * 100)
    : 0

  // 售罄的剧目先在首页停留 48h（让用户看到已售罄），之后才移入「历史查询」；
  // 刚售罄还没写入售罄时间的按停留处理。全部被移走时回退展示原列表，避免首页空白。
  const SOLD_OUT_LINGER_MS = 48 * 60 * 60 * 1000
  const visibleProjects = useMemo(() => {
    const alive = projects.filter((p) => {
      if (p.status !== 'SOLD_OUT') return true
      if (!p.soldOutAt) return true
      return Date.now() - new Date(p.soldOutAt).getTime() < SOLD_OUT_LINGER_MS
    })
    const list = alive.length > 0 ? alive : projects
    // 没打完（未售罄）的排上面，售罄的沉底；同组内保持原有顺序
    return [...list].sort(
      (a, b) => Number(a.status === 'SOLD_OUT') - Number(b.status === 'SOLD_OUT'),
    )
  }, [projects, SOLD_OUT_LINGER_MS])

  // 剧目选择行底部的迷你认购进度条
  const renderTabProgress = (p: DramaProject) => {
    const pct = p.totalShares > 0 ? Math.min(100, (p.soldShares / p.totalShares) * 100) : 0
    return (
      <span className="di-tab-progress">
        <span className="di-tab-progress-label">{t('dramaIpo.soldProgress')}</span>
        <span className="di-tab-progress-bar">
          <span className="di-tab-progress-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="di-tab-progress-text">
          {p.soldShares}/{p.totalShares} {t('dramaIpo.shareUnit')}
          <span className="di-tab-progress-pct">{Math.floor(pct)}%</span>
        </span>
      </span>
    )
  }

  return (
    <div className="drama-page">
      <div className="di-wrap">
        <div className="di-topbar">
          <div>
            <div className="di-page-title">
              {t('dramaIpo.title')}
              <button type="button" className="di-link-btn" onClick={() => navigate('/drama-ipo/history')}>
                {t('dramaIpo.historyEntry')}
              </button>
            </div>
            <div className="di-page-sub">{t('dramaIpo.subtitle')}</div>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="di-pending-bar">
            <span className="di-pending-text">
              {t('dramaIpo.pendingSignTip', { n: pending.length })}
            </span>
            <button type="button" className="di-pending-btn" onClick={() => setSignTarget(pending[0])}>
              {t('dramaIpo.goSign')}
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="di-card">
            <div className="di-empty">{t('dramaIpo.noProjects')}</div>
          </div>
        ) : (
          <>
            <div className={`di-picker${pickerOpen ? ' open' : ''}`}>
              {(() => {
                const activeIdx = Math.max(0, visibleProjects.findIndex((p) => p.serialNo === activeSerial))
                const active = projects.find((p) => p.serialNo === activeSerial) ?? visibleProjects[activeIdx]
                return (
                  <button
                    type="button"
                    className="di-picker-trigger di-tab"
                    disabled={visibleProjects.length < 2}
                    onClick={() => setPickerOpen((v) => !v)}
                  >
                    <span className="di-tab-main">
                      <span className="di-tab-label">{t('dramaIpo.dramaLabel')}:</span>
                      {active?.posterUrl
                        ? <img className="di-tab-poster" src={active.posterUrl} alt="" />
                        : <span className="di-tab-poster" />}
                      <span className="di-tab-info">
                        <span className="di-tab-name">{active?.name ?? '--'}</span>
                        <span className="di-tab-meta">{active?.serialNo ?? '--'}</span>
                      </span>
                      {active ? (
                        <span className={`di-tab-status${active.status === 'OPEN' ? ' open' : ''}`}>
                          {t(`dramaIpo.status.${active.status}`)}
                        </span>
                      ) : null}
                    {visibleProjects.length > 1 ? (
                      <svg className="di-picker-caret" aria-hidden viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                    </span>
                    {active ? renderTabProgress(active) : null}
                  </button>
                )
              })()}

              {/* 展开列表里不重复展示当前选中的剧目；售罄的见「历史查询」 */}
              <div className="di-tabs di-picker-menu">
                {visibleProjects.map((p) => (p.serialNo === activeSerial ? null : (
                  <button
                    key={p.serialNo}
                    type="button"
                    className="di-tab"
                    onClick={() => {
                      setActiveSerial(p.serialNo)
                      setShares('1')
                      setAgreed(false)
                      setPickerOpen(false)
                    }}
                  >
                    <span className="di-tab-main">
                      <span className="di-tab-label">{t('dramaIpo.dramaLabel')}:</span>
                      {p.posterUrl
                        ? <img className="di-tab-poster" src={p.posterUrl} alt="" />
                        : <span className="di-tab-poster" />}
                      <span className="di-tab-info">
                        <span className="di-tab-name">{p.name}</span>
                        <span className="di-tab-meta">{p.serialNo}</span>
                      </span>
                      <span className={`di-tab-status${p.status === 'OPEN' ? ' open' : ''}`}>
                        {t(`dramaIpo.status.${p.status}`)}
                      </span>
                    </span>
                    {renderTabProgress(p)}
                  </button>
                )))}
              </div>
            </div>

            <div className="di-grid">
              {/* ---------------- 左侧：标的信息 ---------------- */}
              <div>
                <section className="di-card">
                  <div className="di-hero">
                    <div className="di-hero-media">
                      {detail?.posterUrl
                        ? <img className="di-hero-poster" src={detail.posterUrl} alt={detail.name} />
                        : <div className="di-hero-poster placeholder">{t('dramaIpo.noPoster')}</div>}
                    </div>

                    <div className="di-hero-body">
                      <div className="di-hero-name">
                        {detail?.name ?? '--'}
                        {detail?.grade ? <span className="di-badge">{detail.grade}</span> : null}
                        {detail ? (
                          <span className={`di-status ${STATUS_CLASS[detail.status] ?? ''}`}>
                            {t(`dramaIpo.status.${detail.status}`)}
                          </span>
                        ) : null}
                      </div>

                      <div className="di-meta-grid">
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.serialNo')}</div>
                          <div className="di-meta-value">{detail?.serialNo ?? '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.seriesNo')}</div>
                          <div className="di-meta-value">{detail ? `${t('dramaIpo.seriesPrefix')}-${detail.seriesNo}` : '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.genre')}</div>
                          <div className="di-meta-value">{detail?.genre || '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.totalInvest')}</div>
                          <div className="di-meta-value">
                            {detail ? `${Number(detail.totalInvestUsdt).toLocaleString()} USDT` : '--'}
                          </div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.episodes')}</div>
                          <div className="di-meta-value">
                            {detail?.totalEpisodes
                              ? `${detail.totalEpisodes} ${t('dramaIpo.episodeUnit')}${detail.runtimeMinutes ? ` · ${detail.runtimeMinutes}${t('dramaIpo.minuteUnit')}` : ''}`
                              : '--'}
                          </div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.premiere')}</div>
                          <div className="di-meta-value">{formatBeijingDate(detail?.premiereAt)}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.screenwriter')}</div>
                          <div className="di-meta-value">{detail?.crew.screenwriter || '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.director')}</div>
                          <div className="di-meta-value">{detail?.crew.director || '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.artDirector')}</div>
                          <div className="di-meta-value">{detail?.crew.artDirector || '--'}</div>
                        </div>
                        <div>
                          <div className="di-meta-label">{t('dramaIpo.producer')}</div>
                          <div className="di-meta-value">{detail?.crew.producer || '--'}</div>
                        </div>
                      </div>

                      {detail && detail.platforms.length > 0 ? (
                        <div className="di-platforms">
                          {detail.platforms.map((pf) => (
                            <span key={pf.id} className="di-platform">
                              {pf.logoUrl ? <img src={pf.logoUrl} alt="" /> : null}
                              {pf.name}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="di-progress-wrap">
                        <div className="di-progress-head">
                          <span>{t('dramaIpo.soldProgress')}</span>
                          <span>
                            {detail?.soldShares ?? 0} / {detail?.totalShares ?? 0} {t('dramaIpo.shareUnit')}
                            <span className="di-hl">　{t('dramaIpo.remaining')} {remaining}</span>
                          </span>
                        </div>
                        <div className="di-progress-bar">
                          <div className="di-progress-fill" style={{ width: `${soldPercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {detail?.synopsisHtml ? (
                  <section className="di-card">
                    <h3 className="di-card-title">{t('dramaIpo.synopsis')}</h3>
                    <div className="di-synopsis" dangerouslySetInnerHTML={{ __html: detail.synopsisHtml }} />
                  </section>
                ) : null}

                <section className="di-card">
                  <h3 className="di-card-title">{t('dramaIpo.rulesTitle')}</h3>
                  <div className="di-synopsis">
                    <p>{t('dramaIpo.rule1', { price: sharePrice })}</p>
                    <p>{t('dramaIpo.rule2', {
                      rate: Math.round((config?.airdropBaseRate ?? 0.33) * 100),
                      multiplier: config?.multiplier ?? 3,
                      days: config?.releaseDays ?? 300,
                    })}</p>
                    <p>{t('dramaIpo.rule3', {
                      days: (config?.principalReturnMonths ?? [2, 3]).map((m) => m * 30).join('、'),
                      rate: Math.round((config?.principalReturnRate ?? 0.5) * 100),
                    })}</p>
                    <p>{t('dramaIpo.rule4', {
                      month: config?.dividendFirstMonth ?? 4,
                      periods: config?.dividendPeriods ?? 10,
                      rate: Math.round((config?.dividendRate ?? 0.4) * 100),
                    })}</p>
                    <p>{t('dramaIpo.rule5')}</p>
                  </div>
                </section>
              </div>

              {/* ---------------- 右侧：参与表单 ---------------- */}
              <section className="di-card">
                <h3 className="di-card-title">{t('dramaIpo.formTitle')}</h3>

                {detail?.status === 'PENDING' && countdownMs > 0 ? (
                  <div className="di-countdown">
                    {t('dramaIpo.opensIn')} {formatCountdown(countdownMs)}
                  </div>
                ) : null}

                <div className="di-field">
                  <label className="di-field-label">{t('dramaIpo.sharesLabel')}</label>
                  <div className="di-share-input">
                    <button
                      type="button"
                      className="di-step-btn"
                      onClick={() => adjustShares(-1)}
                      disabled={shareCount <= 1}
                    >
                      −
                    </button>
                    <input
                      className="di-share-field"
                      type="number"
                      min={1}
                      max={remaining || undefined}
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                    />
                    <button
                      type="button"
                      className="di-step-btn"
                      onClick={() => adjustShares(1)}
                      disabled={shareCount >= remaining}
                    >
                      +
                    </button>
                    <span className="di-share-unit">{t('dramaIpo.shareUnit')}</span>
                  </div>
                  <div className="di-quick">
                    {[1, 5, 10].map((n) => (
                      <button key={n} type="button" onClick={() => setShares(String(Math.min(n, remaining || n)))}>
                        {n} {t('dramaIpo.shareUnit')}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShares(String(Math.max(1, remaining)))}
                      disabled={remaining <= 0}
                    >
                      {t('dramaIpo.maxShares')}
                    </button>
                  </div>
                </div>

                <div className="di-info-box">
                  <div className="di-line">
                    <span>{t('dramaIpo.sharePrice')}</span>
                    <span className="di-hl">{sharePrice} USDT</span>
                  </div>
                  <div className="di-line">
                    <span>{t('dramaIpo.payAmount')}</span>
                    <span className="di-hl">{calc.amount.toFixed(2)} USDT</span>
                  </div>
                  <div className="di-line">
                    <span>{t('dramaIpo.peakPrice')}</span>
                    <span className="di-hl">{peakPrice > 0 ? peakPrice.toFixed(4) : '--'} USDT</span>
                  </div>
                  <div className="di-line">
                    <span>{t('dramaIpo.remaining')}</span>
                    <span className="di-hl">{remaining} {t('dramaIpo.shareUnit')}</span>
                  </div>
                </div>

                <div className="di-earn-card">
                  <h4 className="di-earn-title">{t('dramaIpo.estimateTitle')}</h4>
                  <div className="di-line">
                    <span className="di-line-strong">{t('dramaIpo.airdropTotal')}</span>
                    <span className="di-hl">{calc.airdropTotal.toFixed(2)} PEAK</span>
                  </div>
                  <div className="di-sub-note">
                    {t('dramaIpo.airdropFormula', {
                      base: calc.airdropBaseUsdt.toFixed(2),
                      rate: Math.round((config?.airdropBaseRate ?? 0.33) * 100),
                      multiplier: config?.multiplier ?? 3,
                    })}
                  </div>
                  <div className="di-line">
                    <span>{t('dramaIpo.airdropDaily')}</span>
                    <span className="di-hl">{calc.airdropDaily.toFixed(4)} PEAK × {calc.releaseDays} {t('dramaIpo.dayUnit')}</span>
                  </div>

                  <hr className="di-divider" />

                  <div className="di-line">
                    <span className="di-line-strong">{t('dramaIpo.principalReturn')}</span>
                    <span className="di-hl">{calc.amount.toFixed(2)} USDT</span>
                  </div>
                  <div className="di-sub-note">
                    {t('dramaIpo.principalDetail', {
                      months: calc.principalMonths.join('、'),
                      amount: calc.principalPerMonth.toFixed(2),
                    })}
                  </div>

                  <hr className="di-divider" />

                  <div className="di-line">
                    <span className="di-line-strong">{t('dramaIpo.dividend')}</span>
                    <span className="di-hl">{t('dramaIpo.dividendByShares')}</span>
                  </div>
                  <div className="di-sub-note">
                    {t('dramaIpo.dividendDetail', {
                      month: calc.dividendFirstMonth,
                      periods: calc.dividendPeriods,
                      rate: Math.round(calc.dividendRate * 100),
                      shares: shareCount,
                    })}
                  </div>
                </div>

                <label className="di-agree">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span>
                    {t('dramaIpo.agreePrefix')}
                    <button type="button" className="di-agree-link" onClick={openAgreement}>
                      {t('dramaIpo.noticeName')}
                    </button>
                  </span>
                </label>

                <div className="di-sign-note">{t('dramaIpo.signAfterPayNote')}</div>

                <button
                  type="button"
                  className="di-submit"
                  onClick={handleSubscribe}
                  disabled={!canSubscribe || submitting || !agreed || shareCount <= 0}
                >
                  {submitting
                    ? t('dramaIpo.submitting')
                    : detail?.status === 'PENDING'
                      ? t('dramaIpo.notOpenYet')
                      : detail?.status === 'SOLD_OUT'
                        ? t('dramaIpo.status.SOLD_OUT')
                        : detail?.status === 'CLOSED'
                          ? t('dramaIpo.status.CLOSED')
                          : t('dramaIpo.confirmSubscribe')}
                </button>

                {tip ? <div className="di-tip success">{tip}</div> : null}
              </section>
            </div>
          </>
        )}

        {/* ---------------- 我的认购：本金返还进度与提现入口 ---------------- */}
        {mySubs.length > 0 && (
          <section className="di-card">
            <h3 className="di-card-title">{t('dramaIpo.mySubs')}</h3>
            <div className="di-record-list">
              {mySubs.map((s) => {
                // 订单卡片上展示该剧目当前的认购进度（按编号关联剧目）
                const subProject = projects.find((p) => p.serialNo === s.serialNo)
                return (
                <div key={s.id} className="di-record-card">
                  <div className="di-record-head">
                    <span className="di-record-title">{s.serialNo} · {s.projectName}</span>
                    <span className="di-record-time">
                      {s.shares} {t('dramaIpo.shareUnit')} · {Number(s.amountUsdt).toLocaleString()} USDT
                    </span>
                    {s.contractSigned ? (
                      <button
                        type="button"
                        className="di-contract-btn"
                        disabled={downloadingSub === s.id}
                        onClick={() => handleDownloadContract(s)}
                      >
                        {downloadingSub === s.id ? t('dramaIpo.downloading') : t('dramaIpo.downloadContract')}
                      </button>
                    ) : null}
                  </div>
                  {subProject ? (
                    <div className="di-record-progress">{renderTabProgress(subProject)}</div>
                  ) : null}
                  <div className="di-principal-rows">
                    {s.principalReturns.map((p) => {
                      const isPaid = p.status === 'PAID'
                      const isDue = new Date(p.dueDate).getTime() <= nowTick
                      return (
                        <div key={p.monthNo} className="di-principal-row">
                          <span className="di-pr-name">
                            {t('dramaIpo.principalOfMonth', { n: p.monthNo })}
                          </span>
                          <b className="di-pr-amount">{Number(p.amountUsdt).toFixed(2)} USDT</b>
                          {isPaid ? (
                            <span className="di-pr-tag paid">{t('dramaIpo.principalPaid')}</span>
                          ) : isDue ? (
                            <span className="di-pr-tag crediting">{t('dramaIpo.principalCrediting')}</span>
                          ) : (
                            <span className="di-pr-tag">
                              {t('dramaIpo.principalDueOn', { date: formatBeijingDate(p.dueDate) })}
                            </span>
                          )}
                          {/* 提现按钮常驻：未到期置灰，到期（或已入账）可点 */}
                          <button
                            type="button"
                            className="di-withdraw-btn"
                            disabled={!isPaid && !isDue}
                            onClick={() => navigate('/account/withdrawal')}
                          >
                            {t('dramaIpo.goWithdraw')}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* 一人可能同时买了多部剧：签完一份自动接上下一份，不用回到列表反复点 */}
      <ContractSignModal
        open={!!signTarget}
        target={signTarget}
        onClose={() => {
          // 不签署直接关闭也整页刷新，保证界面数据全量更新
          setSignTarget(null)
          window.location.reload()
        }}
        onSigned={async () => {
          const rest = await loadPending()
          const next = rest.find((p) => p.subscriptionId !== signTarget?.subscriptionId)
          setSignTarget(next ?? null)
          // 签署流程全部结束时整页刷新
          if (!next) window.location.reload()
        }}
      />

      {agreementOpen ? (
        <div className="di-modal-mask" onClick={() => setAgreementOpen(false)}>
          <div className="di-modal" onClick={(e) => e.stopPropagation()}>
            <div className="di-modal-head">
              <span className="di-modal-title">{t('dramaIpo.noticeName')}</span>
              <button type="button" className="di-modal-close" onClick={() => setAgreementOpen(false)}>×</button>
            </div>
            <div className="di-modal-body">
              {agreementLoading
                ? t('dramaIpo.loading')
                : agreementHtml
                  ? <div dangerouslySetInnerHTML={{ __html: agreementHtml }} />
                  : t('dramaIpo.agreementLoadFail')}
            </div>
            <div className="di-modal-foot">
              <button
                type="button"
                className="di-submit"
                onClick={() => { setAgreed(true); setAgreementOpen(false) }}
              >
                {t('dramaIpo.agreeAndClose')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

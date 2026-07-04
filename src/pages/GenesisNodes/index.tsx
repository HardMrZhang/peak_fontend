import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, Pagination, Spin, Tooltip, DatePicker, message } from 'antd'
import { InboxOutlined, CopyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import {
  getGenesisVipLevel,
  getGenesisVipTeamDetail,
  getGenesisRecentPerformance,
  getGenesisOrders,
} from '@/api'
import type { GenesisVipTeamDetail, GenesisRecentPerformance } from '@/api'
import type { GenesisOrder, PageResult } from '@/types'
import './index.css'

export default function GenesisNodes() {
  const { t } = useTranslation()

  const [vipLevel, setVipLevel] = useState(0)
  const [vipLabel, setVipLabel] = useState('T0')
  const [orderData, setOrderData] = useState<PageResult<GenesisOrder> | null>(null)
  const [orderPage, setOrderPage] = useState(1)
  const [orderLoading, setOrderLoading] = useState(false)
  const orderPageSize = 10

  const [teamDetail, setTeamDetail] = useState<GenesisVipTeamDetail | null>(null)
  const [teamDetailLoading, setTeamDetailLoading] = useState(false)
  const teamDetailLoaded = useRef(false)

  const [recentPerf, setRecentPerf] = useState<GenesisRecentPerformance | null>(null)
  const [recentPerfLoading, setRecentPerfLoading] = useState(false)

  const [customRange, setCustomRange] = useState<[string, string] | null>(null)
  const [customPerf, setCustomPerf] = useState<{ usdt: string; peak: string } | null>(null)
  const [customLoading, setCustomLoading] = useState(false)

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

  const refreshVip = useCallback(async () => {
    const token = localStorage.getItem('peak_token')
    if (!token) return
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
  }, [])

  const fetchRecentPerf = useCallback(async () => {
    const token = localStorage.getItem('peak_token')
    if (!token) return
    setRecentPerfLoading(true)
    try {
      const res = await getGenesisRecentPerformance()
      if (res.data) setRecentPerf(res.data)
    } catch {
      /* recent performance not available yet */
    } finally {
      setRecentPerfLoading(false)
    }
  }, [])

  // 只允许查询最近 30 天（数据可查范围），该窗口天然把任意区间限制在最长 30 天内
  const disabledDate = useCallback((current: Dayjs) => {
    if (!current) return false
    const earliest = dayjs().subtract(30, 'day').startOf('day')
    return current.isAfter(dayjs().endOf('day')) || current.isBefore(earliest)
  }, [])

  const handleRangeChange = useCallback((vals: (Dayjs | null)[] | null) => {
    const start = vals?.[0]
    const end = vals?.[1]
    if (!start || !end) {
      setCustomRange(null)
      setCustomPerf(null)
      return
    }
    const startStr = start.format('YYYY-MM-DD')
    const endStr = end.format('YYYY-MM-DD')
    setCustomRange([startStr, endStr])
    setCustomLoading(true)
    getGenesisRecentPerformance({ start: startStr, end: endStr })
      .then((r) => {
        if (r.data?.custom) {
          setCustomPerf({ usdt: r.data.custom.usdt, peak: r.data.custom.peak })
        }
      })
      .catch(() => {})
      .finally(() => setCustomLoading(false))
  }, [])

  const copyAddress = useCallback(async (addr?: string) => {
    if (!addr) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(addr)
        message.success(t('genesis.addrCopied'))
        return
      }
    } catch {
      // clipboard API failed, fall through to legacy
    }
    try {
      const textarea = document.createElement('textarea')
      textarea.value = addr
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.setSelectionRange(0, addr.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      message[ok ? 'success' : 'error'](t(ok ? 'genesis.addrCopied' : 'genesis.addrCopyFail'))
    } catch {
      message.error(t('genesis.addrCopyFail'))
    }
  }, [t])

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
    refreshVip()
  }, [refreshVip])

  useEffect(() => {
    fetchRecentPerf()
  }, [fetchRecentPerf])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const periodLabels: Record<string, string> = {
    today: t('genesis.periodToday'),
    d3: t('genesis.periodD3'),
    d7: t('genesis.periodD7'),
    d15: t('genesis.periodD15'),
    d30: t('genesis.periodD30'),
  }

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
                            <div className="vip-tooltip-list">
                              {teamDetail.directs.map((d, i) => (
                                <div className="vip-tooltip-branch" key={d.address || i}>
                                  <div className="vip-tooltip-row">
                                    {d.address ? (
                                      <span
                                        className="vip-tooltip-addr"
                                        role="button"
                                        title={d.address}
                                        onClick={() => copyAddress(d.address)}
                                      >
                                        {`${d.address.slice(0, 6)}...${d.address.slice(-6)}`}
                                        <CopyOutlined className="vip-tooltip-copy" />
                                      </span>
                                    ) : (
                                      <span className="vip-tooltip-addr">--</span>
                                    )}
                                    <span className="vip-tooltip-amount">{d.totalAmountUsdt} USDT</span>
                                  </div>
                                  <div className="vip-tooltip-breakdown">
                                    ( {d.usdtAmount} USDT / {d.peakAmount} PEAK )
                                  </div>
                                </div>
                              ))}
                            </div>
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

        {/* Recent Performance */}
        <div className="genesis-perf-section">
          <h2 className="genesis-section-title">
            <span className="accent-dot" />
            {t('genesis.recentPerfTitle')}
          </h2>
          <div className="genesis-perf-toolbar">
            <span className="genesis-perf-toolbar-label">{t('genesis.recentPerfSearch')}</span>
            <DatePicker.RangePicker
              className="genesis-perf-rangepicker"
              disabledDate={disabledDate}
              onChange={handleRangeChange}
              allowClear
              placeholder={[t('genesis.perfStartDate'), t('genesis.perfEndDate')]}
            />
          </div>
          {customRange && (
            <div className="genesis-perf-custom">
              <span className="genesis-perf-custom-range">
                {customRange[0]} ~ {customRange[1]}
              </span>
              {customLoading ? (
                <Spin size="small" />
              ) : (
                <span className="genesis-perf-custom-vals">
                  <span className="genesis-perf-val usdt">
                    {customPerf?.usdt ?? '0.00'} <em>USDT</em>
                  </span>
                  <span className="genesis-perf-val peak">
                    {customPerf?.peak ?? '0.00'} <em>PEAK</em>
                  </span>
                </span>
              )}
            </div>
          )}
          <div className="genesis-perf-card">
            <div className="genesis-perf-head">
              <span className="genesis-perf-c1">{t('genesis.recentPerfPeriod')}</span>
              <span className="genesis-perf-c2">{t('genesis.recentPerfUsdt')}</span>
              <span className="genesis-perf-c3">{t('genesis.recentPerfPeak')}</span>
            </div>
            {recentPerfLoading && !recentPerf ? (
              <div className="genesis-perf-loading">
                <Spin size="small" />
              </div>
            ) : (
              (recentPerf?.windows ?? []).map((w) => (
                <div className="genesis-perf-row" key={w.key}>
                  <span className="genesis-perf-period">{periodLabels[w.key] ?? w.key}</span>
                  <span className="genesis-perf-val usdt">
                    {w.usdt} <em>USDT</em>
                  </span>
                  <span className="genesis-perf-val peak">
                    {w.peak} <em>PEAK</em>
                  </span>
                </div>
              ))
            )}
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
    </div>
  )
}

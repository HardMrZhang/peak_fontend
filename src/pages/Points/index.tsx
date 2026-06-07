import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Button, message, Spin, Modal, Input } from 'antd'
import { SwapOutlined, InboxOutlined, MailOutlined } from '@ant-design/icons'
import {
  getPointsExchangeHistory,
  submitPointsExchange,
  getPointsOverview,
  bindPointsEmail,
} from '@/api'
import type { PointsExchangeRecord, PointsOverview } from '@/types'
import logoImg from '@/assets/logo.png'
import './index.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* exchange floor: 10000 points => 200 PEAK */
const RATE_POINTS = 10000
const RATE_PEAK = 200

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

function hasAuthToken(): boolean {
  return !!localStorage.getItem('peak_token')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
  const username = profile?.username || null
  const avatarUrl = profile?.avatar || null
  const isVip = profile?.isVip === '1'
  const urlScore = profile?.score != null ? Number(profile.score) || 0 : 0
  const urlNft = profile?.nft != null ? Number(profile.nft) || 0 : 0

  const [exchanging, setExchanging] = useState(false)
  const [records, setRecords] = useState<PointsExchangeRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  // authoritative data from backend (points + email-bound status)
  const [overview, setOverview] = useState<PointsOverview | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [binding, setBinding] = useState(false)

  const authed = hasAuthToken()
  const emailBound = Boolean(overview?.emailBound)
  // prefer backend data when authenticated, fall back to URL-injected profile
  const score = overview ? overview.score : urlScore
  const nftCount = overview ? overview.nftCount : urlNft
  const available = score

  // show real values for authenticated users (backend) or when URL profile exists
  const displayReady = authed || !isGuest
  const num = (v: number) => (displayReady ? v.toLocaleString() : DASH)

  const fetchOverview = useCallback(async () => {
    if (!hasAuthToken()) {
      setOverview(null)
      return
    }
    try {
      const res = await getPointsOverview()
      setOverview(res.data ?? null)
    } catch {
      setOverview(null)
    }
  }, [])

  const fetchRecords = useCallback(async () => {
    // history requires an authenticated session; guests have nothing to show
    if (!hasAuthToken()) {
      setRecords([])
      return
    }
    setRecordsLoading(true)
    try {
      const res = await getPointsExchangeHistory({ page: 1, pageSize: 50 })
      setRecords(res.data?.list ?? [])
    } catch {
      setRecords([])
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview()
    fetchRecords()
  }, [fetchOverview, fetchRecords])

  const openBind = () => {
    setEmailInput('')
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
      setBindOpen(false)
      await fetchOverview()
    } catch {
      // request util already surfaces the server error message
    } finally {
      setBinding(false)
    }
  }

  const handleExchange = async () => {
    if (exchanging || available <= 0) return
    if (!hasAuthToken()) {
      message.error(t('points.loginRequired'))
      return
    }
    // gate: must bind email before exchanging
    if (!emailBound) {
      message.warning(t('points.emailRequired'))
      openBind()
      return
    }
    setExchanging(true)
    try {
      await submitPointsExchange(available)
      message.success(t('points.exchangeSuccess'))
      await Promise.all([fetchOverview(), fetchRecords()])
    } catch {
      // request util already surfaces the server error message
    } finally {
      setExchanging(false)
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
              <div className="pts-nft-name">{isGuest ? DASH : (username || DASH)}</div>
            </div>
          </div>

          {/* nft count */}
          <div className="pts-nft-count">
            <span className="pts-label">{t('points.nftHolding')}</span>
            <span className="pts-nft-count-val">{num(nftCount)}</span>
          </div>

          {/* rights tags */}
          <div className="pts-rights">
            <span className="pts-label">{t('points.rightsLabel')}</span>
            {!isGuest && isVip ? (
              <>
                <span className="pts-tag">{t('points.rightMultiplier')}</span>
                <span className="pts-tag">{t('points.rightWhitelist')}</span>
              </>
            ) : (
              <span className="pts-nft-count-val">{DASH}</span>
            )}
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
          {authed && (
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
          )}

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
              <span className="pts-rate-num">{RATE_PEAK}</span>
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

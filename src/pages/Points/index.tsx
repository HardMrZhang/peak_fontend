import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Button, message } from 'antd'
import { SwapOutlined, InboxOutlined } from '@ant-design/icons'
import logoImg from '@/assets/logo.png'
import './index.css'

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

interface ExchangeRecord {
  time: string
  points: number
  peak: string
}

const MOCK_RECORDS: ExchangeRecord[] = [
  { time: '2026/02/27 00:01:11', points: 234552, peak: '2.11' },
]

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
  const score = profile?.score != null ? Number(profile.score) || 0 : 0
  const nftCount = profile?.nft != null ? Number(profile.nft) || 0 : 0

  const [exchanging, setExchanging] = useState(false)

  const available = score

  const num = (v: number) => (isGuest ? DASH : v.toLocaleString())

  const handleExchange = () => {
    if (isGuest || exchanging || available <= 0) return
    setExchanging(true)
    setTimeout(() => {
      setExchanging(false)
      message.success(t('points.exchangeSuccess'))
    }, 900)
  }

  const records = isGuest ? [] : MOCK_RECORDS

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

          <Button
            className="pts-action-btn pts-exchange-btn"
            onClick={handleExchange}
            loading={exchanging}
            disabled={isGuest}
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
            {records.length > 0 ? (
              records.map((row, i) => (
                <div className="pts-trow" key={i}>
                  <span className="pts-td-time">{row.time}</span>
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
    </div>
  )
}

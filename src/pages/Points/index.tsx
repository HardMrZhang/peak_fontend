import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { POINTS_EXCHANGE_DATE, POINTS_EXCHANGE_DATE_DISPLAY } from '@/constants'
import logoImg from '@/assets/logo.png'
import './index.css'

const TARGET_DATE = new Date(POINTS_EXCHANGE_DATE)

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calcTimeLeft(): TimeLeft {
  const diff = TARGET_DATE.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

const MOCK_HISTORY = [
  { date: '2026/3/16', points: '12340 积分', peak: '123.40 PEAK', status: 'pending' },
  { date: '2026/3/15', points: '234560 积分', peak: '2345.60 PEAK', status: 'pending' },
  { date: '2026/3/14', points: '456 积分', peak: '4.56 PEAK', status: 'done' },
]

export default function Points() {
  const { t } = useTranslation()
  const [timeLeft, setTimeLeft] = useState(calcTimeLeft)
  const [flip, setFlip] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft())
      setFlip(true)
      setTimeout(() => setFlip(false), 600)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const pad = (n: number) => String(n).padStart(2, '0')

  const units = [
    { value: pad(timeLeft.days), label: t('points.days') },
    { value: pad(timeLeft.hours), label: t('points.hours') },
    { value: pad(timeLeft.minutes), label: t('points.minutes') },
    { value: pad(timeLeft.seconds), label: t('points.seconds') },
  ]

  return (
    <div className="pts-page">
      {/* Preview card (static mockup) */}
      <div className="pts-preview-wrap">
        <div className="pts-preview-card">
          <div className="pts-preview-top">
            <div className="pts-preview-left">
              <span className="pts-preview-label">{t('points.unredeemed')}</span>
              <div className="pts-preview-amount">246,900 <span className="pts-preview-unit">{t('points.pointsUnit')}</span></div>
            </div>
            <div className="pts-preview-right">
              <span className="pts-preview-label">{t('points.airdropOutput')}</span>
              <div className="pts-preview-sub">{t('points.todayPeak')} 0.1 USDT</div>
              <div className="pts-preview-peak">
                <img src={logoImg} alt="" className="pts-mini-logo" />
                <span className="pts-peak-val">2,469.00</span>
                <span className="pts-refresh">&#x21BB;</span>
              </div>
              <div className="pts-preview-usd">&asymp; 246.9 USD</div>
            </div>
          </div>

          <div className="pts-preview-rules">
            <div className="pts-rules-title">{t('points.exchangeRules')}</div>
            <div className="pts-rules-list">
              <p>{t('points.rule1')}</p>
              <p>{t('points.rule2')}</p>
              <p>{t('points.rule3')}</p>
              <p>{t('points.rule4')}</p>
            </div>
          </div>

          <div className="pts-preview-table">
            <div className="pts-table-header">
              <span>{t('points.colTime')}</span>
              <span>{t('points.colDailyPoints')}</span>
              <span>{t('points.colRedeemable')}</span>
              <span></span>
            </div>
            {MOCK_HISTORY.map((row, i) => (
              <div className="pts-table-row" key={i}>
                <span>{row.date}</span>
                <span>{row.points}</span>
                <span>{row.peak}</span>
                <span className={`pts-status ${row.status}`}>
                  {row.status === 'done' ? t('points.statusDone') : t('points.statusPending')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Countdown section */}
      <div className="pts-countdown-section">
        <img src={logoImg} alt="Peak" className="pts-logo" />
        <h1 className="pts-title">{t('points.title')}</h1>
        <p className="pts-subtitle">{t('points.subtitle')}</p>

        <div className="pts-countdown">
          {units.map((unit, i) => (
            <div key={i} className="pts-unit">
              <div className={`pts-card ${flip && i === 3 ? 'pts-flip' : ''}`}>
                <span className="pts-value">{unit.value}</span>
              </div>
              <span className="pts-label">{unit.label}</span>
              {i < 3 && <span className="pts-separator">:</span>}
            </div>
          ))}
        </div>

        <div className="pts-date">
          <span className="pts-date-icon">&#x1F4C5;</span>
          <span>{POINTS_EXCHANGE_DATE_DISPLAY}</span>
        </div>

        <p className="pts-desc">{t('points.desc')}</p>

        <div className="pts-notice-list">
          <p>{t('points.notice1')}</p>
          <p>{t('points.notice2')}</p>
          <p>{t('points.notice3')}</p>
          <p>{t('points.notice4')}</p>
        </div>
      </div>
    </div>
  )
}

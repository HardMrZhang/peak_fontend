import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { NODE_TRADE_DATE, NODE_TRADE_DATE_DISPLAY } from '@/constants'
import logoImg from '@/assets/logo.png'
import './index.css'

const TARGET_DATE = new Date(NODE_TRADE_DATE)

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

export default function NodeTransaction() {
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
    { value: pad(timeLeft.days), label: t('nodeTransaction.days') },
    { value: pad(timeLeft.hours), label: t('nodeTransaction.hours') },
    { value: pad(timeLeft.minutes), label: t('nodeTransaction.minutes') },
    { value: pad(timeLeft.seconds), label: t('nodeTransaction.seconds') },
  ]

  return (
    <div className="nt-page">
      <div className="nt-bg-glow" />
      <div className="nt-bg-glow2" />

      <div className="nt-content">
        <img src={logoImg} alt="Peak" className="nt-logo" />
        <h1 className="nt-title">{t('nodeTransaction.title')}</h1>
        <p className="nt-subtitle">{t('nodeTransaction.subtitle')}</p>

        <div className="nt-countdown">
          {units.map((unit, i) => (
            <div key={i} className="nt-unit">
              <div className={`nt-card ${flip && i === 3 ? 'nt-flip' : ''}`}>
                <span className="nt-value">{unit.value}</span>
              </div>
              <span className="nt-label">{unit.label}</span>
              {i < 3 && <span className="nt-separator">:</span>}
            </div>
          ))}
        </div>

        <div className="nt-date">
          <span className="nt-date-icon">📅</span>
          <span>{NODE_TRADE_DATE_DISPLAY}</span>
        </div>

        <p className="nt-desc">{t('nodeTransaction.desc')}</p>
        <p className="nt-warning">{t('nodeTransaction.rewardNotice')}</p>
        <p className="nt-warning">{t('nodeTransaction.transferNotice')}</p>
      </div>
    </div>
  )
}

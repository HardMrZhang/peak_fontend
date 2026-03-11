import { useState, useEffect } from 'react'
import './index.css'

interface CountdownTimerProps {
  targetDate: string | Date
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calcTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(new Date(targetDate)))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft(new Date(targetDate)))
    }, 1000)
    return () => clearInterval(timer)
  }, [targetDate])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="countdown">
      <span className="countdown-value">{pad(timeLeft.days)}</span>
      <span className="countdown-label">D</span>
      <span className="countdown-value">{pad(timeLeft.hours)}</span>
      <span className="countdown-label">H</span>
      <span className="countdown-value">{pad(timeLeft.minutes)}</span>
      <span className="countdown-label">M</span>
      <span className="countdown-value">{pad(timeLeft.seconds)}</span>
      <span className="countdown-label">S</span>
    </div>
  )
}

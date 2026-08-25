import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import './index.css'

export default function AnnouncementModal() {
  const { t } = useTranslation()
  // 每次刷新页面都弹一次，关闭后本次不再弹（不做持久化记忆）
  const [open, setOpen] = useState(true)

  const close = () => setOpen(false)

  if (!open) return null

  return (
    <div className="ann-mask" onClick={close}>
      <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ann-badge">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Zm14.5 2a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 17.5 12Zm-2.5-8v2.06a7 7 0 0 1 0 11.88V20a9 9 0 0 0 0-16Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h2 className="ann-title">{t('announcement.title')}</h2>
        <div className="ann-divider" />
        <p className="ann-greeting">{t('announcement.greeting')}</p>
        <p className="ann-body">{t('announcement.body')}</p>
        <button type="button" className="ann-btn" onClick={close}>
          {t('announcement.ok')}
        </button>
      </div>
    </div>
  )
}

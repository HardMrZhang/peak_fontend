import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './index.css'

// 公告版本号：内容更新时递增，让看过旧公告的用户重新弹出
const ANNOUNCEMENT_ID = 'drama-ipo-notice-20260826'
const STORAGE_KEY = 'peak_announcement_seen'

export default function AnnouncementModal() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // 每次会话首次进站弹一次；关闭后本会话内不再弹
    if (sessionStorage.getItem(STORAGE_KEY) !== ANNOUNCEMENT_ID) {
      setOpen(true)
    }
  }, [])

  const close = () => {
    sessionStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_ID)
    setOpen(false)
  }

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
        <p className="ann-body">{t('announcement.body')}</p>
        <button type="button" className="ann-btn" onClick={close}>
          {t('announcement.ok')}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Dropdown, Modal } from 'antd'
import type { MenuProps } from 'antd'
import { GlobalOutlined, MenuOutlined, CloseOutlined, NotificationOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import WalletButton from '@/components/WalletButton'
import { useAuth } from '@/hooks/useAuth'
import { getNotices } from '@/api'
import type { Notice } from '@/types'
import logoImg from '@/assets/logo.png'
import './index.css'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const [noticeLoading, setNoticeLoading] = useState(true)
  const [noticeIndex, setNoticeIndex] = useState(0)
  const [detailNotice, setDetailNotice] = useState<Notice | null>(null)

  const navItems = [
    { key: '/account', label: t('nav.account') },
    { key: '/generalization', label: t('nav.generalization') },
    { key: '/nodes', label: t('nav.filmNodes') },
    { key: '/genesis-nodes', label: t('nav.genesisNodes') },
    { key: '/points', label: t('nav.points') },
    { key: '/airdrop', label: t('nav.airdrop') },
    { key: '/staking', label: t('nav.staking') },
    { key: '/dividend', label: t('nav.dividend') },
    { key: '/download', label: t('nav.download') },
  ]

  const currentLang = i18n.language === 'zh' ? '中文' : 'EN'
  const langCode = useMemo(() => {
    const lang = String(i18n.language || '').toLowerCase()
    return lang.startsWith('zh') ? 'zh-CN' : 'en'
  }, [i18n.language])

  const langItems: MenuProps['items'] = [
    {
      key: 'en',
      label: 'English',
      onClick: () => {
        i18n.changeLanguage('en')
        localStorage.setItem('lang', 'en')
      },
    },
    {
      key: 'zh',
      label: '中文',
      onClick: () => {
        i18n.changeLanguage('zh')
        localStorage.setItem('lang', 'zh')
      },
    },
  ]

  const isActive = (key: string) => location.pathname.startsWith(key)

  const handleNav = (key: string) => {
    navigate(key)
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    let active = true
    setNoticeLoading(true)
    getNotices(langCode)
      .then((res) => {
        if (!active) return
        const list = (res.data || []).filter(
          (item) => !!String(item.title || '').trim() || !!String(item.contentHtml || '').trim(),
        )
        setNotices(list)
        setNoticeIndex(0)
      })
      .catch(() => {
        if (!active) return
        setNotices([])
        setNoticeIndex(0)
      })
      .finally(() => {
        if (!active) return
        setNoticeLoading(false)
      })
    return () => {
      active = false
    }
  }, [langCode])

  useEffect(() => {
    if (notices.length <= 1) return undefined
    const timer = window.setInterval(() => {
      setNoticeIndex((prev) => (prev + 1) % notices.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [notices])

  const currentNotice = notices[noticeIndex] || null
  const emptyNoticeText = langCode === 'zh-CN' ? '暂无公告' : 'No announcements'
  const loadingNoticeText = langCode === 'zh-CN' ? '公告加载中...' : 'Loading announcements...'

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-left">
          <img
            src={logoImg}
            alt="Peak"
            className="header-logo"
            onClick={() => handleNav('/nodes')}
          />
          <nav className="header-nav">
            {navItems.map((item) => (
              <span
                key={item.key}
                className={`nav-item ${isActive(item.key) ? 'active' : ''}`}
                onClick={() => navigate(item.key)}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <Dropdown menu={{ items: langItems }} placement="bottomRight">
            <span className="lang-btn">
              <GlobalOutlined /> {currentLang}
            </span>
          </Dropdown>

          <WalletButton />

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <CloseOutlined /> : <MenuOutlined />}
          </button>
        </div>
      </div>

      <div className="header-notice-bar">
        <span className="notice-prefix">
          <NotificationOutlined />
          <span>{langCode === 'zh-CN' ? '公告' : 'Notice'}</span>
        </span>
        {currentNotice ? (
          <span
            className="notice-link"
            title={currentNotice.title || ''}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (currentNotice.contentHtml) setDetailNotice(currentNotice)
              else if (currentNotice.targetUrl) window.open(currentNotice.targetUrl, '_blank', 'noopener')
            }}
          >
            {currentNotice.contentHtml ? (
              <span
                className="notice-html-inline"
                dangerouslySetInnerHTML={{ __html: currentNotice.contentHtml }}
              />
            ) : (
              currentNotice.title || '-'
            )}
          </span>
        ) : (
          <span className="notice-empty">{noticeLoading ? loadingNoticeText : emptyNoticeText}</span>
        )}
      </div>

      <Modal
        open={!!detailNotice}
        title={detailNotice?.title || (langCode === 'zh-CN' ? '公告' : 'Notice')}
        footer={null}
        onCancel={() => setDetailNotice(null)}
        width={640}
      >
        {detailNotice?.contentHtml ? (
          <div
            className="notice-detail-content"
            dangerouslySetInnerHTML={{ __html: detailNotice.contentHtml }}
          />
        ) : null}
        {detailNotice?.targetUrl ? (
          <div style={{ marginTop: 16 }}>
            <a href={detailNotice.targetUrl} target="_blank" rel="noreferrer">
              {langCode === 'zh-CN' ? '查看详情' : 'View details'}
            </a>
          </div>
        ) : null}
      </Modal>

      {mobileMenuOpen && (
        <div className="mobile-menu">
          <nav className="mobile-nav">
            {navItems.map((item) => (
              <span
                key={item.key}
                className={`mobile-nav-item ${isActive(item.key) ? 'active' : ''}`}
                onClick={() => handleNav(item.key)}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

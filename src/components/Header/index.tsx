import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { GlobalOutlined, MenuOutlined, CloseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import WalletButton from '@/components/WalletButton'
import { useAuth } from '@/hooks/useAuth'
import logoImg from '@/assets/logo.png'
import './index.css'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { key: '/films', label: t('nav.films') },
    { key: '/account', label: t('nav.account') },
    { key: '/generalization', label: t('nav.generalization') },
    { key: '/nodes', label: t('nav.nodes') },
    { key: '/node-transaction', label: t('nav.nodeTransaction') },
    // { key: '/team-level', label: t('nav.teamLevel') },
  ]

  const currentLang = i18n.language === 'zh' ? '中文' : 'EN'

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

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-left">
          <img
            src={logoImg}
            alt="Peak"
            className="header-logo"
            onClick={() => handleNav('/films')}
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

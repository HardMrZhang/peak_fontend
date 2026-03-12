import { useState, useCallback, useRef, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useTranslation } from 'react-i18next'
import { useAutoConnectWallet } from '@/hooks/useAutoConnectWallet'
import './index.css'

interface WalletOption {
  name: string
  icon: string
  deepLink: (url: string) => string
}

function getOSType(): 'ios' | 'android' | 'other' {
  if (typeof window === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod|ios/i.test(ua)) return 'ios'
  if (/android|XiaoMi|MiuiBrowser/i.test(ua)) return 'android'
  return 'other'
}

function buildOkxDeepLink(url: string): string {
  const encodedDappUrl = encodeURIComponent(url)
  const schemeLink = `okx://wallet/dapp/url?dappUrl=${encodedDappUrl}`
  const os = getOSType()

  if (os === 'android') {
    return schemeLink
  }
  return `https://www.okx.com/download?deeplink=${encodeURIComponent(schemeLink)}`
}

const MOBILE_WALLETS: WalletOption[] = [
  {
    name: 'OKX Wallet',
    icon: 'https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png',
    deepLink: buildOkxDeepLink,
  },
  {
    name: 'Binance Web3',
    icon: 'https://public.bnbstatic.com/static/images/common/favicon.ico',
    deepLink: (url) => `bnc://app.binance.com/cedefi/web3/browser?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Phantom',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/phantom/icon.svg',
    deepLink: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}`,
  },
  {
    name: 'Solflare',
    icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/solflare/icon.svg',
    deepLink: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}`,
  },
  {
    name: 'Bitget Wallet',
    icon: 'https://raw.githubusercontent.com/nicnocquee/wallet-adapter/master/packages/wallets/bitget/icon.svg',
    deepLink: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Trust Wallet',
    icon: 'https://raw.githubusercontent.com/nicnocquee/wallet-adapter/master/packages/wallets/trust/icon.svg',
    deepLink: (url) => `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Coinbase Wallet',
    icon: 'https://raw.githubusercontent.com/nicnocquee/wallet-adapter/master/packages/wallets/coinbase/icon.svg',
    deepLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Coin98',
    icon: 'https://raw.githubusercontent.com/nicnocquee/wallet-adapter/master/packages/wallets/coin98/icon.svg',
    deepLink: (url) => `https://coin98.com/dapp/${encodeURIComponent(url)}`,
  },
  {
    name: 'TokenPocket',
    icon: 'https://raw.githubusercontent.com/nicnocquee/wallet-adapter/master/packages/wallets/tokenpocket/icon.svg',
    deepLink: (url) => `https://tokenpocket.pro/open_url?url=${encodeURIComponent(url)}`,
  },
]

function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function isInsideWalletBrowser(): boolean {
  if (typeof window === 'undefined') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return !!(
    w.phantom?.solana ||
    w.solflare ||
    w.trustwallet?.solana ||
    w.bitkeep?.solana ||
    w.coin98?.sol ||
    w.tokenpocket?.solana ||
    w.coinbaseSolana ||
    w.okxwallet?.solana ||
    w.BinanceChain ||
    /OKApp/i.test(navigator.userAgent)
  )
}

export default function WalletButton() {
  const { connected } = useWallet()
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)

  useAutoConnectWallet()

  const showMobileModal = isMobileBrowser() && !isInsideWalletBrowser() && !connected

  const handleWalletClick = useCallback((wallet: WalletOption, e: React.MouseEvent) => {
    const currentUrl = window.location.href
    const deepLink = wallet.deepLink(currentUrl)

    if (wallet.name === 'OKX Wallet' && getOSType() === 'android') {
      e.preventDefault()
      window.location.href = deepLink
      const fallback = `https://www.okx.com/download?deeplink=${encodeURIComponent(deepLink)}`
      setTimeout(() => {
        if (!document.hidden) window.location.href = fallback
      }, 2500)
      return
    }

    if (wallet.name !== 'OKX Wallet') {
      e.preventDefault()
      window.location.href = deepLink
    }
  }, [])

  const { setVisible: setWalletModalVisible } = useWalletModal()
  const { publicKey, wallet, disconnect } = useWallet()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}..${publicKey.toBase58().slice(-4)}`
    : ''

  const handleDisconnect = useCallback(() => {
    disconnect().catch(() => {})
    setDropdownOpen(false)
  }, [disconnect])

  if (!showMobileModal) {
    if (!connected || !publicKey) {
      return (
        <div className="wallet-connect-wrapper">
          <button
            className="wallet-adapter-button wallet-adapter-button-trigger"
            onClick={() => setWalletModalVisible(true)}
          >
            {t('header.connectWallet')}
          </button>
        </div>
      )
    }

    return (
      <div className="wallet-connect-wrapper" ref={dropdownRef}>
        <button
          className="wallet-adapter-button wallet-adapter-button-trigger"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          {wallet?.adapter.icon && (
            <img src={wallet.adapter.icon} alt="" className="wallet-btn-icon" />
          )}
          {shortAddress}
        </button>
        {dropdownOpen && (
          <div className="wallet-dropdown">
            <button className="wallet-dropdown-item" onClick={handleDisconnect}>
              {t('header.disconnect')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="wallet-connect-wrapper">
        <button
          className="wallet-adapter-button wallet-adapter-button-trigger"
          onClick={() => setModalOpen(true)}
        >
          {t('wallet.selectWallet', 'Select Wallet')}
        </button>
      </div>

      {modalOpen && (
        <div
          className="mobile-wallet-overlay"
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="mobile-wallet-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              margin: 'auto',
              maxHeight: '75vh',
              overflowY: 'auto',
            }}
          >
            <div className="mobile-wallet-header">
              <span>{t('wallet.connectWallet', 'Connect Wallet')}</span>
              <button className="mobile-wallet-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="mobile-wallet-list">
              {MOBILE_WALLETS.map((wallet) => (
                <a
                  key={wallet.name}
                  className="mobile-wallet-item"
                  href={wallet.deepLink(window.location.href)}
                  onClick={(e) => handleWalletClick(wallet, e)}
                  rel="noopener noreferrer"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="mobile-wallet-icon"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <span className="mobile-wallet-name">{wallet.name}</span>
                  <span className="mobile-wallet-arrow">›</span>
                </a>
              ))}
            </div>
            <p className="mobile-wallet-hint">
              {t('wallet.mobileHint', 'Choosing a wallet will open its app to connect')}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

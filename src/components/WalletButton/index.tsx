import { useState, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useTranslation } from 'react-i18next'
import './index.css'

interface WalletOption {
  name: string
  icon: string
  deepLink: (url: string) => string
}

const MOBILE_WALLETS: WalletOption[] = [
  {
    name: 'OKX Wallet',
    icon: 'https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png',
    deepLink: (url) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
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
    w.BinanceChain
  )
}

export default function WalletButton() {
  const { connected } = useWallet()
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)

  const showMobileModal = isMobileBrowser() && !isInsideWalletBrowser() && !connected

  const handleWalletClick = useCallback((wallet: WalletOption) => {
    const currentUrl = window.location.href
    window.location.href = wallet.deepLink(currentUrl)
  }, [])

  if (!showMobileModal) {
    return (
      <div className="wallet-connect-wrapper">
        <WalletMultiButton />
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
                <button
                  key={wallet.name}
                  className="mobile-wallet-item"
                  onClick={() => handleWalletClick(wallet)}
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
                </button>
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

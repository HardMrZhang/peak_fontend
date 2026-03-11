import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TokenPocketWalletAdapter,
  TrustWalletAdapter,
  CoinbaseWalletAdapter,
  LedgerWalletAdapter,
  BitgetWalletAdapter,
  Coin98WalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import router from '@/router'
import '@solana/wallet-adapter-react-ui/styles.css'
import '@/i18n'
import './index.css'

function App() {
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'),
    [],
  )
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new TokenPocketWalletAdapter(),
    new TrustWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new LedgerWalletAdapter(),
    new BitgetWalletAdapter(),
    new Coin98WalletAdapter(),
  ], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ConfigProvider
            theme={{
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: '#f5a623',
          colorBgContainer: '#111118',
          colorBgElevated: '#111118',
          colorBorder: 'rgba(255,255,255,0.08)',
          colorText: '#f0f0f5',
          colorTextSecondary: '#8a8a9a',
          borderRadius: 10,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              },
              components: {
                Table: {
            headerBg: '#0c0c12',
            headerColor: '#8a8a9a',
            rowHoverBg: 'rgba(245, 166, 35, 0.04)',
            borderColor: 'rgba(255,255,255,0.06)',
            colorBgContainer: '#050508',
                },
                Pagination: {
                  colorBgContainer: 'transparent',
                  colorPrimary: '#f5a623',
                },
                Select: {
            colorBgContainer: '#111118',
            colorBgElevated: '#111118',
            optionActiveBg: 'rgba(245, 166, 35, 0.08)',
                },
          Input: {
            colorBgContainer: '#111118',
                  activeBorderColor: '#f5a623',
                },
          Modal: {
            contentBg: '#111118',
            headerBg: '#111118',
                },
          InputNumber: {
            colorBgContainer: '#111118',
                  activeBorderColor: '#f5a623',
                },
                Carousel: {
                  dotActiveWidth: 24,
                },
              },
            }}
          >
            <RouterProvider router={router} />
          </ConfigProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

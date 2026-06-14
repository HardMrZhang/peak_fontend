import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import type { WalletName } from '@solana/wallet-adapter-base'

interface WalletDetection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  check: (w: any) => boolean
  adapterName: string
}

const WALLET_DETECTIONS: WalletDetection[] = [
  { check: (w) => !!w.okxwallet?.solana, adapterName: 'OKX Wallet' },
  { check: (w) => !!w.BinanceChain, adapterName: 'Binance Wallet' },
  { check: (w) => !!w.phantom?.solana, adapterName: 'Phantom' },
  { check: (w) => !!w.solflare, adapterName: 'Solflare' },
  { check: (w) => !!w.bitkeep?.solana, adapterName: 'Bitget Wallet' },
  { check: (w) => !!w.trustwallet?.solana, adapterName: 'Trust' },
  { check: (w) => !!w.coinbaseSolana, adapterName: 'Coinbase Wallet' },
  { check: (w) => !!w.coin98?.sol, adapterName: 'Coin98' },
  { check: (w) => !!w.tokenpocket?.solana, adapterName: 'TokenPocket' },
]

function detectWalletBrowser(): string | null {
  if (typeof window === 'undefined') return null
  for (const d of WALLET_DETECTIONS) {
    if (d.check(window)) return d.adapterName
  }
  return null
}

export function useAutoConnectWallet() {
  const { select, connect, connected, wallets } = useWallet()
  const attempted = useRef(false)

  useEffect(() => {
    if (connected || attempted.current) return

    const detectedName = detectWalletBrowser()
    if (!detectedName) return

    const matched = wallets.find(
      (w) => w.adapter.name.toLowerCase() === detectedName.toLowerCase(),
    )
    if (!matched) return

    attempted.current = true

    const timer = setTimeout(() => {
      select(matched.adapter.name as WalletName)
      setTimeout(() => {
        connect().catch(() => {})
      }, 300)
    }, 500)

    return () => clearTimeout(timer)
  }, [connected, wallets, select, connect])
}

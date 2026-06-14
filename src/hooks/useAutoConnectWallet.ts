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

function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export function useAutoConnectWallet() {
  const { select, connect, connected, wallets } = useWallet()
  const attempted = useRef(false)

  useEffect(() => {
    if (connected || attempted.current) return

    // 仅在「移动端钱包内置浏览器」场景主动 select+connect。
    // 桌面浏览器装了 OKX/Phantom 等插件时 window.okxwallet 等同样存在，
    // 若在桌面也强制连接，会与 WalletProvider 自带的 autoConnect 抢占，
    // 使会话处于「已恢复 publicKey 但 provider 未真正授权」状态，
    // 随后自动 signMessage 触发钱包 4100（未授权）报错。桌面交由
    // autoConnect + 用户在钱包弹窗里手动连接处理。
    if (!isMobileBrowser()) return

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

import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '@solana/wallet-adapter-react'
import { message } from 'antd'
import { useAuthStore } from '@/store/useAuthStore'
import { getNonce, walletLogin, getMe, bindReferrer } from '@/api'
import bs58 from 'bs58'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'

const AUTO_CONNECT_GRACE_MS = 3000
// 钱包断连缓冲：OKX 等钱包在签名/授权期间会瞬时把 connected 抖动成 false 再恢复。
// 若立刻 logout 会把刚建立的登录态误杀（表现为「签完又退出、且无报错」），
// 故断连后延迟复查，仅当持续断开才真正登出。
const DISCONNECT_GRACE_MS = 1500

// 钱包注入 provider 抛出的错误分类（EIP-1193 标准码 + 文案兜底）：
// rejected     -> 用户主动取消签名（4001）
// unauthorized -> 会话未授权/失效（4100），需断开后重新连接授权
const WALLET_ERR_REJECTED = /user rejected|rejected the request|user denied|user cancel|cancell?ed by user|approval denied/i
const WALLET_ERR_UNAUTHORIZED = /not been authorized|not authorized|unauthorized|wallet ?not ?connected/i

function classifyWalletError(err: unknown): 'rejected' | 'unauthorized' | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as { code?: number | string; name?: string; message?: string }
  const code = typeof e.code === 'number' ? e.code : Number(e.code)
  const msg = `${e.name || ''} ${e.message || ''}`
  if (code === 4001 || WALLET_ERR_REJECTED.test(msg)) return 'rejected'
  if (code === 4100 || e.name === 'WalletNotConnectedError' || WALLET_ERR_UNAUTHORIZED.test(msg)) {
    return 'unauthorized'
  }
  return null
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export function useAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet()
  const { t } = useTranslation()
  const { token, user, loginLoading, loginFailed, setAuth, setUser, setLoginLoading, setLoginFailed, logout } = useAuthStore()
  const loginInProgress = useRef(false)
  const inviteBindInProgress = useRef(false)
  const hasBeenConnected = useRef(false)
  const mountedAt = useRef(Date.now())
  const autoLoginTried = useRef(false)
  // 最新的「钱包就绪」状态，供断连缓冲定时器在延迟后复查（闭包内拿不到最新 hook 值）
  const walletReadyRef = useRef(false)
  walletReadyRef.current = connected && !!publicKey

  useEffect(() => {
    if (connected) {
      hasBeenConnected.current = true
    } else {
      // 断开后允许下次连接重新静默尝试登录
      autoLoginTried.current = false
    }
  }, [connected])

  const doLogin = useCallback(async (silent = false) => {
    if (!publicKey || !signMessage || loginInProgress.current) return
    loginInProgress.current = true
    setLoginLoading(true)
    setLoginFailed(false)
    try {
      const address = publicKey.toBase58()
      const nonceRes = await getNonce(address)
      const nonce = nonceRes.data.nonce

      const msg = new TextEncoder().encode(`PEAK Login Nonce: ${nonce}`)
      const rawSig = await signMessage(msg)
      const sigBytes = new Uint8Array(rawSig.buffer, rawSig.byteOffset, rawSig.byteLength)
      const signature = bs58.encode(sigBytes)

      const loginRes = await walletLogin({ walletAddress: address, nonce, signature })
      setAuth(loginRes.data.token, loginRes.data.user)

      if (!loginRes.data.user.referrerUserId) {
        const pendingCode = localStorage.getItem(INVITE_CODE_STORAGE_KEY)
        if (pendingCode) {
          const code = normalizeInviteCode(pendingCode)
          if (code) {
            inviteBindInProgress.current = true
            try {
              await bindReferrer(code)
              const meRes = await getMe()
              setUser(meRes.data)
              localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
              message.success(t('referral.bindSuccess'))
            } catch {
              // Leave code in localStorage; bind effect will retry as fallback
            } finally {
              inviteBindInProgress.current = false
            }
          }
        }
      }
    } catch (err: unknown) {
      const backendMessage =
        typeof err === 'object' && err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { message?: unknown } } }).response?.data?.message === 'string'
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null
      const isLikelyAxiosError =
        typeof err === 'object' && err !== null &&
        ('response' in err || 'request' in err || 'config' in err)
      // silent=true（桌面静默自动尝试）时：不弹错、不置「失败」态，安静失败，
      // 由「签名登录」按钮手动重试；autoLoginTried ref 防止 effect 重复触发。
      if (!silent) {
        if (!isLikelyAxiosError) {
          // 钱包侧错误：不要把原始英文（如 4100 未授权）直接弹给用户。
          const walletErr = classifyWalletError(err)
          if (walletErr === 'rejected') {
            message.info(t('account.signCancelled'))
          } else if (walletErr === 'unauthorized') {
            message.error(t('account.reconnectNeeded'))
          } else {
            message.error(t('account.loginFailedRetry'))
          }
        } else if (!backendMessage) {
          message.error(t('account.loginFailedRetry'))
        }
        logout()
        setLoginFailed(true)
      }
    } finally {
      loginInProgress.current = false
      setLoginLoading(false)
    }
  }, [publicKey, signMessage, setAuth, setLoginLoading, setLoginFailed, logout, setUser, t])

  useEffect(() => {
    if (connected && publicKey) {
      // 每次钱包连接成功都允许自动重试登录
      setLoginFailed(false)
    }
  }, [connected, publicKey, setLoginFailed])

  // 桌面端：连接后静默自动尝试登录一次（失败不弹错）。多数钱包（如 Phantom）可直接成功；
  // OKX 等可能抛 4100，会安静失败，由「签名登录」按钮手动重试。
  // 移动端不自动调用 signMessage：连接后紧接着自动签名会被导航拦截而「无响应」，改为手动点击。
  useEffect(() => {
    if (isMobileBrowser()) return
    if (connected && publicKey && !token && !autoLoginTried.current && !loginLoading && !loginInProgress.current) {
      autoLoginTried.current = true
      doLogin(true)
    }
  }, [connected, publicKey, token, loginLoading, doLogin])

  // 手动签名登录：必须由用户点击（可信事件）同步触发，避免 OKX 4100 / 移动端无响应。
  // 由 WalletButton 的「签名登录」按钮、各页「重新登录」按钮派发 auth:login 事件触发。
  useEffect(() => {
    const handler = () => { doLogin(false) }
    window.addEventListener('auth:login', handler)
    return () => window.removeEventListener('auth:login', handler)
  }, [doLogin])

  useEffect(() => {
    if (token && !user) {
      getMe()
        .then((res) => setUser(res.data))
        .catch(() => logout())
    }
  }, [token, user, setUser, logout])

  // Fallback bind: handles page-refresh with existing token or if doLogin bind failed
  useEffect(() => {
    if (!token || !user || inviteBindInProgress.current) return
    if (user.referrerUserId) {
      localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
      return
    }

    const pendingCode = localStorage.getItem(INVITE_CODE_STORAGE_KEY)
    if (!pendingCode) return
    const inviteCode = normalizeInviteCode(pendingCode)
    if (!inviteCode) return

    inviteBindInProgress.current = true
    bindReferrer(inviteCode)
      .then(() => getMe())
      .then((res) => {
        setUser(res.data)
        localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
        message.success(t('referral.bindSuccess'))
      })
      .catch((err) => {
        const errCode = err?.response?.data?.code
        const errMsg = err?.response?.data?.message || ''
        if (errCode === 'REFERRER_ALREADY_BOUND') {
          localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
          message.info(t('invite.alreadyBound'))
        } else if (errMsg.includes('self')) {
          localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
          message.warning(t('invite.cannotBindSelf'))
        } else if (errCode === 'INVALID_INVITE_CODE' || errMsg.includes('Invalid invite code')) {
          localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
          message.error(t('invite.invalidCode'))
        } else {
          // Transient error: keep code in localStorage for next retry
          message.error(t('invite.bindFailed'))
        }
      })
      .finally(() => {
        inviteBindInProgress.current = false
      })
  }, [token, user, setUser])

  useEffect(() => {
    if (connected && publicKey && user && user.walletAddress !== publicKey.toBase58()) {
      // Wallet switched in extension but frontend still has old user token.
      // Force re-auth to keep balance/account data consistent with current wallet.
      logout()
      setLoginFailed(false)
      return
    }
  }, [connected, publicKey, user, logout, setLoginFailed])

  useEffect(() => {
    const walletReady = connected && !!publicKey
    if (!walletReady) {
      setLoginFailed(false)
    }
    if (!walletReady && token) {
      // 首次加载给 autoConnect 更长的缓冲窗口；之前已连过则用较短的抖动缓冲。
      // 两种情况都延迟复查，避免 OKX 瞬时断连把刚建立的登录态误杀。
      const grace = hasBeenConnected.current
        ? DISCONNECT_GRACE_MS
        : Math.max(0, AUTO_CONNECT_GRACE_MS - (Date.now() - mountedAt.current))
      const timer = setTimeout(() => {
        // 缓冲结束后钱包仍未恢复连接才真正登出
        if (!walletReadyRef.current && useAuthStore.getState().token) {
          logout()
        }
      }, grace)
      return () => clearTimeout(timer)
    }
  }, [connected, publicKey, token, logout, setLoginFailed])

  useEffect(() => {
    const handler = () => {
      logout()
      disconnect().catch(() => {})
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [logout, disconnect])

  return { token, user, connected, loginLoading, loginFailed, doLogin, logout }
}

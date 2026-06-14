import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '@solana/wallet-adapter-react'
import { message } from 'antd'
import { useAuthStore } from '@/store/useAuthStore'
import { getNonce, walletLogin, getMe, bindReferrer } from '@/api'
import bs58 from 'bs58'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'

const AUTO_CONNECT_GRACE_MS = 3000

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

export function useAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet()
  const { t } = useTranslation()
  const { token, user, loginLoading, loginFailed, setAuth, setUser, setLoginLoading, setLoginFailed, logout } = useAuthStore()
  const loginInProgress = useRef(false)
  const inviteBindInProgress = useRef(false)
  const hasBeenConnected = useRef(false)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (connected) hasBeenConnected.current = true
  }, [connected])

  const doLogin = useCallback(async () => {
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
      if (!isLikelyAxiosError) {
        // 钱包侧错误：不要把原始英文（如 4100 未授权）直接弹给用户
        const walletErr = classifyWalletError(err)
        if (walletErr === 'rejected') {
          message.info(t('account.signCancelled'))
        } else if (walletErr === 'unauthorized') {
          // 会话失效/未授权：断开钱包，让用户重新连接并在钱包内确认签名
          message.error(t('account.reconnectNeeded'))
          disconnect().catch(() => {})
        } else {
          message.error(t('account.loginFailedRetry'))
        }
      } else if (!backendMessage) {
        message.error(t('account.loginFailedRetry'))
      }
      logout()
      setLoginFailed(true)
    } finally {
      loginInProgress.current = false
      setLoginLoading(false)
    }
  }, [publicKey, signMessage, setAuth, setLoginLoading, setLoginFailed, logout, setUser, disconnect, t])

  useEffect(() => {
    if (connected && publicKey) {
      // 每次钱包连接成功都允许自动重试登录
      setLoginFailed(false)
    }
  }, [connected, publicKey, setLoginFailed])

  useEffect(() => {
    if (connected && publicKey && !token && !loginFailed && !loginLoading && !loginInProgress.current) {
      doLogin()
    }
  }, [connected, publicKey, token, loginFailed, loginLoading, doLogin])

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
    if (!walletReady && token) {
      if (hasBeenConnected.current) {
        // 真正断开（之前连过）时立即登出
        logout()
      } else {
        // 首次加载给 autoConnect 一个缓冲窗口，避免刷新即退出
        const remaining = AUTO_CONNECT_GRACE_MS - (Date.now() - mountedAt.current)
        if (remaining <= 0) {
          logout()
          return
        }
        const timer = setTimeout(() => {
          const state = useAuthStore.getState()
          if (state.token && !hasBeenConnected.current) {
            logout()
          }
        }, remaining)
        return () => clearTimeout(timer)
      }
    }
    if (!walletReady) {
      setLoginFailed(false)
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

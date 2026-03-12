import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '@solana/wallet-adapter-react'
import { message } from 'antd'
import { useAuthStore } from '@/store/useAuthStore'
import { getNonce, walletLogin, getMe, bindReferrer } from '@/api'
import bs58 from 'bs58'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'

const AUTO_CONNECT_GRACE_MS = 3000

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
      const sig = await signMessage(msg)
      const signature = bs58.encode(sig)

      const loginRes = await walletLogin({ walletAddress: address, nonce, signature })
      setAuth(loginRes.data.token, loginRes.data.user)
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
      // API errors are already toasted by request interceptor.
      // Keep this toast for wallet-level failures (e.g. user rejected signature).
      if (!isLikelyAxiosError) {
        const localMessage = err instanceof Error && err.message
          ? err.message
          : 'Wallet login failed, please reconnect and sign again'
        message.error(localMessage)
      } else if (!backendMessage) {
        message.error('Wallet login failed, please reconnect and sign again')
      }
      logout()
      setLoginFailed(true)
    } finally {
      loginInProgress.current = false
      setLoginLoading(false)
    }
  }, [publicKey, signMessage, setAuth, setLoginLoading, setLoginFailed, logout])

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
        localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
        const errCode = err?.response?.data?.code
        const errMsg = err?.response?.data?.message || ''
        if (errCode === 'REFERRER_ALREADY_BOUND') {
          message.info(t('invite.alreadyBound'))
        } else if (errMsg.includes('self')) {
          message.warning(t('invite.cannotBindSelf'))
        } else if (errCode === 'INVALID_INVITE_CODE' || errMsg.includes('Invalid invite code')) {
          message.error(t('invite.invalidCode'))
        } else {
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

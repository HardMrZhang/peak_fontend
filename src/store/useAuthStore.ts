import { create } from 'zustand'
import type { WalletUser } from '@/types'

interface AuthState {
  token: string | null
  user: WalletUser | null
  loginLoading: boolean
  loginFailed: boolean
  setAuth: (token: string, user: WalletUser) => void
  setUser: (user: WalletUser) => void
  setLoginLoading: (v: boolean) => void
  setLoginFailed: (v: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('peak_token'),
  user: null,
  loginLoading: false,
  loginFailed: false,

  setAuth: (token, user) => {
    localStorage.setItem('peak_token', token)
    set({ token, user, loginFailed: false })
  },

  setUser: (user) => set({ user }),

  setLoginLoading: (v) => set({ loginLoading: v }),
  setLoginFailed: (v) => set({ loginFailed: v }),

  logout: () => {
    localStorage.removeItem('peak_token')
    set({ token: null, user: null })
  },
}))

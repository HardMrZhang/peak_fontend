import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Input, message, Spin } from 'antd'
import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import { useWallet } from '@solana/wallet-adapter-react'
import { estimateWithdraw, submitWithdraw, getBalances } from '@/api'
import type { AssetBalance, WithdrawEstimate } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { CHAIN_NAME, DEFAULT_FEE } from '@/constants'
import './index.css'

type TokenType = 'USDT' | 'PEAK'

export default function Withdrawal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connected, publicKey } = useWallet()
  const token = useAuthStore((s) => s.token)
  const loginLoading = useAuthStore((s) => s.loginLoading)
  const loginFailed = useAuthStore((s) => s.loginFailed)
  const setLoginFailed = useAuthStore((s) => s.setLoginFailed)
  const [tokenType, setTokenType] = useState<TokenType>('USDT')
  const [amount, setAmount] = useState('')
  const [walletAddress, setWalletAddress] = useState(publicKey?.toBase58() ?? '')
  const [balances, setBalances] = useState<AssetBalance[]>([])
  const [estimate, setEstimate] = useState<WithdrawEstimate | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (publicKey && !walletAddress) {
      setWalletAddress(publicKey.toBase58())
    }
  }, [publicKey])

  useEffect(() => {
    if (!connected || !token) {
      setLoading(false)
      return
    }
    setLoading(true)
    getBalances().then((r) => setBalances(r.data)).catch(() => { }).finally(() => setLoading(false))
  }, [connected, token])

  const currentBalance = balances.find((b) => b.asset === tokenType)
  const availableStr = currentBalance ? Number(currentBalance.availableAmount).toFixed(2) : '0.00'
  const lockedStr = currentBalance ? Number(currentBalance.lockedAmount).toFixed(2) : '0.00'
  const balanceStr = availableStr

  useEffect(() => {
    if (!token || !amount || Number(amount) <= 0) {
      setEstimate(null)
      return
    }
    const timer = setTimeout(() => {
      estimateWithdraw(tokenType, Number(amount))
        .then((r) => setEstimate(r.data))
        .catch(() => setEstimate(null))
    }, 500)
    return () => clearTimeout(timer)
  }, [token, tokenType, amount])

  const handleMax = () => setAmount(balanceStr)

  const handleSubmit = async () => {
    if (!walletAddress.trim()) {
      message.warning(t('withdrawal.addrRequired'))
      return
    }
    if (!amount || Number(amount) <= 0) {
      message.warning(t('withdrawal.amountRequired'))
      return
    }
    setSubmitting(true)
    try {
      await submitWithdraw({ asset: tokenType, toAddress: walletAddress, amount: Number(amount) })
      message.success(t('withdrawal.submitSuccess'))
      setAmount('')
      setWalletAddress('')
      getBalances().then((r) => setBalances(r.data)).catch(() => { })
    } catch {
      // error handled by interceptor
    } finally {
      setSubmitting(false)
    }
  }

  const fee = parseFloat(String(estimate?.fee ?? DEFAULT_FEE)).toFixed(2)
  const actual = parseFloat(String(estimate?.actual ?? Math.max(0, Number(amount || 0) - Number(estimate?.fee ?? DEFAULT_FEE)))).toFixed(2)

  if (!connected) {
    return (
      <div className="withdrawal-page">
        <div className="withdrawal-inner">
          <div className="empty-guard">
            <ExclamationCircleOutlined className="empty-guard-icon" />
            <h3>{t('account.walletRequired')}</h3>
            <p>{t('account.walletRequiredDesc')}</p>
            <Button className="empty-guard-btn" onClick={() => navigate('/account')}>{t('account.understood')}</Button>
          </div>
        </div>
      </div>
    )
  }

  if (loginLoading) {
    return (
      <div className="withdrawal-page">
        <div className="withdrawal-inner">
          <div className="empty-guard">
            <LoadingOutlined className="empty-guard-icon" style={{ color: '#f5a623' }} />
            <h3>{t('account.loginLoading')}</h3>
            <p>{t('account.loginLoadingDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (loginFailed || !token) {
    return (
      <div className="withdrawal-page">
        <div className="withdrawal-inner">
          <div className="empty-guard">
            <ExclamationCircleOutlined className="empty-guard-icon" />
            <h3>{t('account.loginFailed')}</h3>
            <p>{t('account.loginFailedDesc')}</p>
            <Button className="empty-guard-btn" onClick={() => setLoginFailed(false)}>{t('account.retryLogin')}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="withdrawal-page">
      <div className="withdrawal-inner">
        <Spin spinning={loading}>
          <div className="breadcrumb">{t('withdrawal.breadcrumb')} <strong>{t('withdrawal.title')}</strong></div>

          <div className="form-section">
            <h3 className="section-label">{t('withdrawal.addrTitle')}</h3>
            <div className="section-content">
              <div className="chain-display">
                <span className="chain-dot solana" />
                <span className="chain-name">{CHAIN_NAME}</span>
              </div>
              <div className="address-block">
                <span className="address-label">{t('withdrawal.addressLabel')}</span>
                <Input
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="amount-input"
                  size="large"
                  placeholder={t('withdrawal.addrPlaceholder')}
                />
              </div>
              <div className="tip-box">
                ⓘ {t('withdrawal.addrTip')}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-label">{t('withdrawal.selectToken')}</h3>
            <div className="section-content">
              <div className="token-toggle">
                <span
                  className={`token-option ${tokenType === 'USDT' ? 'active' : ''}`}
                  onClick={() => { setTokenType('USDT'); setAmount(''); setEstimate(null) }}
                >
                  <span className="token-dot usdt" /> USDT
                </span>
                <span
                  className={`token-option ${tokenType === 'PEAK' ? 'active' : ''}`}
                  onClick={() => { setTokenType('PEAK'); setAmount(''); setEstimate(null) }}
                >
                  <span className="token-dot peak" /> PEAK
                </span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-label">{t('withdrawal.qtyTitle')}</h3>
            <div className="section-content">
              <div className="balance-hint">
                ⚠ {t('withdrawal.accountBalance')} <span className="orange">{availableStr} {tokenType}</span>
                {Number(lockedStr) > 0 && <span style={{ marginLeft: 12, color: '#999' }}>({t('withdrawal.locked')}: {lockedStr} {tokenType})</span>}
              </div>
              <div className="amount-wrapper">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="amount-input"
                  size="large"
                  prefix={<span className={`token-dot ${tokenType.toLowerCase()}`} />}
                />
                <button className="max-btn" onClick={handleMax}>{t('withdrawal.max')}</button>
              </div>
              <div className="commission-text">{t('withdrawal.commission')} {fee} {tokenType}</div>
              <div className="estimate-bar">
                <span className="estimate-label">{t('withdrawal.estimatedArrival')}</span>
                <span>{actual} {tokenType}</span>
              </div>
            </div>
          </div>

          <Button className="submit-btn" block onClick={handleSubmit} loading={submitting}>{t('withdrawal.submitBtn')}</Button>
        </Spin>
      </div>
    </div>
  )
}

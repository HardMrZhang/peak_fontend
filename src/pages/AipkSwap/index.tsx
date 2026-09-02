import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Input, message, Spin, Tag } from 'antd'
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  getAipkSwapInfo,
  getAipkSwapQuote,
  createAipkSwapParams,
  confirmAipkSwap,
  getAipkSwapRequests,
} from '@/api'
import type { AipkSwapInfo, AipkSwapQuote, AipkSwapRequest, AipkSwapStatus } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import './index.css'

const STATUS_COLOR: Record<AipkSwapStatus, string> = {
  PENDING_TX: 'default',
  PENDING_REVIEW: 'gold',
  APPROVED: 'blue',
  SUCCESS: 'green',
  REJECTED: 'red',
  EXPIRED: 'default',
}

function shortHash(h?: string | null) {
  return h ? `${h.slice(0, 6)}…${h.slice(-6)}` : '-'
}

/**
 * Aipk（钱包内）→ USDT 站内兑换：
 *   输入数量 → 钱包签名把 Aipk 转到平台收款地址 → 后端验链落单 → 后台审核 → USDT 打回钱包
 */
export default function AipkSwap() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connected } = useWallet()
  const token = useAuthStore((s) => s.token)
  const { sendDappIx } = useDappTx()

  const [info, setInfo] = useState<AipkSwapInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<AipkSwapQuote | null>(null)
  const [quoteErr, setQuoteErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<AipkSwapRequest[]>([])

  const load = useCallback(async () => {
    if (!connected || !token) { setLoading(false); return }
    setLoading(true)
    try {
      const [i, r] = await Promise.all([getAipkSwapInfo(), getAipkSwapRequests({ page: 1, pageSize: 20 })])
      setInfo(i.data)
      setRequests(r.data?.list ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [connected, token])

  useEffect(() => { load() }, [load])

  // 输入停顿 300ms 后拉报价
  useEffect(() => {
    if (!amount || Number(amount) <= 0) { setQuote(null); setQuoteErr(''); return }
    const timer = setTimeout(() => {
      getAipkSwapQuote(String(amount))
        .then((r) => { setQuote(r.data); setQuoteErr('') })
        .catch((err: unknown) => {
          const resp = (err as { response?: { data?: { message?: string } } })?.response?.data
          setQuote(null)
          setQuoteErr(resp?.message ?? '')
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [amount])

  const handleMax = () => {
    if (info?.walletAipk) setAmount(String(Math.floor(Number(info.walletAipk) * 10000) / 10000))
  }

  const handleSwap = async () => {
    if (submitting) return
    if (!hasToken() || !connected) { message.warning(t('account.walletRequired')); return }
    if (!amount || Number(amount) <= 0) { message.warning(t('withdrawal.amountRequired')); return }
    if (info?.walletAipk != null && Number(amount) > Number(info.walletAipk)) {
      message.warning(t('aipkSwap.insufficient'))
      return
    }
    setSubmitting(true)
    try {
      const paramsRes = await createAipkSwapParams(String(amount))
      const p = paramsRes.data
      // 用户钱包签名：Aipk 从自己钱包转到平台收款地址
      const sig = await sendDappIx(p)
      // 链上已转出，confirm 幂等；网络波动时重试，NOT_FINALIZED 多等一会
      let lastErr: unknown = null
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await confirmAipkSwap({ requestNo: p.requestNo, txHash: sig })
          lastErr = null
          break
        } catch (err) {
          lastErr = err
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
      if (lastErr) throw lastErr
      message.success(t('aipkSwap.submitSuccess', { aipk: p.aipkAmount, usdt: p.netUsdt }), 6)
      setAmount('')
      setQuote(null)
      await load()
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string } } })?.response?.data
      message.error(resp?.message ?? (err instanceof Error ? err.message : t('aipkSwap.submitFail')))
    } finally {
      setSubmitting(false)
    }
  }

  if (!connected || !token) {
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

  return (
    <div className="withdrawal-page aipk-swap-page">
      <div className="withdrawal-inner">
        <Spin spinning={loading}>
          <div className="breadcrumb">
            {t('withdrawal.breadcrumb')} <strong>{t('aipkSwap.title')}</strong>
            <button type="button" className="as-link" onClick={() => navigate('/account/withdrawal')}>{t('aipkSwap.goWithdraw')}</button>
          </div>

          <div className="form-section">
            <h3 className="section-label">{t('aipkSwap.step1')}</h3>
            <div className="section-content">
              <div className="balance-hint">
                {t('aipkSwap.walletBalance')}
                <span className="orange"> {info?.walletAipk ?? '--'} Aipk</span>
                <Button type="link" size="small" icon={<ReloadOutlined />} onClick={load} />
              </div>
              <div className="amount-wrapper">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  className="amount-input"
                  size="large"
                  placeholder={t('aipkSwap.amountPh', { min: info?.minAipk ?? 10 })}
                  prefix={<span className="token-dot aipk" />}
                />
                <button type="button" className="max-btn" onClick={handleMax}>{t('withdrawal.max')}</button>
              </div>
              <div className="commission-text">
                {t('aipkSwap.rate', { rate: info?.rateUsdt ?? 1 })}
                {(info?.feeRate ?? 0) > 0 ? ` · ${t('aipkSwap.fee', { fee: Math.round((info?.feeRate ?? 0) * 100) })}` : ` · ${t('aipkSwap.noFee')}`}
              </div>
              {quoteErr ? <div className="as-error">{quoteErr}</div> : null}
              <div className="estimate-bar">
                <span className="estimate-label">{t('aipkSwap.receive')}</span>
                <span>{quote ? Number(quote.netUsdt).toFixed(2) : '--'} USDT</span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-label">{t('aipkSwap.step2')}</h3>
            <div className="section-content">
              <p className="as-note">{t('aipkSwap.flowNote')}</p>
              <p className="as-note as-note-sub">
                {t('aipkSwap.receiveAddr')}: <code>{info?.receiveAddress ?? '-'}</code>
              </p>
            </div>
          </div>

          <Button className="submit-btn" block loading={submitting} disabled={!quote} onClick={handleSwap}>
            {submitting ? t('aipkSwap.submitting') : t('aipkSwap.submitBtn')}
          </Button>

          <div className="form-section" style={{ marginTop: 28 }}>
            <h3 className="section-label">
              {t('aipkSwap.history')}
              {info?.pendingCount ? <Tag color="gold" style={{ marginLeft: 8 }}>{t('aipkSwap.pendingN', { n: info.pendingCount })}</Tag> : null}
            </h3>
            <div className="section-content">
              {requests.length === 0 ? (
                <div className="as-empty">{t('aipkSwap.noHistory')}</div>
              ) : (
                <div className="as-list">
                  {requests.map((r) => (
                    <div key={r.id} className="as-item">
                      <div className="as-item-head">
                        <span className="as-item-no">{r.requestNo}</span>
                        <Tag color={STATUS_COLOR[r.status]}>{t(`aipkSwap.status.${r.status}`)}</Tag>
                      </div>
                      <div className="as-item-row">
                        <span>{Number(r.aipkAmount).toLocaleString()} Aipk → <b>{Number(r.usdtAmount).toFixed(2)} USDT</b></span>
                        <span className="as-item-time">{r.createdAt.slice(0, 19).replace('T', ' ')}</span>
                      </div>
                      <div className="as-item-row as-item-sub">
                        <span>{t('aipkSwap.depositTx')}: {r.depositTxHash ? <a href={`https://solscan.io/tx/${r.depositTxHash}`} target="_blank" rel="noreferrer">{shortHash(r.depositTxHash)}</a> : '-'}</span>
                        {r.payoutTxHash ? (
                          <span>{t('aipkSwap.payoutTx')}: <a href={`https://solscan.io/tx/${r.payoutTxHash}`} target="_blank" rel="noreferrer">{shortHash(r.payoutTxHash)}</a></span>
                        ) : null}
                        {r.status === 'REJECTED' && r.remark ? <span className="as-reject">{r.remark}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Spin>
      </div>
    </div>
  )
}

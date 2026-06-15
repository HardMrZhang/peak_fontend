import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { CopyOutlined, DownOutlined, UpOutlined, TeamOutlined, CrownOutlined, StarFilled } from '@ant-design/icons'
import {
  getReferralInfo,
  getDirectReferrals,
  getPromoSummary,
  getPromoClaimParams,
  confirmPromoClaim,
  getT7Summary,
  getT7ClaimParams,
  confirmT7Claim,
} from '@/api'
import type { DappPromoSummary, DappT7Summary, DirectReferralRecord } from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import './index.css'

const BLOCK_EXPLORER_URL = 'https://solscan.io/tx/'

function shortenAddr(addr: string | null): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

type Tip = { text: string; type: 'success' | 'fail' | '' }
const EMPTY_TIP: Tip = { text: '', type: '' }

export default function Dividend() {
  const { t } = useTranslation()
  const { sendDappIx, connected } = useDappTx()

  const [directCount, setDirectCount] = useState(0)
  const [referrals, setReferrals] = useState<DirectReferralRecord[]>([])
  const [listExpanded, setListExpanded] = useState(false)

  const [promo, setPromo] = useState<DappPromoSummary | null>(null)
  const [t7, setT7] = useState<DappT7Summary | null>(null)

  const [promoClaiming, setPromoClaiming] = useState(false)
  const [t7Claiming, setT7Claiming] = useState(false)
  const [promoTip, setPromoTip] = useState<Tip>(EMPTY_TIP)
  const [t7Tip, setT7Tip] = useState<Tip>(EMPTY_TIP)

  const refresh = useCallback(async () => {
    if (!hasToken()) return
    try {
      const res = await getReferralInfo()
      if (res.data) setDirectCount(res.data.directCount)
    } catch { /* ignore */ }
    try {
      const res = await getDirectReferrals({ page: 1, pageSize: 50 })
      setReferrals(res.data?.list ?? [])
    } catch { /* ignore */ }
    try {
      const res = await getPromoSummary({ page: 1, pageSize: 30 })
      setPromo(res.data ?? null)
    } catch { /* ignore */ }
    try {
      const res = await getT7Summary({ page: 1, pageSize: 30 })
      setT7(res.data ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, connected])

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(t('dividend.copied'))
    } catch {
      message.error(t('dividend.copyFail'))
    }
  }

  const promoPending = promo ? BigInt(promo.pendingRaw || '0') : 0n
  const t7Pending = t7 ? BigInt(t7.pendingRaw || '0') : 0n
  // 实时资格（后端与每日结算同一口径统计），不依赖是否已有分红记录
  const promoQualified = promo?.myQualified ?? false
  const t7Qualified = (t7?.list?.length ?? 0) > 0
  const latestT7 = t7?.list?.[0] ?? null

  // 领取推广分红：后端先补写链上额度，用户钱包单签领取、自付 GAS
  const handlePromoClaim = async () => {
    if (promoClaiming) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    if (promoPending <= 0n) {
      setPromoTip({ text: t('dividend.noClaimable'), type: 'fail' })
      return
    }
    setPromoClaiming(true)
    setPromoTip({ text: t('dividend.claiming'), type: '' })
    try {
      const paramsRes = await getPromoClaimParams()
      const sig = await sendDappIx(paramsRes.data)
      await confirmPromoClaim({ txHash: sig, intentId: paramsRes.data.intentId })
      setPromoTip({ text: `${t('dividend.claimSuccess')} +${paramsRes.data.amount} PEAK`, type: 'success' })
      refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setPromoTip({ text: `${t('dividend.claimFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setPromoTip(EMPTY_TIP)
      }
    } finally {
      setPromoClaiming(false)
    }
  }

  // 领取 T7 股东分红：同上，一次领完名下所有待领份额
  const handleT7Claim = async () => {
    if (t7Claiming) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    if (t7Pending <= 0n) {
      setT7Tip({ text: t('dividend.noClaimable'), type: 'fail' })
      return
    }
    setT7Claiming(true)
    setT7Tip({ text: t('dividend.claiming'), type: '' })
    try {
      const paramsRes = await getT7ClaimParams()
      const sig = await sendDappIx(paramsRes.data)
      await confirmT7Claim({ txHash: sig, intentId: paramsRes.data.intentId })
      setT7Tip({ text: `${t('dividend.claimSuccess')} +${paramsRes.data.amount} PEAK`, type: 'success' })
      refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setT7Tip({ text: `${t('dividend.claimFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setT7Tip(EMPTY_TIP)
      }
    } finally {
      setT7Claiming(false)
    }
  }

  const visibleReferrals = listExpanded ? referrals : referrals.slice(0, 2)

  return (
    <div className="dividend-page">
      <div className="dv-intro">
        <h1 className="dv-title">{t('dividend.title')}</h1>
        <p className="dv-subtitle">{t('dividend.subtitle')}</p>
      </div>

      <div className="dv-grid">
        {/* ---------------- 推广权益（1推5 推广分红） ---------------- */}
        <section className="dv-card">
          <div className="dv-card-head">
            <h2 className="dv-card-title">
              <TeamOutlined className="dv-card-icon" />
              {t('dividend.promoTitle')}
            </h2>
            <span className="dv-badge">
              {t('dividend.totalDirect')} <b>{directCount}</b> {t('dividend.personUnit')}
            </span>
          </div>

          <p className="dv-desc">
            {promoQualified ? t('dividend.promoQualified') : t('dividend.promoNotQualified')}
          </p>

          {referrals.length > 0 && (
            <div className="dv-ref-list">
              {visibleReferrals.map((r) => (
                <div key={r.walletAddress} className="dv-ref-item">
                  <span className="dv-ref-addr">
                    {shortenAddr(r.walletAddress)}
                    {r.promoQualified && (
                      <StarFilled className="dv-ref-star" title={t('dividend.promoStarHint')} />
                    )}
                  </span>
                  <span
                    className={`dv-ref-airdrop${r.airdropQualified ? '' : ' empty'}`}
                    title={t('dividend.airdropAmountHint')}
                  >
                    {r.airdropQualified ? `${r.airdropUsdValue} U` : '--'}
                  </span>
                  <span className="dv-copy" onClick={() => handleCopy(r.walletAddress)}>
                    <CopyOutlined /> {t('dividend.copy')}
                  </span>
                </div>
              ))}
              {referrals.length > 2 && (
                <button type="button" className="dv-expand-btn" onClick={() => setListExpanded(!listExpanded)}>
                  {listExpanded ? (
                    <>
                      {t('dividend.collapseList')} <UpOutlined />
                    </>
                  ) : (
                    <>
                      {t('dividend.expandList')} <DownOutlined />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <div className="dv-stats">
            <div className="dv-stat-line">
              <span className="dv-stat-label">{t('dividend.qualifiedCount')}</span>
              <span className="dv-stat-value">
                <b className="dv-num">{promo?.qualifiedCount ?? 0}</b> {t('dividend.personUnit')}
              </span>
            </div>
            <div className="dv-stat-line">
              <span className="dv-stat-label">{t('dividend.pendingDividend')}</span>
              <span className="dv-stat-value">
                <b className="dv-num">{promo?.pending ?? '0'}</b> PEAK
              </span>
            </div>
          </div>

          <button
            type="button"
            className="dv-claim-btn"
            disabled={promoClaiming || promoPending <= 0n}
            onClick={handlePromoClaim}
          >
            {promoClaiming ? t('dividend.claiming') : t('dividend.claimNow')}
          </button>
          {promoTip.text && <div className={`dv-tip ${promoTip.type}`}>{promoTip.text}</div>}

          <h3 className="dv-record-title">{t('dividend.promoRecordTitle')}</h3>
          <div className="dv-record-list">
            {(promo?.list?.length ?? 0) === 0 ? (
              <div className="dv-record-empty">{t('dividend.noRecord')}</div>
            ) : (
              promo!.list.map((r) => (
                <div key={r.bizDate} className="dv-record-item">
                  <span className="dv-record-date">{r.bizDate}</span>
                  <span className="dv-record-amount">
                    <b className="dv-num">{r.share}</b> PEAK
                  </span>
                  <span className="dv-record-status">
                    {r.status === 'CLAIMED' ? (
                      r.claimTxHash ? (
                        <a
                          className="dv-tx-hash"
                          onClick={() => window.open(`${BLOCK_EXPLORER_URL}${r.claimTxHash}`, '_blank')}
                        >
                          {t('dividend.statusClaimed')}
                        </a>
                      ) : (
                        <span className="dv-status-claimed">{t('dividend.statusClaimed')}</span>
                      )
                    ) : (
                      <span className="dv-status-accrued">{t('dividend.statusAccrued')}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ---------------- T7 股东分红 ---------------- */}
        <section className="dv-card">
          <div className="dv-card-head">
            <h2 className="dv-card-title">
              <CrownOutlined className="dv-card-icon" />
              {t('dividend.t7Title')}
            </h2>
            {latestT7 && (
              <span className="dv-badge">
                {t('dividend.smallAreaPerf')} <b>{latestT7.smallAreaUsdt}</b> USDT
              </span>
            )}
          </div>

          <p className="dv-desc">{t7Qualified ? t('dividend.t7Congrats') : t('dividend.t7NotQualified')}</p>

          <div className="dv-stats">
            <div className="dv-stat-line">
              <span className="dv-stat-label">{t('dividend.latestSettleDate')}</span>
              <span className="dv-stat-value">{latestT7?.bizDate ?? '--'}</span>
            </div>
            <div className="dv-stat-line">
              <span className="dv-stat-label">{t('dividend.pendingDividend')}</span>
              <span className="dv-stat-value">
                <b className="dv-num">{t7?.pending ?? '0'}</b> PEAK
              </span>
            </div>
          </div>

          <button
            type="button"
            className="dv-claim-btn"
            disabled={t7Claiming || t7Pending <= 0n}
            onClick={handleT7Claim}
          >
            {t7Claiming ? t('dividend.claiming') : t('dividend.claimNow')}
          </button>
          {t7Tip.text && <div className={`dv-tip ${t7Tip.type}`}>{t7Tip.text}</div>}

          <h3 className="dv-record-title">{t('dividend.t7RecordTitle')}</h3>
          <div className="dv-record-list">
            {(t7?.list?.length ?? 0) === 0 ? (
              <div className="dv-record-empty">{t('dividend.noRecord')}</div>
            ) : (
              t7!.list.map((r) => (
                <div key={r.bizDate} className="dv-record-item">
                  <span className="dv-record-date">{r.bizDate}</span>
                  <span className="dv-record-amount">
                    <b className="dv-num">{r.share}</b> PEAK
                  </span>
                  <span className="dv-record-status">
                    {r.status === 'CLAIMED' ? (
                      r.claimTxHash ? (
                        <a
                          className="dv-tx-hash"
                          onClick={() => window.open(`${BLOCK_EXPLORER_URL}${r.claimTxHash}`, '_blank')}
                        >
                          {t('dividend.statusClaimed')}
                        </a>
                      ) : (
                        <span className="dv-status-claimed">{t('dividend.statusClaimed')}</span>
                      )
                    ) : (
                      <span className="dv-status-accrued">{t('dividend.statusAccrued')}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

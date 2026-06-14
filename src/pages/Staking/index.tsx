import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import {
  getStakeOverview,
  getStakeParams,
  confirmStake,
  getUnstakeParams,
  confirmUnstake,
  getStakeRecords,
  getStakeRewards,
  getClaimStakeRewardParams,
  confirmClaimStakeReward,
} from '@/api'
import type { DappStakePool, DappStakeRecord, DappStakeRewardsInfo } from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import './index.css'

const BLOCK_EXPLORER_URL = 'https://solscan.io/tx/'
const DURATIONS = [15, 30, 90, 150] as const
type Duration = (typeof DURATIONS)[number]

function shortenHash(hash: string | null): string {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export default function Staking() {
  const { t } = useTranslation()
  const { sendDappIx, connected } = useDappTx()

  const [pools, setPools] = useState<DappStakePool[]>([])
  const [minStake, setMinStake] = useState(1000)
  const [selectedDay, setSelectedDay] = useState<Duration | null>(null)
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeTip, setStakeTip] = useState<{ text: string; type: 'success' | 'fail' | '' }>({ text: '', type: '' })
  const [staking, setStaking] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [stakeRecords, setStakeRecords] = useState<DappStakeRecord[]>([])
  const [stakeRewards, setStakeRewards] = useState<DappStakeRewardsInfo | null>(null)
  const [claimingPeriod, setClaimingPeriod] = useState<number | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const stakeTotals = useMemo(() => {
    const map: Record<number, string> = { 15: '0', 30: '0', 90: '0', 150: '0' }
    pools.forEach((p) => { map[p.periodDays] = p.totalStaked })
    return map
  }, [pools])

  // positionId -> 待领收益（来自 /stake/rewards）
  const pendingByPosition = useMemo(() => {
    const map = new Map<string, { pendingReward: string; pendingRewardRaw: string }>()
    stakeRewards?.positions?.forEach((p) => {
      map.set(p.positionId, { pendingReward: p.pendingReward, pendingRewardRaw: p.pendingRewardRaw })
    })
    return map
  }, [stakeRewards])

  // 分红额度链上按「用户 + 周期」聚合（独立 dividend 合约），领取按周期一键结清。
  // periodDays -> { raw 合计, display 展示值, positionId 任一仓位（接口参数用） }
  const pendingByPeriod = useMemo(() => {
    const map = new Map<number, { raw: bigint; display: string; positionId: string }>()
    stakeRewards?.positions?.forEach((p) => {
      const raw = BigInt(p.pendingRewardRaw || '0')
      if (raw <= 0n) return
      const prev = map.get(p.periodDays)
      map.set(p.periodDays, {
        raw: (prev?.raw ?? 0n) + raw,
        display: '',
        positionId: prev?.positionId ?? p.positionId,
      })
    })
    // 9 位精度格式化，最多 4 位小数（与后端展示口径一致）
    for (const [period, v] of map) {
      const base = 10n ** 9n
      const intPart = v.raw / base
      const frac = (v.raw % base).toString().padStart(9, '0').slice(0, 4).replace(/0+$/, '')
      map.set(period, { ...v, display: frac ? `${intPart}.${frac}` : intPart.toString() })
    }
    return map
  }, [stakeRewards])

  // 权重占比 = 该笔订单质押量 ÷ 所属期限池子的总质押量（分母至少包含当前订单）
  const weightOf = useCallback((record: DappStakeRecord): string => {
    if (record.status === 'REDEEMED') return '-'
    const mine = parseFloat(record.amount)
    if (!mine || mine <= 0) return '-'
    const pool = pools.find((p) => p.periodDays === record.periodDays)
    const poolTotal = pool ? parseFloat(pool.totalStaked) || 0 : 0
    // 链上总量尚未同步到该笔质押时兜底，保证分母包含当前订单
    const total = Math.max(poolTotal, mine)
    if (total <= 0) return '-'
    return `${((mine / total) * 100).toFixed(2)}%`
  }, [pools])

  const refreshStake = useCallback(async () => {
    try {
      const res = await getStakeOverview()
      if (res.data) {
        setPools(res.data.pools)
        setMinStake(res.data.minStakePeak)
      }
    } catch { /* chain/overview not ready */ }
    if (hasToken()) {
      try {
        const rec = await getStakeRecords({ page: 1, pageSize: 50 })
        setStakeRecords(rec.data?.list ?? [])
      } catch { /* ignore */ }
      try {
        const rw = await getStakeRewards({ page: 1, pageSize: 1 })
        setStakeRewards(rw.data ?? null)
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    refreshStake()
  }, [refreshStake, connected])

  // 定时刷新池子总量：有新订单（包括他人质押/赎回）时权重占比自动更新
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await getStakeOverview()
        if (res.data) setPools(res.data.pools)
      } catch { /* ignore */ }
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return ''
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${d}${t('ipo.dayUnit')} ${h}${t('ipo.hourUnit')} ${m}${t('ipo.minUnit')}`
  }

  const handleConfirmStake = async () => {
    setStakeTip({ text: '', type: '' })
    if (staking) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    if (!selectedDay) {
      setStakeTip({ text: t('ipo.selectDurationFirst'), type: 'fail' })
      return
    }
    const amount = parseFloat(stakeAmount || '0')
    if (!amount || amount < minStake) {
      setStakeTip({ text: t('ipo.amountTooLow'), type: 'fail' })
      setStakeAmount('')
      return
    }

    setStaking(true)
    setStakeTip({ text: t('ipo.staking'), type: '' })
    try {
      const paramsRes = await getStakeParams(selectedDay, Math.floor(amount))
      const sig = await sendDappIx(paramsRes.data)
      await confirmStake({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeAmount('')
      setStakeTip({ text: t('ipo.stakeSuccess'), type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setStakeTip({ text: t('ipo.stakeFail'), type: 'fail' })
      } else {
        setStakeTip({ text: '', type: '' })
      }
    } finally {
      setStaking(false)
    }
  }

  // 领取质押分红（按周期一键结清）：用户钱包单签到对应周期分红合约 claim，自付 GAS
  const handleClaimPeriod = async (periodDays: number) => {
    if (claimingPeriod !== null) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const pending = pendingByPeriod.get(periodDays)
    if (!pending || pending.raw <= 0n) return
    setClaimingPeriod(periodDays)
    setStakeTip({ text: t('ipo.claiming'), type: '' })
    try {
      const paramsRes = await getClaimStakeRewardParams(pending.positionId, periodDays)
      const sig = await sendDappIx(paramsRes.data)
      await confirmClaimStakeReward({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeTip({ text: `${t('ipo.claimSuccess')} +${paramsRes.data.reward} PEAK`, type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setStakeTip({ text: `${t('ipo.claimFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setStakeTip({ text: '', type: '' })
      }
    } finally {
      setClaimingPeriod(null)
    }
  }

  const handleRedeem = async (record: DappStakeRecord) => {
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    setStakeTip({ text: t('ipo.redeeming'), type: '' })
    try {
      const paramsRes = await getUnstakeParams(record.positionId, record.periodDays)
      const sig = await sendDappIx(paramsRes.data)
      await confirmUnstake({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeTip({ text: t('ipo.redeemSuccess'), type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('User rejected')) {
        setStakeTip({ text: `${t('ipo.redeemFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
      } else {
        setStakeTip({ text: '', type: '' })
      }
    }
  }

  return (
    <div className="stake-page">
      <div className="st-grid">
        {/* ---------------- 左侧：质押表单 ---------------- */}
        <section className="sp-card">
          <h2 className="sp-card-title">{t('ipo.stakeTitle')}</h2>

          <div className="sp-rule">
            <p className="sp-rule-head">{t('ipo.ruleTitle')}</p>
            <p>1. {t('ipo.rule1')}</p>
            <p>2. {t('ipo.rule2')}</p>
            <p>3. {t('ipo.rule3')}</p>
          </div>

          <div className="sp-duration-grid">
            {DURATIONS.map((day) => (
              <button
                key={day}
                type="button"
                className={`sp-duration-btn day-${day} ${selectedDay === day ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDay(day)
                  setStakeTip({ text: '', type: '' })
                }}
              >
                <span className="sp-duration-day">
                  {day}
                  {t('ipo.dayUnit')}
                </span>
                <span className="sp-duration-total">
                  <span className="sp-duration-total-label">{t('ipo.stakedTotal')}</span>
                  <span className="sp-duration-total-value">{stakeTotals[day]} PEAK</span>
                </span>
              </button>
            ))}
          </div>

          <div className="sp-info-row">
            <span className="sp-info-label">{t('ipo.durationLabel')}</span>
            <span className="sp-info-value">
              {selectedDay ? `${selectedDay} ${t('ipo.dayUnit')}` : t('ipo.selectDuration')}
            </span>
          </div>

          <div className="sp-input-group">
            <input
              type="number"
              className="sp-amount-input"
              placeholder={t('ipo.amountPlaceholder')}
              min={0}
              step={1}
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
            />
            <button type="button" className="sp-confirm-btn" onClick={handleConfirmStake} disabled={staking}>
              {t('ipo.confirmStake')}
            </button>
          </div>

          {stakeTip.text && <div className={`sp-tip ${stakeTip.type}`}>{stakeTip.text}</div>}
        </section>

        {/* ---------------- 右侧：质押记录 ---------------- */}
        <section className="sp-card">
          <div className="sp-record-title-row">
            <h2 className="sp-card-title">{t('ipo.stakeRecordTitle')}</h2>
            {stakeRewards && parseFloat(stakeRewards.totalPending) > 0 && (
              <span className="sp-total-pending">
                {t('ipo.totalPendingReward')}: <b>{stakeRewards.totalPending} PEAK</b>
              </span>
            )}
          </div>
          {/* 按周期领取分红：链上额度按「用户 + 周期」记在对应 dividend 合约，一键结清该周期全部待领 */}
          {pendingByPeriod.size > 0 && (
            <div className="sp-period-claims">
              {DURATIONS.filter((d) => pendingByPeriod.has(d)).map((d) => {
                const pending = pendingByPeriod.get(d)!
                return (
                  <div key={d} className="sp-period-chip">
                    <span className="sp-period-chip-label">
                      {d}
                      {t('ipo.dayUnit')} {t('ipo.pendingReward')}
                    </span>
                    <span className="sp-period-chip-amount">{pending.display} PEAK</span>
                    <button
                      type="button"
                      className="sp-claim-btn"
                      disabled={claimingPeriod !== null}
                      onClick={() => handleClaimPeriod(d)}
                    >
                      {claimingPeriod === d ? t('ipo.claiming') : t('ipo.claimReward')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="sp-record-list">
            {stakeRecords.length === 0 ? (
              <div className="sp-record-empty">{t('ipo.noStakeRecord')}</div>
            ) : (
              stakeRecords.map((item) => {
                const timeLeft = item.unlockTime ? new Date(item.unlockTime).getTime() - now : 0
                const isRedeemed = item.status === 'REDEEMED'
                const txHash = isRedeemed ? item.unstakeTxHash : item.stakeTxHash
                const pending = pendingByPosition.get(item.positionId)
                const hasPending = !!pending && BigInt(pending.pendingRewardRaw || '0') > 0n
                return (
                  <div key={item.id} className={`sp-record-card ${isRedeemed ? 'redeemed' : ''}`}>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordId')}</span>
                      <span className="sp-record-value">{item.positionId}</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordAmount')}</span>
                      <span className="sp-record-value">{item.amount} PEAK</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordDuration')}</span>
                      <span className="sp-record-value">
                        {item.periodDays} {t('ipo.dayUnit')}
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.weightShare')}</span>
                      <span className="sp-record-value">{weightOf(item)}</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.pendingReward')}</span>
                      <span className="sp-record-value">
                        <span className={hasPending ? 'sp-pending-amount' : ''}>
                          {pending ? pending.pendingReward : '0'} PEAK
                        </span>
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.claimedReward')}</span>
                      <span className="sp-record-value">{item.claimedReward} PEAK</span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.recordStatus')}</span>
                      <span className="sp-record-value">
                        {item.status === 'STAKING' && <span className="sp-countdown">{formatCountdown(timeLeft)}</span>}
                        {item.status === 'REDEEMABLE' && (
                          <button type="button" className="sp-redeem-btn" onClick={() => handleRedeem(item)}>
                            {t('ipo.statusRedeemable')}
                          </button>
                        )}
                        {item.status === 'REDEEMED' && <span className="sp-redeemed-text">{t('ipo.statusRedeemed')}</span>}
                      </span>
                    </div>
                    {txHash && (
                      <div className="sp-record-row">
                        <span className="sp-record-label">{t('ipo.recordTxHash')}</span>
                        <span className="sp-record-value">
                          <a
                            className="sp-tx-hash"
                            onClick={() => window.open(`${BLOCK_EXPLORER_URL}${txHash}`, '_blank')}
                          >
                            {shortenHash(txHash)}
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { DappStakePool, DappStakeRecord, DappStakeRewardsInfo, StakeAsset } from '@/types'
import { useDappTx, hasToken } from '@/hooks/useDappTx'
import { assetLabel } from '@/utils/asset'
import './index.css'

const BLOCK_EXPLORER_URL = 'https://solscan.io/tx/'
const DURATIONS = [15, 30, 90, 150] as const
type Duration = (typeof DURATIONS)[number]
const STAKE_ASSETS: StakeAsset[] = ['PEAK', 'AIPK']
const DEFAULT_MIN_STAKE: Record<StakeAsset, number> = { PEAK: 1000, AIPK: 10 }
const unitOf = (asset?: StakeAsset | string | null) => assetLabel(asset || 'PEAK', 'PEAK')

function shortenHash(hash: string | null): string {
  if (!hash) return ''
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

export default function Staking() {
  const { t } = useTranslation()
  const { sendDappIx, connected } = useDappTx()

  const [pools, setPools] = useState<DappStakePool[]>([])
  const [minStakeByAsset, setMinStakeByAsset] = useState<Record<StakeAsset, number>>(DEFAULT_MIN_STAKE)
  // 质押币种（下拉）：PEAK 走原合约通道，Aipk 走同一程序的 v2（按 mint 分池）
  const [stakeAsset, setStakeAsset] = useState<StakeAsset>('PEAK')
  const minStake = minStakeByAsset[stakeAsset] ?? DEFAULT_MIN_STAKE[stakeAsset]
  const [selectedDay, setSelectedDay] = useState<Duration | null>(null)
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeTip, setStakeTip] = useState<{ text: string; type: 'success' | 'fail' | '' }>({ text: '', type: '' })
  const [staking, setStaking] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [stakeRecords, setStakeRecords] = useState<DappStakeRecord[]>([])
  const [stakeRewards, setStakeRewards] = useState<DappStakeRewardsInfo | null>(null)
  const [claimingPeriod, setClaimingPeriod] = useState<string | null>(null)
  // 同步锁：state 更新是异步的，快速连点会在 re-render 前重复通过校验而发起多笔领取交易；
  // 用 ref 在事件回调里同步加锁，确保同一时刻只处理一笔领取（防抖 / 防重复提交）。
  const claimingRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 每个周期两种币的已质押总量
  const stakeTotals = useMemo(() => {
    const map: Record<number, Record<StakeAsset, string>> = {
      15: { PEAK: '0', AIPK: '0' }, 30: { PEAK: '0', AIPK: '0' }, 90: { PEAK: '0', AIPK: '0' }, 150: { PEAK: '0', AIPK: '0' },
    }
    pools.forEach((p) => {
      map[p.periodDays] = {
        PEAK: p.totals?.PEAK?.amount ?? p.totalStaked,
        AIPK: p.totals?.AIPK?.amount ?? '0',
      }
    })
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

  // 分红额度链上按「用户 + 周期 + 币种」聚合（独立 dividend 合约），领取按周期一键结清。
  // key `${periodDays}:${asset}` -> { raw 合计, display 展示值, positionId 任一仓位（接口参数用） }
  const pendingByPeriod = useMemo(() => {
    const map = new Map<string, { periodDays: number; asset: StakeAsset; raw: bigint; display: string; positionId: string }>()
    stakeRewards?.positions?.forEach((p) => {
      const raw = BigInt(p.pendingRewardRaw || '0')
      if (raw <= 0n) return
      const asset = (p.asset || 'PEAK') as StakeAsset
      const key = `${p.periodDays}:${asset}`
      const prev = map.get(key)
      map.set(key, {
        periodDays: p.periodDays,
        asset,
        raw: (prev?.raw ?? 0n) + raw,
        display: '',
        positionId: prev?.positionId ?? p.positionId,
      })
    })
    // 9 位精度格式化，最多 4 位小数（与后端展示口径一致）
    for (const [key, v] of map) {
      const base = 10n ** 9n
      const intPart = v.raw / base
      const frac = (v.raw % base).toString().padStart(9, '0').slice(0, 4).replace(/0+$/, '')
      map.set(key, { ...v, display: frac ? `${intPart}.${frac}` : intPart.toString() })
    }
    return map
  }, [stakeRewards])
  const pendingChips = useMemo(() => [...pendingByPeriod.values()].sort((a, b) => a.periodDays - b.periodDays || a.asset.localeCompare(b.asset)), [pendingByPeriod])
  const totalPendingText = useMemo(() => {
    const parts: string[] = []
    const peak = stakeRewards?.totalPendingByAsset?.PEAK?.amount ?? stakeRewards?.totalPending
    const aipk = stakeRewards?.totalPendingByAsset?.AIPK?.amount
    if (peak && parseFloat(peak) > 0) parts.push(`${peak} PEAK`)
    if (aipk && parseFloat(aipk) > 0) parts.push(`${aipk} Aipk`)
    return parts.join(' + ')
  }, [stakeRewards])

  // 权重占比 = 该笔订单质押量 ÷ 所属期限池子「同币种」的总质押量（分母至少包含当前订单）
  const weightOf = useCallback((record: DappStakeRecord): string => {
    if (record.status === 'REDEEMED') return '-'
    const mine = parseFloat(record.amount)
    if (!mine || mine <= 0) return '-'
    const pool = pools.find((p) => p.periodDays === record.periodDays)
    const asset = (record.asset || 'PEAK') as StakeAsset
    const poolTotalStr = pool ? (pool.totals?.[asset]?.amount ?? (asset === 'PEAK' ? pool.totalStaked : '0')) : '0'
    const poolTotal = parseFloat(poolTotalStr) || 0
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
        const next: Record<StakeAsset, number> = { ...DEFAULT_MIN_STAKE, PEAK: Number(res.data.minStakePeak) || DEFAULT_MIN_STAKE.PEAK }
        res.data.assets?.forEach((a) => { next[a.asset] = Number(a.minStake) || DEFAULT_MIN_STAKE[a.asset] })
        setMinStakeByAsset(next)
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
      const paramsRes = await getStakeParams(selectedDay, Math.floor(amount), stakeAsset)
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

  // 领取质押分红（按周期 + 币种一键结清）：用户钱包单签到对应周期分红合约 claim / claim_v2，自付 GAS
  const handleClaimPeriod = async (periodDays: number, asset: StakeAsset) => {
    // 同步加锁：连点时后续调用会立即被拦截（ref 立刻生效，不等 re-render）
    if (claimingRef.current || claimingPeriod !== null) return
    if (!hasToken() || !connected) {
      message.warning(t('account.walletRequired'))
      return
    }
    const key = `${periodDays}:${asset}`
    const pending = pendingByPeriod.get(key)
    if (!pending || pending.raw <= 0n) return
    claimingRef.current = true
    setClaimingPeriod(key)
    setStakeTip({ text: t('ipo.claiming'), type: '' })
    try {
      const paramsRes = await getClaimStakeRewardParams(pending.positionId, periodDays, asset)
      const sig = await sendDappIx(paramsRes.data)
      await confirmClaimStakeReward({ txHash: sig, intentId: paramsRes.data.intentId })
      setStakeTip({ text: `${t('ipo.claimSuccess')} +${paramsRes.data.reward} ${unitOf(asset)}`, type: 'success' })
      refreshStake()
    } catch (err: unknown) {
      const errorCode = (err as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode
      if (errorCode === 'ALREADY_CLAIMED') {
        // 收益此前已到账、confirm 未回写：服务端已自愈对账，这里刷新让待领归零。
        setStakeTip({ text: t('ipo.claimAlready'), type: 'success' })
        refreshStake()
      } else if (errorCode === 'CLAIM_IN_PROGRESS') {
        setStakeTip({ text: t('ipo.claimBusy'), type: '' })
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('User rejected')) {
          setStakeTip({ text: `${t('ipo.claimFail')}: ${msg.slice(0, 80)}`, type: 'fail' })
        } else {
          setStakeTip({ text: '', type: '' })
        }
      }
    } finally {
      claimingRef.current = false
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
            <p>4. {t('ipo.rule4')}</p>
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
                  <span className="sp-duration-total-value">{stakeTotals[day].PEAK} PEAK</span>
                  <span className="sp-duration-total-value sp-duration-total-aipk">{stakeTotals[day].AIPK} Aipk</span>
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

          {/* 质押币种：PEAK / Aipk（Aipk 最低 10 枚，分红按币种各自分池） */}
          <div className="sp-info-row">
            <span className="sp-info-label">{t('ipo.stakeAssetLabel')}</span>
            <select
              className="sp-asset-select"
              value={stakeAsset}
              onChange={(e) => {
                setStakeAsset(e.target.value as StakeAsset)
                setStakeAmount('')
                setStakeTip({ text: '', type: '' })
              }}
            >
              {STAKE_ASSETS.map((a) => (
                <option key={a} value={a}>{unitOf(a)}</option>
              ))}
            </select>
          </div>

          <div className="sp-input-group">
            <input
              type="number"
              className="sp-amount-input"
              placeholder={t('ipo.amountPlaceholderAsset', { min: minStake, unit: unitOf(stakeAsset) })}
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
            {totalPendingText && (
              <span className="sp-total-pending">
                {t('ipo.totalPendingReward')}: <b>{totalPendingText}</b>
              </span>
            )}
          </div>
          {/* 按周期领取分红：链上额度按「用户 + 周期」记在对应 dividend 合约，一键结清该周期全部待领 */}
          {pendingChips.length > 0 && (
            <div className="sp-period-claims">
              {pendingChips.map((pending) => {
                const key = `${pending.periodDays}:${pending.asset}`
                return (
                  <div key={key} className="sp-period-chip">
                    <span className="sp-period-chip-label">
                      {pending.periodDays}
                      {t('ipo.dayUnit')} {t('ipo.pendingReward')}
                    </span>
                    <span className="sp-period-chip-amount">{pending.display} {unitOf(pending.asset)}</span>
                    <button
                      type="button"
                      className="sp-claim-btn"
                      disabled={claimingPeriod !== null}
                      onClick={() => handleClaimPeriod(pending.periodDays, pending.asset)}
                    >
                      {claimingPeriod === key ? t('ipo.claiming') : t('ipo.claimReward')}
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
                      <span className="sp-record-value">{item.amount} {unitOf(item.asset)}</span>
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
                          {pending ? pending.pendingReward : '0'} {unitOf(item.asset)}
                        </span>
                      </span>
                    </div>
                    <div className="sp-record-row">
                      <span className="sp-record-label">{t('ipo.claimedReward')}</span>
                      <span className="sp-record-value">{item.claimedReward} {unitOf(item.asset)}</span>
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

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { assetLabel } from '@/utils/asset'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Pagination, Modal, message } from 'antd'
import { ExclamationCircleOutlined, InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useWallet } from '@solana/wallet-adapter-react'
import { getBalances, getLedger, getNodeOrders, getReferralRewards, getRewardSummary, getNodeInfo, getMyGenesisNfts, getNotices, getDramaEarningRecords, getDramaPendingAgreements, getDramaMyContracts, getDramaAgreement } from '@/api'
import type { AssetBalance, LedgerEntry, NodeOrder, ReferralReward, RewardSummary, PageResult, Notice, DramaEarningRecord, DramaPendingAgreement, DramaMyContract } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import ContractSignModal from '@/components/ContractSignModal'
import { downloadContract, printContract } from '@/utils/contractFile'
import './index.css'

type TabKey = 'transaction' | 'node' | 'reward' | 'dramaIpo'
// AI 打新明细分三类：AIRDROP = 三倍代币（PEAK）每日释放；
// USDT = 本金返还 + 40% 分红；CONTRACT = 我的合同（可查看/下载/打印）
type DramaRecordType = 'AIRDROP' | 'USDT' | 'CONTRACT'

export default function Account() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { connected } = useWallet()
  const token = useAuthStore((s) => s.token)
  const loginLoading = useAuthStore((s) => s.loginLoading)
  const loginFailed = useAuthStore((s) => s.loginFailed)
  const setLoginFailed = useAuthStore((s) => s.setLoginFailed)
  const [activeTab, setActiveTab] = useState<TabKey>('transaction')
  const [dramaType, setDramaType] = useState<DramaRecordType>('AIRDROP')
  const [page, setPage] = useState(1)
  const [walletTipOpen, setWalletTipOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(true)
  const [notices, setNotices] = useState<Notice[]>([])
  const pageSize = 10

  const noticeLangCode = useMemo(() => {
    const lang = String(i18n.language || '').toLowerCase()
    return lang.startsWith('zh') ? 'zh-CN' : 'en'
  }, [i18n.language])

  useEffect(() => {
    let active = true
    getNotices(noticeLangCode)
      .then((res) => {
        if (!active) return
        const list = (res.data || []).filter(
          (item) => !!String(item.title || '').trim() || !!String(item.contentHtml || '').trim(),
        )
        setNotices(list)
        setNoticeOpen(list.length > 0)
      })
      .catch(() => {
        if (!active) return
        setNotices([])
        setNoticeOpen(false)
      })
    return () => { active = false }
  }, [noticeLangCode])

  const activeNotice = notices[0] || null
  const noticeTime = useMemo(() => {
    if (!activeNotice?.publishedAt) return ''
    const d = new Date(activeNotice.publishedAt)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }, [activeNotice])

  const [balances, setBalances] = useState<AssetBalance[]>([])
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null)
  const [ledgerData, setLedgerData] = useState<PageResult<LedgerEntry> | null>(null)
  const [nodeData, setNodeData] = useState<PageResult<NodeOrder> | null>(null)
  const [rewardData, setRewardData] = useState<PageResult<ReferralReward> | null>(null)
  const [dramaData, setDramaData] = useState<PageResult<DramaEarningRecord> | null>(null)
  // 付款成功但正式协议未签署的认购：只提醒，不阻断空投/本金/分红发放
  const [pendingAgreements, setPendingAgreements] = useState<DramaPendingAgreement[]>([])
  const [signTarget, setSignTarget] = useState<DramaPendingAgreement | null>(null)
  const [contractData, setContractData] = useState<PageResult<DramaMyContract> | null>(null)
  const [viewContract, setViewContract] = useState<{ title: string; html: string } | null>(null)
  const [busyContract, setBusyContract] = useState('')
  const [userNodes, setUserNodes] = useState(0)
  const [genesisNftCount, setGenesisNftCount] = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)

  const refreshBalances = useCallback(async () => {
    if (!token) return
    await Promise.all([
      getBalances().then((r) => setBalances(r.data)).catch(() => { }),
      getRewardSummary().then((r) => setRewardSummary(r.data)).catch(() => { }),
      getNodeInfo().then((r) => setUserNodes(r.data.userNodes)).catch(() => { }),
      getMyGenesisNfts({ page: 1, pageSize: 1 }).then((r) => setGenesisNftCount(r.data.total)).catch(() => { }),
    ])
  }, [token])

  useEffect(() => {
    if (!token) { setBalanceLoading(false); return }
    setBalanceLoading(true)
    refreshBalances().finally(() => setBalanceLoading(false))

    const timer = window.setInterval(() => {
      refreshBalances().catch(() => { })
    }, 15000)
    const onFocus = () => { refreshBalances().catch(() => { }) }
    const onBalanceRefresh = () => { refreshBalances().catch(() => { }) }
    window.addEventListener('focus', onFocus)
    window.addEventListener('balance:refresh', onBalanceRefresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('balance:refresh', onBalanceRefresh)
    }
  }, [token, refreshBalances])

  const fetchTab = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    const done = () => setTableLoading(false)
    if (activeTab === 'transaction') {
      getLedger({ page, pageSize }).then((r) => setLedgerData(r.data)).catch(() => { }).finally(done)
    } else if (activeTab === 'node') {
      getNodeOrders({ page, pageSize }).then((r) => {
        setNodeData(r.data)
        const total = r.data.list.reduce((s: number, o: NodeOrder) => s + o.qty, 0)
        setUserNodes(total)
      }).catch(() => { }).finally(done)
    } else if (activeTab === 'dramaIpo') {
      if (dramaType === 'CONTRACT') {
        getDramaMyContracts({ page, pageSize })
          .then((r) => setContractData(r.data)).catch(() => { }).finally(done)
      } else {
        getDramaEarningRecords({ type: dramaType, page, pageSize })
          .then((r) => setDramaData(r.data)).catch(() => { }).finally(done)
      }
    } else {
      getReferralRewards({ page, pageSize }).then((r) => setRewardData(r.data)).catch(() => { }).finally(done)
    }
  }, [token, activeTab, dramaType, page, pageSize])

  useEffect(() => { fetchTab() }, [fetchTab])

  const loadPendingAgreements = useCallback(async () => {
    if (!token) return []
    try {
      const r = await getDramaPendingAgreements()
      const list = r.data ?? []
      setPendingAgreements(list)
      return list
    } catch {
      setPendingAgreements([])
      return []
    }
  }, [token])

  useEffect(() => { loadPendingAgreements() }, [loadPendingAgreements])

  const emptyText = (
    <div className="table-empty">
      <InboxOutlined className="table-empty-icon" />
      <span className="table-empty-text">{t('common.noData')}</span>
    </div>
  )

  const handleWalletAction = (path: string) => {
    if (!connected || loginLoading || loginFailed || !token) {
      setWalletTipOpen(true)
      return
    }
    navigate(path)
  }

  const usdtBalance = balances.find((b) => b.asset === 'USDT')
  const usdtAmount = usdtBalance ? Number(usdtBalance.availableAmount).toFixed(2) : '0.00'
  // Aipk：AI 短剧打新资产包释放 + 直推/级差奖励（账本余额），可提到钱包或站内兑换 USDT
  const aipkBalance = balances.find((b) => b.asset === 'AIPK')
  const aipkAmount = aipkBalance ? Number(aipkBalance.availableAmount).toFixed(4) : '0.0000'
  const totalLocked = rewardSummary ? Number(rewardSummary.totalLocked).toFixed(2) : '0.00'
  // 账户页「已释放 PEAK」= 节点奖励释放 + 三倍空投/打新释放的合计（两条提现通道分别在节点页与三倍空投页）
  const totalReleased = rewardSummary
    ? (Number(rewardSummary.totalReleased) + Number(rewardSummary.airdropReleased ?? 0)).toFixed(2)
    : '0.00'
  const changeTypeLabelMap: Record<string, string> = {
    NODE_PURCHASE_DEBIT: t('account.changeType.NODE_PURCHASE_DEBIT'),
    NODE_PURCHASE_FEE_REFUND: t('account.changeType.NODE_PURCHASE_FEE_REFUND'),
    DEPOSIT: t('account.changeType.DEPOSIT'),
    WITHDRAW_FREEZE: t('account.changeType.WITHDRAW_FREEZE'),
    WITHDRAW_SEND: t('account.changeType.WITHDRAW_SEND'),
    WITHDRAW_FAIL_UNFREEZE: t('account.changeType.WITHDRAW_FAIL_UNFREEZE'),
    REFERRAL_REWARD: t('account.changeType.REFERRAL_REWARD'),
    REWARD_RELEASE: t('account.changeType.REWARD_RELEASE'),
    DEPOSIT_REVERSAL: t('account.changeType.DEPOSIT_REVERSAL'),
    NODE_REWARD_CREDIT: t('account.changeType.NODE_REWARD_CREDIT'),
    NODE_PURCHASE_REFUND: t('account.changeType.NODE_PURCHASE_REFUND'),
    REFERRAL_REWARD_CREDIT: t('account.changeType.REFERRAL_REWARD_CREDIT'),
    WITHDRAW_SUCCESS_DEBIT: t('account.changeType.WITHDRAW_SUCCESS_DEBIT'),
    PURCHASE_FREEZE: t('account.changeType.PURCHASE_FREEZE'),
    PURCHASE_UNFREEZE: t('account.changeType.PURCHASE_UNFREEZE'),
    REWARD_RELEASE_REVERSAL: t('account.changeType.REWARD_RELEASE_REVERSAL'),
    TRIPLE_REWARD_FIX: t('account.changeType.TRIPLE_REWARD_FIX'),
    SCORE_REDEEM: t('account.changeType.SCORE_REDEEM'),
  }
  const bizTypeLabelMap: Record<string, string> = {
    NODE_PURCHASE: t('account.bizType.NODE_PURCHASE'),
    NODE_PURCHASE_REFUND: t('account.bizType.NODE_PURCHASE_REFUND'),
    DEPOSIT: t('account.bizType.DEPOSIT'),
    WITHDRAW: t('account.bizType.WITHDRAW'),
    REFERRAL: t('account.bizType.REFERRAL'),
    REWARD_RELEASE: t('account.bizType.REWARD_RELEASE'),
    DEPOSIT_REVERSAL: t('account.bizType.DEPOSIT_REVERSAL'),
    NODE_DAILY: t('account.bizType.NODE_DAILY'),
    NODE_REWARD: t('account.bizType.NODE_REWARD'),
    REFERRAL_REWARD: t('account.bizType.REFERRAL_REWARD'),
    REWARD_FIX: t('account.bizType.REWARD_FIX'),
    SCORE_REDEEM: t('account.bizType.SCORE_REDEEM'),
  }
  const statusLabelMap: Record<string, string> = {
    PENDING: t('account.status.PENDING'),
    PAID: t('account.status.PAID'),
    FAILED: t('account.status.FAILED'),
    CANCELLED: t('account.status.CANCELLED'),
    EXPIRED: t('account.status.EXPIRED'),
    CONFIRMED: t('account.status.CONFIRMED'),
    REVERSED: t('account.status.REVERSED'),
    SUCCESS: t('account.status.SUCCESS'),
    MINTING: t('account.status.MINTING'),
    REFUNDED: t('account.status.REFUNDED'),
    LOCKED: t('account.status.LOCKED'),
    RELEASING: t('account.status.RELEASING'),
    COMPLETED: t('account.status.COMPLETED'),
  }

  const transactionColumns: ColumnsType<LedgerEntry> = [
    { title: t('account.colType'), dataIndex: 'changeType', width: 160, render: (v: string) => changeTypeLabelMap[v] || v },
    { title: t('account.colCrypto'), dataIndex: 'asset', width: 80, render: (v: string) => <span style={{ color: '#f5a623' }}>{v}</span> },
    { title: t('account.colQuantity'), dataIndex: 'amount', width: 120, render: (v: string, r: LedgerEntry) => <span style={{ color: r.direction === 'IN' ? '#52c41a' : '#ff4d4f' }}>{r.direction === 'IN' ? '+' : '-'}{parseFloat(v).toFixed(2)}</span> },
    { title: t('account.colPurpose'), dataIndex: 'bizType', width: 150, render: (v: string) => bizTypeLabelMap[v] || v || '-' },
    { title: t('account.colTime'), dataIndex: 'createdAt', width: 170, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ]

  const nodeColumns: ColumnsType<NodeOrder> = [
    { title: t('account.colNode'), dataIndex: 'orderNo', width: 140 },
    { title: t('account.colUnitPrice'), dataIndex: 'unitPriceUsdt', width: 100, render: (v: string) => <span style={{ color: '#f5a623' }}>{v} USDT</span> },
    { title: t('account.colQuantity'), dataIndex: 'qty', width: 80, render: (v: number) => <span style={{ color: '#f5a623' }}>{v}</span> },
    { title: t('account.colTotalPrice'), dataIndex: 'totalAmountUsdt', width: 120, render: (v: string) => <span style={{ color: '#f5a623' }}>{v} USDT</span> },
    { title: t('account.colStatus'), dataIndex: 'status', width: 100, render: (v: string) => statusLabelMap[v] || v },
    { title: t('account.colTime'), dataIndex: 'createdAt', width: 170, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ]

  const rewardColumns: ColumnsType<ReferralReward> = [
    { title: t('account.colAddress'), dataIndex: 'fromUserWallet', ellipsis: true },
    { title: t('account.colAmount'), dataIndex: 'amount', width: 150, render: (v: string) => <span style={{ color: '#f5a623' }}>{parseFloat(v).toFixed(2)}</span> },
    { title: t('account.colStatus'), dataIndex: 'status', width: 100, render: (v: string) => statusLabelMap[v] || v },
    { title: t('account.colTime'), dataIndex: 'createdAt', width: 170, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ]

  // 资产包每日释放（V2 为 Aipk，V1 历史包为 PEAK）：只有日期与数量有意义
  const dramaAirdropColumns: ColumnsType<DramaEarningRecord> = [
    { title: t('dramaIpo.colProject'), width: 180, render: (_: unknown, r: DramaEarningRecord) => `${r.serialNo ?? '-'} ${r.projectName ?? ''}` },
    { title: t('dramaIpo.colAmount'), dataIndex: 'amount', width: 140, render: (v: string, r: DramaEarningRecord) => <span style={{ color: '#f5a623' }}>+{parseFloat(v).toFixed(4)} {assetLabel(r.asset)}</span> },
    { title: t('account.colStatus'), dataIndex: 'status', width: 100, render: (v: string) => statusLabelMap[v] || v },
    { title: t('account.colTime'), dataIndex: 'bizDate', width: 140, render: (v?: string) => v?.slice(0, 10) ?? '-' },
  ]

  // USDT 类：本金返还与 40% 分红合并展示，用「类型 + 期次」区分
  const dramaUsdtColumns: ColumnsType<DramaEarningRecord> = [
    { title: t('dramaIpo.colProject'), width: 180, render: (_: unknown, r: DramaEarningRecord) => `${r.serialNo ?? '-'} ${r.projectName ?? ''}` },
    {
      title: t('account.colType'),
      width: 140,
      render: (_: unknown, r: DramaEarningRecord) => (r.type === 'PRINCIPAL'
        ? (r.dayNo
          ? t('dramaIpo.principalOfDay', { n: r.periodNo, day: r.dayNo })
          : t('dramaIpo.principalMonth', { n: r.periodNo }))
        : t('dramaIpo.dividendPeriod', { n: r.periodNo })),
    },
    { title: t('dramaIpo.colAmount'), dataIndex: 'amount', width: 130, render: (v: string) => <span style={{ color: '#f5a623' }}>+{parseFloat(v).toFixed(2)} USDT</span> },
    { title: t('account.colStatus'), dataIndex: 'status', width: 100, render: (v: string) => statusLabelMap[v] || v },
    {
      title: t('account.colTime'),
      width: 170,
      render: (_: unknown, r: DramaEarningRecord) => (r.paidAt ?? r.dueDate ?? '').slice(0, 19).replace('T', ' ') || '-',
    },
  ]

  // 站内查看用深色主题；下载/打印走服务端的白底纸质版
  const handleViewContract = async (row: DramaMyContract) => {
    setBusyContract(row.subscriptionId)
    try {
      const res = await getDramaAgreement(row.subscriptionId)
      setViewContract({
        title: `${row.contractNo ?? ''} ${row.projectName}`,
        html: res.data?.contentHtml ?? '',
      })
    } finally {
      setBusyContract('')
    }
  }

  const handleDownloadContract = async (row: DramaMyContract) => {
    setBusyContract(row.subscriptionId)
    try {
      await downloadContract(row.subscriptionId, row.contractNo, row.projectName)
    } catch {
      message.error(t('dramaIpo.downloadFail'))
    } finally {
      setBusyContract('')
    }
  }

  const handlePrintContract = async (row: DramaMyContract) => {
    setBusyContract(row.subscriptionId)
    try {
      await printContract(row.subscriptionId)
    } catch {
      message.error(t('dramaIpo.downloadFail'))
    } finally {
      setBusyContract('')
    }
  }

  const contractColumns: ColumnsType<DramaMyContract> = [
    {
      title: t('dramaIpo.colContractNo'),
      width: 150,
      render: (_: unknown, r: DramaMyContract) => (
        <span style={{ color: '#f5a623', fontWeight: 600 }}>{r.contractNo || '-'}</span>
      ),
    },
    {
      title: t('dramaIpo.colProject'),
      width: 180,
      render: (_: unknown, r: DramaMyContract) => `${r.serialNo} ${r.projectName}`,
    },
    { title: t('dramaIpo.subShares'), dataIndex: 'sharesSigned', width: 80, render: (v: number) => `${v} ${t('dramaIpo.shareUnit')}` },
    { title: t('dramaIpo.subAmount'), dataIndex: 'amountUsdt', width: 120, render: (v: string) => `${parseFloat(v).toFixed(2)} USDT` },
    {
      title: t('dramaIpo.colRatio'),
      dataIndex: 'investRatioBps',
      width: 90,
      render: (v: number | null) => (v == null ? '-' : `${(v / 100).toFixed(2)}%`),
    },
    { title: t('dramaIpo.colSignedAt'), dataIndex: 'signedAt', width: 160, render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
    {
      title: t('dramaIpo.colAction'),
      width: 190,
      render: (_: unknown, r: DramaMyContract) => (
        <span className="contract-actions">
          <button type="button" onClick={() => handleViewContract(r)} disabled={busyContract === r.subscriptionId}>
            {t('dramaIpo.view')}
          </button>
          <button type="button" onClick={() => handleDownloadContract(r)} disabled={busyContract === r.subscriptionId}>
            {t('dramaIpo.download')}
          </button>
          <button type="button" onClick={() => handlePrintContract(r)} disabled={busyContract === r.subscriptionId}>
            {t('dramaIpo.printPdf')}
          </button>
        </span>
      ),
    },
  ]

  const currentData = activeTab === 'transaction'
    ? ledgerData
    : activeTab === 'node'
      ? nodeData
      : activeTab === 'dramaIpo'
        ? (dramaType === 'CONTRACT' ? contractData : dramaData)
        : rewardData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnsMap: Record<TabKey, ColumnsType<any>> = {
    transaction: transactionColumns,
    node: nodeColumns,
    reward: rewardColumns,
    dramaIpo: dramaType === 'AIRDROP'
      ? dramaAirdropColumns
      : dramaType === 'USDT' ? dramaUsdtColumns : contractColumns,
  }

  return (
    <div className="account-page">
      {noticeOpen && activeNotice && (
        <div className="sp-notice-mask" onClick={() => setNoticeOpen(false)}>
          <div className="sp-notice-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sp-notice-close" onClick={() => setNoticeOpen(false)} aria-label="close">
              ×
            </button>
            {activeNotice.title ? <h3 className="sp-notice-title">{activeNotice.title}</h3> : null}
            {noticeTime ? (
              <p className="sp-notice-time">
                {noticeLangCode === 'zh-CN' ? '发布时间：' : 'Published: '}{noticeTime}
              </p>
            ) : null}
            <div
              className="sp-notice-body"
              dangerouslySetInnerHTML={{ __html: activeNotice.contentHtml || '' }}
            />
            {activeNotice.targetUrl ? (
              <div className="sp-notice-link-row">
                <a href={activeNotice.targetUrl} target="_blank" rel="noreferrer">
                  {noticeLangCode === 'zh-CN' ? '查看详情' : 'View details'}
                </a>
              </div>
            ) : null}
            <button type="button" className="sp-notice-confirm" onClick={() => setNoticeOpen(false)}>
              {noticeLangCode === 'zh-CN' ? '我已知晓' : 'Got it'}
            </button>
          </div>
        </div>
      )}
      <div className="account-inner">
        <h1 className="page-title">{t('account.title')}</h1>

        <div className="account-cards">
          <div className="account-card balance-card">
            <span className="card-label">{t('account.myBalance')}</span>
            <div className="card-row">
              <span className="balance-icon usdt">◉</span>
              <span className="balance-amount">{balanceLoading ? '--' : usdtAmount} USDT</span>
              <Button className="withdraw-btn" onClick={() => handleWalletAction('/account/withdrawal?asset=USDT')}>{t('account.withdrawal')}</Button>
            </div>
            <div className="card-row aipk-row">
              <span className="balance-icon aipk">◉</span>
              <span className="balance-amount aipk-amount">{balanceLoading ? '--' : aipkAmount} Aipk</span>
              <Button className="withdraw-btn" onClick={() => handleWalletAction('/account/withdrawal?asset=AIPK')}>{t('account.withdrawal')}</Button>
              <Button className="withdraw-btn swap-btn" onClick={() => handleWalletAction('/account/aipk-swap')}>{t('account.swapAipk')}</Button>
            </div>
            <div className="peak-stat-row">
              <span className="balance-icon peak">◉</span>
              <span className="peak-stat-label">{t('account.releasedPeak')}</span>
              <span className="peak-stat-value">{balanceLoading ? '--' : totalReleased} PEAK</span>
            </div>
          </div>
          <div className="account-card nodes-card">
            <span className="card-label">{t('account.myNodes')}</span>
            <div className="card-row">
              <span className="node-icon">●</span>
              <span className="node-count">{userNodes}</span>
            </div>
            <div className="peak-stat-row">
              <span className="balance-icon peak">◉</span>
              <span className="peak-stat-label">{t('account.earnedPeak')}</span>
              <span className="peak-stat-value">{balanceLoading ? '--' : totalLocked} PEAK</span>
            </div>
          </div>
          <div className="account-card nodes-card">
            <span className="card-label">{t('account.myGenesisNodes')}</span>
            <div className="card-row">
              <span className="node-icon">◆</span>
              <span className="node-count">{genesisNftCount}</span>
              <Button className="purchase-btn-sm" onClick={() => navigate('/genesis-nodes')}>{t('account.purchase')}</Button>
            </div>
          </div>
        </div>

        <div className="account-records">
          <div className="account-tabs">
            <span
              className={`account-tab ${activeTab === 'transaction' ? 'active' : ''}`}
              onClick={() => { setActiveTab('transaction'); setPage(1) }}
            >
              {activeTab === 'transaction' && <span className="tab-bar">|</span>}
              {t('account.transactionRecord')}
            </span>
            <span
              className={`account-tab ${activeTab === 'node' ? 'active' : ''}`}
              onClick={() => { setActiveTab('node'); setPage(1) }}
            >
              {activeTab === 'node' && <span className="tab-bar">|</span>}
              {t('account.nodeRecord')}
            </span>
            <span
              className={`account-tab ${activeTab === 'reward' ? 'active' : ''}`}
              onClick={() => { setActiveTab('reward'); setPage(1) }}
            >
              {activeTab === 'reward' && <span className="tab-bar">|</span>}
              {t('account.reward')}
            </span>
            <span
              className={`account-tab ${activeTab === 'dramaIpo' ? 'active' : ''}`}
              onClick={() => { setActiveTab('dramaIpo'); setPage(1) }}
            >
              {activeTab === 'dramaIpo' && <span className="tab-bar">|</span>}
              {t('account.dramaIpoRecord')}
              {pendingAgreements.length > 0 && <span className="account-tab-dot" />}
            </span>
          </div>

          <div className="account-table">
            {activeTab === 'dramaIpo' && pendingAgreements.length > 0 && (
              <div className="account-pending-bar">
                <span>{t('dramaIpo.pendingSignTip', { n: pendingAgreements.length })}</span>
                <button type="button" onClick={() => setSignTarget(pendingAgreements[0])}>
                  {t('dramaIpo.goSign')}
                </button>
              </div>
            )}
            {activeTab === 'dramaIpo' && (
              <div className="account-subtabs">
                <span
                  className={`account-subtab ${dramaType === 'AIRDROP' ? 'active' : ''}`}
                  onClick={() => { setDramaType('AIRDROP'); setPage(1) }}
                >
                  {t('dramaIpo.tabAirdrop')}
                </span>
                <span
                  className={`account-subtab ${dramaType === 'USDT' ? 'active' : ''}`}
                  onClick={() => { setDramaType('USDT'); setPage(1) }}
                >
                  {t('dramaIpo.tabDividend')}
                </span>
                <span
                  className={`account-subtab ${dramaType === 'CONTRACT' ? 'active' : ''}`}
                  onClick={() => { setDramaType('CONTRACT'); setPage(1) }}
                >
                  {t('dramaIpo.tabContract')}
                </span>
              </div>
            )}
            <Table
              columns={columnsMap[activeTab]}
              dataSource={currentData?.list ?? []}
              rowKey="id"
              pagination={false}
              size="small"
              loading={tableLoading}
              locale={{ emptyText }}
            />
            {(currentData?.total ?? 0) > 0 && (
              <div className="account-pagination">
                <Pagination
                  current={page}
                  total={currentData?.total ?? 0}
                  pageSize={pageSize}
                  onChange={setPage}
                  showSizeChanger={false}
                  showQuickJumper
                  size="small"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 一人可能同时买了多部剧：签完一份自动接上下一份 */}
      <ContractSignModal
        open={!!signTarget}
        target={signTarget}
        onClose={() => setSignTarget(null)}
        onSigned={async () => {
          const rest = await loadPendingAgreements()
          const next = rest.find((p) => p.subscriptionId !== signTarget?.subscriptionId)
          setSignTarget(next ?? null)
          if (dramaType === 'CONTRACT') fetchTab()
        }}
      />

      {viewContract && (
        <div className="contract-view-mask" onClick={() => setViewContract(null)}>
          <div className="contract-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="contract-view-head">
              <span className="contract-view-title">{viewContract.title}</span>
              <button type="button" className="contract-view-close" onClick={() => setViewContract(null)}>×</button>
            </div>
            <div className="contract-view-body contract-doc">
              <div dangerouslySetInnerHTML={{ __html: viewContract.html }} />
            </div>
          </div>
        </div>
      )}

      <Modal
        open={walletTipOpen}
        onCancel={() => setWalletTipOpen(false)}
        footer={null}
        centered
        width={460}
        className="wallet-tip-modal"
      >
        <div className="wallet-tip-content">
          <div className="wallet-tip-icon">
            <ExclamationCircleOutlined />
          </div>
          {connected && (loginFailed || !token) ? (
            <>
              <h3 className="wallet-tip-title">{t('account.loginFailed')}</h3>
              <p className="wallet-tip-desc">{t('account.loginFailedDesc')}</p>
              <Button className="wallet-tip-btn" block onClick={() => { setLoginFailed(false); setWalletTipOpen(false); window.dispatchEvent(new CustomEvent('auth:login')) }}>
                {t('account.retryLogin')}
              </Button>
            </>
          ) : connected && loginLoading ? (
            <>
              <h3 className="wallet-tip-title">{t('account.loginLoading')}</h3>
              <p className="wallet-tip-desc">{t('account.loginLoadingDesc')}</p>
              <Button className="wallet-tip-btn" block onClick={() => setWalletTipOpen(false)}>
                {t('account.understood')}
              </Button>
            </>
          ) : (
            <>
              <h3 className="wallet-tip-title">{t('account.walletRequired')}</h3>
              <p className="wallet-tip-desc">{t('account.walletRequiredDesc')}</p>
              <Button className="wallet-tip-btn" block onClick={() => setWalletTipOpen(false)}>
                {t('account.understood')}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

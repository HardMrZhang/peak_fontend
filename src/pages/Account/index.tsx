import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Table, Pagination, Modal } from 'antd'
import { ExclamationCircleOutlined, InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useWallet } from '@solana/wallet-adapter-react'
import { getBalances, getLedger, getNodeOrders, getReferralRewards, getRewardSummary, getNodeInfo, getMyGenesisNfts } from '@/api'
import type { AssetBalance, LedgerEntry, NodeOrder, ReferralReward, RewardSummary, PageResult } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import './index.css'

type TabKey = 'transaction' | 'node' | 'reward'

export default function Account() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connected } = useWallet()
  const token = useAuthStore((s) => s.token)
  const loginLoading = useAuthStore((s) => s.loginLoading)
  const loginFailed = useAuthStore((s) => s.loginFailed)
  const setLoginFailed = useAuthStore((s) => s.setLoginFailed)
  const [activeTab, setActiveTab] = useState<TabKey>('transaction')
  const [page, setPage] = useState(1)
  const [walletTipOpen, setWalletTipOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(true)
  const pageSize = 10

  const [balances, setBalances] = useState<AssetBalance[]>([])
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null)
  const [ledgerData, setLedgerData] = useState<PageResult<LedgerEntry> | null>(null)
  const [nodeData, setNodeData] = useState<PageResult<NodeOrder> | null>(null)
  const [rewardData, setRewardData] = useState<PageResult<ReferralReward> | null>(null)
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
    } else {
      getReferralRewards({ page, pageSize }).then((r) => setRewardData(r.data)).catch(() => { }).finally(done)
    }
  }, [token, activeTab, page, pageSize])

  useEffect(() => { fetchTab() }, [fetchTab])

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
  const totalLocked = rewardSummary ? Number(rewardSummary.totalLocked).toFixed(2) : '0.00'
  const totalReleased = rewardSummary ? Number(rewardSummary.totalReleased).toFixed(2) : '0.00'
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

  const currentData = activeTab === 'transaction' ? ledgerData : activeTab === 'node' ? nodeData : rewardData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnsMap: Record<TabKey, ColumnsType<any>> = { transaction: transactionColumns, node: nodeColumns, reward: rewardColumns }

  return (
    <div className="account-page">
      {noticeOpen && (
        <div className="sp-notice-mask" onClick={() => setNoticeOpen(false)}>
          <div className="sp-notice-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sp-notice-close" onClick={() => setNoticeOpen(false)} aria-label="close">
              ×
            </button>
            <h3 className="sp-notice-title">影视节点福利倒计时｜6月30日全面停售</h3>
            <p className="sp-notice-time">发布时间：2026-06-16 00:00:00</p>
            <div className="sp-notice-body">
              <p>各位合作伙伴、渠道同仁：</p>
              <p>影视专属节点优惠政策将于2026年6月30日24:00全面关闭销售通道，截止后所有节点专属福利、折扣权益、配套扶持政策同步停止。</p>
              <p>本次节点专属福利包含项目优惠认购、额外增值权益、配套扶持资源等多重专属利好，是平台启动的福利性政策。距离截止仅剩最后窗口期，望各位抓紧申购，避免错过优惠。</p>
              <p className="sp-notice-strong">重要提示</p>
              <ol className="sp-notice-list">
                <li>所有认购均需在6月30日24点前全部办结，逾期系统自动关闭通道，无法补办节点优惠；</li>
                <li>截止后统一恢复常规标准政策，不再享受本次节点全部让利福利；</li>
                <li>如有签约流程疑问，请及时联系对接专员加急处理。</li>
              </ol>
              <p>请大家把握最后机遇，全力冲刺节点业绩！</p>
              <div className="sp-notice-signature">
                <span>PEAK.TV影视运营部</span>
                <span>2026年6月16日</span>
              </div>
            </div>
            <button type="button" className="sp-notice-confirm" onClick={() => setNoticeOpen(false)}>
              我已知晓
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
              <Button className="withdraw-btn" onClick={() => handleWalletAction('/account/withdrawal')}>{t('account.withdrawal')}</Button>
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
          </div>

          <div className="account-table">
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

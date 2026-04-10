/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Table, Pagination, Tabs, message, Spin } from 'antd'
import { CopyOutlined, TeamOutlined, BarChartOutlined, InboxOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { getReferralInfo, getRanking, getDirectReferrals, getReferralRewards, getTeamNodes } from '@/api'
import type { ReferralInfo, RankRecord, PageResult, ReferralReward, DirectReferralRecord, TeamNodeRecord } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import logoImg from '@/assets/logo.png'
import './index.css'

const rankMedals = ['🥇', '🥈', '🥉']
type TabKey = 'rewards' | 'directs' | 'team' | 'ranking'

function formatDate(iso?: string) {
  if (!iso) return '--'
  return new Date(iso).toLocaleString()
}

function formatRewardType(type?: 'DIRECT' | 'TEAM', t?: (k: string) => string) {
  if (type === 'DIRECT') return t ? t('generalization.rewardType.direct') : 'Direct'
  if (type === 'TEAM') return t ? t('generalization.rewardType.team') : 'Team'
  return '--'
}

export default function Generalization() {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const [tab, setTab] = useState<TabKey>('rewards')

  const [rewardPage, setRewardPage] = useState(1)
  const [directPage, setDirectPage] = useState(1)
  const [teamPage, setTeamPage] = useState(1)
  const [rankPage, setRankPage] = useState(1)

  const pageSize = 15
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [rankData, setRankData] = useState<PageResult<RankRecord> | null>(null)
  const [rewardData, setRewardData] = useState<PageResult<ReferralReward> | null>(null)
  const [directData, setDirectData] = useState<PageResult<DirectReferralRecord> | null>(null)
  const [teamData, setTeamData] = useState<PageResult<TeamNodeRecord> | null>(null)

  const [infoLoading, setInfoLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)

  useEffect(() => {
    if (!token) { setInfoLoading(false); return }
    setInfoLoading(true)
    getReferralInfo().then((r) => setInfo(r.data)).catch(() => { }).finally(() => setInfoLoading(false))
  }, [token])

  const fetchRanking = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    getRanking({ page: rankPage, pageSize }).then((r) => setRankData(r.data)).catch(() => { }).finally(() => setTableLoading(false))
  }, [token, rankPage, pageSize])

  const fetchRewards = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    getReferralRewards({ page: rewardPage, pageSize }).then((r) => setRewardData(r.data)).catch(() => { }).finally(() => setTableLoading(false))
  }, [token, rewardPage, pageSize])

  const fetchDirects = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    getDirectReferrals({ page: directPage, pageSize }).then((r) => setDirectData(r.data)).catch(() => { }).finally(() => setTableLoading(false))
  }, [token, directPage, pageSize])

  const fetchTeamNodes = useCallback(() => {
    if (!token) return
    setTableLoading(true)
    getTeamNodes({ page: teamPage, pageSize }).then((r) => setTeamData(r.data)).catch(() => { }).finally(() => setTableLoading(false))
  }, [token, teamPage, pageSize])

  useEffect(() => {
    if (tab === 'rewards') fetchRewards()
    if (tab === 'directs') fetchDirects()
  }, [tab, fetchRewards, fetchDirects])

  useEffect(() => {
    fetchTeamNodes()
  }, [fetchTeamNodes])

  useEffect(() => {
    fetchRanking()
  }, [fetchRanking])

  const emptyText = (
    <div className="table-empty">
      <InboxOutlined className="table-empty-icon" />
      <span className="table-empty-text">{t('common.noData')}</span>
    </div>
  )

  const rankingColumns: ColumnsType<RankRecord> = [
    {
      title: t('generalization.colRank'),
      dataIndex: 'rank',
      width: 60,
      render: (v: number) => (
        <span className="rank-cell">
          {v <= 3 ? <span className="rank-medal">{rankMedals[v - 1]}</span> : v}
        </span>
      ),
    },
    { title: t('generalization.colUserAddr'), dataIndex: 'address', ellipsis: true, width: 160 },
    {
      title: t('generalization.colTotalPeak'),
      dataIndex: 'totalPeak',
      width: 140,
      align: 'right',
      render: (v: string) => `${v} USDT`,
    },
  ]

  const directColumns: ColumnsType<DirectReferralRecord> = [
    { title: t('generalization.colUserAddr'), dataIndex: 'walletAddress', ellipsis: true, width: 140 },
    { title: t('generalization.directPushNode'), dataIndex: 'nodeQty', width: 80, align: 'right' },
    {
      title: t('generalization.directPushReward'),
      dataIndex: 'rewardAmount',
      width: 120,
      align: 'right',
      render: (v: string) => `${v} USDT`,
    },
    {
      title: t('generalization.colJoinTime'),
      dataIndex: 'joinedAt',
      width: 150,
      render: (v: string) => formatDate(v),
    },
  ]

  const rewardColumns: ColumnsType<ReferralReward> = [
    { title: t('generalization.colRewardNo'), dataIndex: 'rewardNo', width: 130, ellipsis: true },
    {
      title: t('generalization.colRewardType'),
      dataIndex: 'rewardType',
      width: 110,
      render: (v: 'DIRECT' | 'TEAM') => formatRewardType(v, t),
    },
    { title: t('generalization.colRewardLevel'), dataIndex: 'relationDepth', width: 90, align: 'right' },
    { title: t('generalization.colFromUser'), dataIndex: 'fromUserWallet', width: 140, ellipsis: true },
    { title: t('generalization.colOrderNo'), dataIndex: 'orderNo', width: 130, ellipsis: true },
    { title: t('generalization.colOrderQty'), dataIndex: 'orderQty', width: 80, align: 'right' },
    {
      title: t('generalization.directPushReward'),
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (v: string) => `${v} USDT`,
    },
    {
      title: t('generalization.colRewardTime'),
      dataIndex: 'createdAt',
      width: 150,
      render: (v: string) => formatDate(v),
    },
  ]

  const teamColumns: ColumnsType<TeamNodeRecord> = [
    { title: t('generalization.colUserAddr'), dataIndex: 'walletAddress', ellipsis: true, width: 140 },
    { title: t('generalization.colTeamLevel'), dataIndex: 'level', width: 80, align: 'right' },
    { title: t('generalization.teamNode'), dataIndex: 'nodeQty', width: 80, align: 'right' },
    {
      title: t('generalization.colJoinTime'),
      dataIndex: 'joinedAt',
      width: 150,
      render: (v: string) => formatDate(v),
    },
  ]

  const inviteUrl = info?.referralLink ?? ''
  const addr = info?.walletAddress ?? ''
  const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—'

  const handleCopy = () => {
    if (!inviteUrl) return
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(inviteUrl)
      message.success(t('generalization.copySuccess'))
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = inviteUrl
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      message.success(t('generalization.copySuccess'))
    }
  }

  return (
    <div className="gen-page">
      <div className="gen-inner">
        <h1 className="page-title">{t('generalization.title')}</h1>

        <Spin spinning={infoLoading}>
          <div className="gen-profile">
            <div className="profile-left">
              <img src={logoImg} alt="PEAK" className="profile-avatar" />
              <div className="profile-info">
                <span className="profile-address">{shortAddr}</span>
                <span className="profile-total">{t('generalization.grandTotal')} <strong className="orange">{info?.directPushRewards ?? '0'} USDT</strong></span>
              </div>
            </div>
            <div className="profile-badges">
              <Button className="badge-btn team" icon={<TeamOutlined />}>{t('generalization.teamNode')} {info?.teamNodes ?? 0}</Button>
              <Button className="badge-btn rank" icon={<BarChartOutlined />}>{t('generalization.currentRanking')} {info?.currentRanking ?? '—'}</Button>
            </div>
          </div>

          <div className="invite-section">
            <span className="invite-label">{t('generalization.inviteAddr')}</span>
            <div className="invite-row">
              <span className="invite-url">{inviteUrl || '...'}</span>
              <Button className="copy-btn" icon={<CopyOutlined />} onClick={handleCopy}>{t('generalization.copy')}</Button>
            </div>

            <div className="push-stats">
              <div className="push-stat">
                <span className="push-icon">✦</span>
                <span className="push-label">{t('generalization.directPushNode')}</span>
                <span className="push-value">{info?.directPushNodes ?? 0}</span>
              </div>
              <div className="push-stat">
                <span className="push-icon">◎</span>
                <span className="push-label">{t('generalization.directPushReward')}</span>
                <span className="push-value orange">{info?.directPushRewards ?? '0'} USDT</span>
              </div>
            </div>
          </div>
        </Spin>

        {/* 团队节点 */}
        <div className="leaderboard-section">
          <h2 className="leaderboard-title">
            <span className="leaderboard-icon">👥</span>
            {t('generalization.teamNode')}
          </h2>
          <Table
            columns={teamColumns}
            dataSource={teamData?.list ?? []}
            rowKey={(r) => `${r.walletAddress}-${r.level}-${r.joinedAt}`}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            loading={tableLoading}
            locale={{ emptyText }}
          />
          {(teamData?.total ?? 0) > 0 && (
            <div className="ranking-pagination">
              <Pagination
                current={teamPage}
                total={teamData?.total ?? 0}
                pageSize={pageSize}
                onChange={setTeamPage}
                showSizeChanger={false}
                showQuickJumper
                size="small"
              />
            </div>
          )}
        </div>

        {/* 直推记录 */}
        <div className="ranking-section">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={[
              { key: 'rewards', label: t('generalization.directPushReward') },
              { key: 'directs', label: t('generalization.directPushNode') },
            ]}
          />

          {tab === 'rewards' && (
            <>
              <Table
                columns={rewardColumns}
                dataSource={rewardData?.list ?? []}
                rowKey={(r) => r.id}
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
                loading={tableLoading}
                locale={{ emptyText }}
              />
              {(rewardData?.total ?? 0) > 0 && (
                <div className="ranking-pagination">
                  <Pagination
                    current={rewardPage}
                    total={rewardData?.total ?? 0}
                    pageSize={pageSize}
                    onChange={setRewardPage}
                    showSizeChanger={false}
                    showQuickJumper
                    size="small"
                  />
                </div>
              )}
            </>
          )}

          {tab === 'directs' && (
            <>
              <Table
                columns={directColumns}
                dataSource={directData?.list ?? []}
                rowKey={(r) => `${r.walletAddress}-${r.joinedAt}`}
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
                loading={tableLoading}
                locale={{ emptyText }}
              />
              {(directData?.total ?? 0) > 0 && (
                <div className="ranking-pagination">
                  <Pagination
                    current={directPage}
                    total={directData?.total ?? 0}
                    pageSize={pageSize}
                    onChange={setDirectPage}
                    showSizeChanger={false}
                    showQuickJumper
                    size="small"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* 排行榜 */}
        <div className="leaderboard-section">
          <h2 className="leaderboard-title">
            <span className="leaderboard-icon">🏆</span>
            {t('generalization.rankingList')}
          </h2>
          <Table
            columns={rankingColumns}
            dataSource={rankData?.list ?? []}
            rowKey={(r) => `${r.rank}-${r.address}`}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            loading={tableLoading}
            locale={{ emptyText }}
          />
          {(rankData?.total ?? 0) > 0 && (
            <div className="ranking-pagination">
              <Pagination
                current={rankPage}
                total={rankData?.total ?? 0}
                pageSize={pageSize}
                onChange={setRankPage}
                showSizeChanger={false}
                showQuickJumper
                size="small"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

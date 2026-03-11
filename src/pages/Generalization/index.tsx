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
      width: 80,
      render: (v: number) => (
        <span className="rank-cell">
          {v <= 3 ? <span className="rank-medal">{rankMedals[v - 1]}</span> : v}
        </span>
      ),
    },
    { title: t('generalization.colUserAddr'), dataIndex: 'address', ellipsis: true },
    {
      title: t('generalization.colTotalPeak'),
      dataIndex: 'totalPeak',
      width: 300,
      align: 'right',
      render: (v: string) => `${v} PEAK`,
    },
  ]

  const directColumns: ColumnsType<DirectReferralRecord> = [
    { title: t('generalization.colUserAddr'), dataIndex: 'walletAddress', ellipsis: true },
    { title: t('generalization.directPushNode'), dataIndex: 'nodeQty', width: 180, align: 'right' },
    {
      title: t('generalization.directPushReward'),
      dataIndex: 'rewardAmount',
      width: 220,
      align: 'right',
      render: (v: string) => `${v} USDT`,
    },
    {
      title: t('generalization.colJoinTime'),
      dataIndex: 'joinedAt',
      width: 220,
      render: (v: string) => formatDate(v),
    },
  ]

  const rewardColumns: ColumnsType<ReferralReward> = [
    { title: t('generalization.colRewardNo'), dataIndex: 'rewardNo', width: 180, ellipsis: true },
    { title: t('generalization.colRewardLevel'), dataIndex: 'rewardLevel', width: 120, align: 'right' },
    { title: t('generalization.colFromUser'), dataIndex: 'fromUserWallet', ellipsis: true },
    { title: t('generalization.colOrderNo'), dataIndex: 'orderNo', width: 160, ellipsis: true },
    { title: t('generalization.colOrderQty'), dataIndex: 'orderQty', width: 120, align: 'right' },
    {
      title: t('generalization.directPushReward'),
      dataIndex: 'amount',
      width: 180,
      align: 'right',
      render: (v: string) => `${v} USDT`,
    },
    {
      title: t('generalization.colRewardTime'),
      dataIndex: 'createdAt',
      width: 220,
      render: (v: string) => formatDate(v),
    },
  ]

  const teamColumns: ColumnsType<TeamNodeRecord> = [
    { title: t('generalization.colUserAddr'), dataIndex: 'walletAddress', ellipsis: true },
    { title: t('generalization.colTeamLevel'), dataIndex: 'level', width: 120, align: 'right' },
    { title: t('generalization.teamNode'), dataIndex: 'nodeQty', width: 180, align: 'right' },
    {
      title: t('generalization.colJoinTime'),
      dataIndex: 'joinedAt',
      width: 220,
      render: (v: string) => formatDate(v),
    },
  ]

  const inviteUrl = info?.referralLink ?? ''
  const addr = info?.walletAddress ?? ''
  const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—'

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl)
    message.success(t('generalization.copySuccess'))
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

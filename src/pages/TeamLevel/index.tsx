import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Spin } from 'antd'
import {
  CrownOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  LockOutlined,
  StarOutlined,
} from '@ant-design/icons'
import { getTeamLevelInfo } from '@/api'
import type { TeamLevelInfo } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import './index.css'

const RULES_TABLE = [
  { key: 'level5', salesNodes: 500, wallets: 800, direct: '10%', commission: '20%', lock: 60, points: 6 },
  { key: 'level4', salesNodes: 150, wallets: 200, direct: '10%', commission: '15%', lock: 120, points: 5 },
  { key: 'level3', salesNodes: 50, wallets: 100, direct: '10%', commission: '12%', lock: 180, points: 4 },
  { key: 'level2', salesNodes: 15, wallets: 30, direct: '10%', commission: '8%', lock: 240, points: 3 },
  { key: 'level1', salesNodes: 5, wallets: 10, direct: '10%', commission: '5%', lock: 300, points: 2 },
]

const LEVEL_COLORS: Record<number, string> = {
  5: '#f5a623',
  4: '#52c41a',
  3: '#1890ff',
  2: '#722ed1',
  1: '#13c2c2',
}

export default function TeamLevel() {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const [info, setInfo] = useState<TeamLevelInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    getTeamLevelInfo()
      .then((r) => setInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const currentLevelLabel = info
    ? info.level < 0
      ? t('teamLevel.normalUser')
      : info.label
    : '--'

  const currentLevelNum = info?.level ?? -1

  return (
    <div className="team-level-page">
      <div className="team-level-inner">
        <h1 className="page-title">{t('teamLevel.title')}</h1>
        <p className="team-level-subtitle">{t('teamLevel.subtitle')}</p>

        {/* 我的团队等级卡片 */}
        <Spin spinning={loading}>
          <div className="my-level-section">
            <h2 className="section-title-tl">
              <CrownOutlined className="section-icon" />
              {t('teamLevel.myTeamLevel')}
            </h2>
            <div className="level-cards">
              <div className="level-card level-card-main">
                <div className="level-badge-wrap">
                  <div
                    className="level-badge"
                    style={{
                      background: currentLevelNum >= 1
                        ? `linear-gradient(135deg, ${LEVEL_COLORS[currentLevelNum] || '#f5a623'}, ${LEVEL_COLORS[currentLevelNum] || '#f5a623'}88)`
                        : 'linear-gradient(135deg, #555, #333)',
                    }}
                  >
                    <CrownOutlined className="level-badge-icon" />
                    <span className="level-badge-text">{currentLevelLabel}</span>
                  </div>
                </div>
                <div className="level-meta">
                  <span className="level-meta-label">{t('teamLevel.currentLevel')}</span>
                  <span className="level-meta-value">{currentLevelLabel}</span>
                </div>
              </div>

              <div className="level-card">
                <TeamOutlined className="level-card-icon" />
                <span className="level-card-label">{t('teamLevel.teamNftCount')}</span>
                <span className="level-card-value orange">{info?.teamNftCount ?? '--'}</span>
              </div>

              <div className="level-card">
                <SafetyCertificateOutlined className="level-card-icon" />
                <span className="level-card-label">{t('teamLevel.ownNftCount')}</span>
                <span className="level-card-value">{info?.ownNftCount ?? '--'}</span>
              </div>

              <div className="level-card">
                <ThunderboltOutlined className="level-card-icon" />
                <span className="level-card-label">{t('teamLevel.commissionRate')}</span>
                <span className="level-card-value orange">
                  {info ? `${(info.commissionRate * 100).toFixed(0)}%` : '--'}
                </span>
              </div>

              <div className="level-card">
                <LockOutlined className="level-card-icon" />
                <span className="level-card-label">{t('teamLevel.lockDays')}</span>
                <span className="level-card-value">
                  {info ? `${info.lockDays}${t('teamLevel.days')}` : '--'}
                </span>
              </div>

              <div className="level-card">
                <StarOutlined className="level-card-icon" />
                <span className="level-card-label">{t('teamLevel.pointsMultiplier')}</span>
                <span className="level-card-value orange">
                  {info ? `${info.pointsMultiplier}${t('teamLevel.times')}` : '--'}
                </span>
              </div>
            </div>
          </div>
        </Spin>

        {/* 等级规则表 */}
        <div className="rules-section">
          <h2 className="section-title-tl">
            <StarOutlined className="section-icon" />
            {t('teamLevel.rulesTitle')}
          </h2>

          <div className="rules-table-wrap">
            <table className="rules-table">
              <thead>
                <tr>
                  <th>{t('teamLevel.colLevel')}</th>
                  <th>{t('teamLevel.colSalesNodes')}</th>
                  <th>{t('teamLevel.colDownlineWallets')}</th>
                  <th>{t('teamLevel.colDirectPush')}</th>
                  <th className="col-commission">{t('teamLevel.colCommission')}</th>
                  <th>{t('teamLevel.colLockPeriod')}</th>
                  <th>{t('teamLevel.colPoints')}</th>
                </tr>
              </thead>
              <tbody>
                {RULES_TABLE.map((row, idx) => {
                  const levelNum = 5 - idx
                  const isActive = currentLevelNum === levelNum
                  return (
                    <tr key={row.key} className={isActive ? 'active-row' : ''}>
                      <td>
                        <span
                          className="level-tag"
                          style={{ borderColor: LEVEL_COLORS[levelNum], color: LEVEL_COLORS[levelNum] }}
                        >
                          {t(`teamLevel.${row.key}`)}
                        </span>
                      </td>
                      <td>{row.salesNodes}</td>
                      <td>{row.wallets}</td>
                      <td>{row.direct}</td>
                      <td className="col-commission-val">{row.commission}</td>
                      <td>{row.lock}{t('teamLevel.days')}</td>
                      <td>{row.points}{t('teamLevel.times')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 规则说明 */}
        <div className="rules-desc-section">
          <div className="rules-desc-list">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="rules-desc-item">
                <span className="rules-desc-num">{n}</span>
                <span className="rules-desc-text">{t(`teamLevel.ruleDesc${n}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

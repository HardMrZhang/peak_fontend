import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { getDramaHistory, getDramaProjects } from '@/api'
import type { DramaHistoryRecord, DramaProject } from '@/types'
import './index.css'

const PAGE_SIZE = 10

/**
 * 历史查询，分两档：
 * 1. 认购记录：按钱包地址或剧目编号查认购记录（公开接口，地址服务端打码）；
 * 2. 售罄剧目：认购满的剧目从首页下拉移到这里展示。
 */
export default function DramaIpoHistory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<'records' | 'soldOut'>('records')
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [list, setList] = useState<DramaHistoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [soldOut, setSoldOut] = useState<DramaProject[]>([])

  const runSearch = useCallback(async (rawKeyword: string, targetPage: number) => {
    const q = rawKeyword.trim()
    if (!q) {
      message.warning(t('dramaIpo.searchRequired'))
      return
    }
    setLoading(true)
    try {
      // 纯数字或 CGSX 开头视为剧目编号（如 CGSX00001），其余按钱包地址查
      const isDigits = /^\d+$/.test(q)
      const isSerial = isDigits || /^CGSX\d+$/i.test(q)
      const serialNo = isDigits ? `CGSX${q.padStart(5, '0')}` : q.toUpperCase()
      const res = await getDramaHistory({
        ...(isSerial ? { serialNo } : { wallet: q }),
        page: targetPage,
        pageSize: PAGE_SIZE,
      })
      setList(res.data?.list ?? [])
      setTotal(res.data?.total ?? 0)
      setPage(targetPage)
    } catch {
      setList([])
      setTotal(0)
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [t])

  const handleSearch = () => {
    setSearchParams(keyword.trim() ? { q: keyword.trim() } : {})
    runSearch(keyword, 1)
  }

  // 带 ?q= 进来时直接查一次，方便从外部分享链接跳转
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) runSearch(q, 1)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  // 售罄剧目列表（公开接口）。售罄后先在首页停留 48h，超过 48h 才进入这里
  useEffect(() => {
    const LINGER_MS = 48 * 60 * 60 * 1000
    getDramaProjects({ page: 1, pageSize: 50 })
      .then((res) => setSoldOut((res.data?.list ?? []).filter((p) => (
        p.status === 'SOLD_OUT'
        && !!p.soldOutAt
        && Date.now() - new Date(p.soldOutAt).getTime() >= LINGER_MS
      ))))
      .catch(() => {})
  }, [])

  // 点击售罄剧目直接切到认购记录档并按编号查询
  const searchBySerial = (serialNo: string) => {
    setTab('records')
    setKeyword(serialNo)
    setSearchParams({ q: serialNo })
    runSearch(serialNo, 1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="drama-page">
      <div className="di-wrap">
        <div className="di-topbar">
          <div>
            <div className="di-page-title">{t('dramaIpo.historyTitle')}</div>
            <div className="di-page-sub">{t('dramaIpo.historySubtitle')}</div>
          </div>
          <button type="button" className="di-link-btn" onClick={() => navigate('/drama-ipo')}>
            {t('dramaIpo.backToIpo')}
          </button>
        </div>

        <div className="di-htabs">
          <button
            type="button"
            className={`di-htab${tab === 'records' ? ' active' : ''}`}
            onClick={() => setTab('records')}
          >
            {t('dramaIpo.historyTabRecords')}
          </button>
          <button
            type="button"
            className={`di-htab${tab === 'soldOut' ? ' active' : ''}`}
            onClick={() => setTab('soldOut')}
          >
            {t('dramaIpo.historyTabSoldOut')}
            {soldOut.length > 0 ? ` (${soldOut.length})` : ''}
          </button>
        </div>

        {tab === 'soldOut' ? (
          <section className="di-card">
            {soldOut.length === 0 ? (
              <div className="di-empty">{t('dramaIpo.noSoldOut')}</div>
            ) : (
              <div className="di-soldout-list">
                {soldOut.map((p) => (
                  <button
                    key={p.serialNo}
                    type="button"
                    className="di-tab"
                    onClick={() => searchBySerial(p.serialNo)}
                  >
                    <span className="di-tab-main">
                      <span className="di-tab-label">{t('dramaIpo.dramaLabel')}:</span>
                      {p.posterUrl
                        ? <img className="di-tab-poster" src={p.posterUrl} alt="" />
                        : <span className="di-tab-poster" />}
                      <span className="di-tab-info">
                        <span className="di-tab-name">{p.name}</span>
                        <span className="di-tab-meta">{p.serialNo}</span>
                      </span>
                      <span className="di-tab-status">{t('dramaIpo.status.SOLD_OUT')}</span>
                    </span>
                    <span className="di-tab-progress">
                      <span className="di-tab-progress-label">{t('dramaIpo.soldProgress')}</span>
                      <span className="di-tab-progress-bar">
                        <span className="di-tab-progress-fill" style={{ width: '100%' }} />
                      </span>
                      <span className="di-tab-progress-text">
                        {p.soldShares}/{p.totalShares} {t('dramaIpo.shareUnit')}
                        <span className="di-tab-progress-pct">100%</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
        <section className="di-card">
          <div className="di-search-bar">
            <input
              className="di-search-input"
              value={keyword}
              placeholder={t('dramaIpo.searchPlaceholder')}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            />
            <button type="button" className="di-search-btn" onClick={handleSearch} disabled={loading}>
              {loading ? t('dramaIpo.searching') : t('dramaIpo.search')}
            </button>
          </div>

          {!searched ? (
            <div className="di-empty">{t('dramaIpo.searchHint')}</div>
          ) : list.length === 0 ? (
            <div className="di-empty">{t('dramaIpo.noHistory')}</div>
          ) : (
            <>
              <div className="di-record-list">
                {list.map((item) => (
                  <div key={item.subNo} className="di-record-card">
                    <div className="di-record-head">
                      <span className="di-record-title">
                        {item.serialNo} · {item.projectName}
                      </span>
                      <span className="di-record-time">
                        {item.createdAt.slice(0, 19).replace('T', ' ')}
                      </span>
                    </div>

                    <div className="di-record-grid">
                      <div className="di-record-item">
                        {t('dramaIpo.subWallet')}: <b>{item.walletAddress}</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.subShares')}: <b>{item.shares} {t('dramaIpo.shareUnit')}</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.subAmount')}: <b>{Number(item.amountUsdt).toLocaleString()} USDT</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.gotPeak')}: <b>{Number(item.airdropTotal).toLocaleString()} {item.rewardAsset ?? 'PEAK'}</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.releasedPeak')}: <b>{Number(item.airdropReleased).toLocaleString()} {item.rewardAsset ?? 'PEAK'}</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.dividendTotal')}: <b>{Number(item.dividendTotalUsdt).toLocaleString()} USDT</b>
                      </div>
                    </div>

                    {item.dividends.length > 0 ? (
                      <div className="di-dividend-row">
                        {item.dividends.map((d) => (
                          <span
                            key={d.periodNo}
                            className={`di-dividend-chip${d.status === 'PAID' ? ' paid' : ''}`}
                          >
                            {t('dramaIpo.periodNo', { n: d.periodNo })} {Number(d.amountUsdt).toFixed(2)} U
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="di-pager">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => runSearch(keyword, page - 1)}
                  >
                    {t('dramaIpo.prevPage')}
                  </button>
                  <span>{page} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => runSearch(keyword, page + 1)}
                  >
                    {t('dramaIpo.nextPage')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { getDramaHistory } from '@/api'
import type { DramaHistoryRecord } from '@/types'
import './index.css'

const PAGE_SIZE = 10

/**
 * 历史查询：按钱包地址或剧目编号查认购记录。
 * 公开接口，未登录也能查；地址在服务端已做中间打码。
 */
export default function DramaIpoHistory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [list, setList] = useState<DramaHistoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

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
                        {t('dramaIpo.gotPeak')}: <b>{Number(item.airdropTotal).toLocaleString()} PEAK</b>
                      </div>
                      <div className="di-record-item">
                        {t('dramaIpo.releasedPeak')}: <b>{Number(item.airdropReleased).toLocaleString()} PEAK</b>
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
      </div>
    </div>
  )
}

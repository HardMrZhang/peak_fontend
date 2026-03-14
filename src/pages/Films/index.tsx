import { useEffect, useState } from 'react'
import { Carousel } from 'antd'
import { useTranslation } from 'react-i18next'
import CountdownTimer from '@/components/CountdownTimer'
import { getBanners } from '@/api'
import type { Banner } from '@/types'
import { NODE_TRADE_DATE } from '@/constants'
import logoImg from '@/assets/logo.png'
import shortDramaImg from '@/assets/short-drama.png'
import './index.css'

const fallbackBanners = [
  { id: '1', mediaUrl: 'https://image.tmdb.org/t/p/original/8BTsTfln4jlQrLXUBquXJ0ASQy9.jpg', mediaType: 'IMAGE' as const, title: null, targetUrl: null, sortOrder: 0 },
  { id: '2', mediaUrl: 'https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg', mediaType: 'IMAGE' as const, title: null, targetUrl: null, sortOrder: 1 },
  { id: '3', mediaUrl: 'https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', mediaType: 'IMAGE' as const, title: null, targetUrl: null, sortOrder: 2 },
]

export default function Films() {
  const { t, i18n } = useTranslation()
  const [banners, setBanners] = useState<Banner[]>(fallbackBanners)

  useEffect(() => {
    getBanners(i18n.language).then((res) => {
      if (res.data?.length) setBanners(res.data)
    }).catch(() => { })
  }, [i18n.language])

  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())
  const [failedBanners, setFailedBanners] = useState<Set<string>>(new Set())

  const handleImageError = (index: number) => {
    setFailedImages((prev) => new Set(prev).add(index))
  }

  const contentCards = [
    { title: t('films.shortDrama'), desc: t('films.shortDramaDesc'), image: shortDramaImg },
    { title: t('films.videoEditing'), desc: t('films.videoEditingDesc'), image: 'https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
    { title: t('films.tvSeries'), desc: t('films.tvSeriesDesc'), image: 'https://m.media-amazon.com/images/M/MV5BMzU5ZGYzNmQtMTdhYy00OGRiLTg0NmQtYjVjNzliZTg1ZGE4XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
    { title: t('films.aiAnime'), desc: t('films.aiAnimeDesc'), image: 'https://m.media-amazon.com/images/M/MV5BMjIwMjE1Nzc4NV5BMl5BanBnXkFtZTgwNDg4OTA1NzM@._V1_FMjpg_UX1000_.jpg' },
  ]

  return (
    <div className="films-page">
      <section className="hero-section">
        <Carousel autoplay effect="fade" dots={{ className: 'hero-dots' }}>
          {banners.map((b) => (
            <div key={b.id}>
              <div
                className="hero-slide"
                style={failedBanners.has(b.id) ? {} : { backgroundImage: `url(${b.mediaUrl})` }}
              >
                <img
                  src={b.mediaUrl}
                  alt=""
                  style={{ display: 'none' }}
                  onError={() => setFailedBanners((prev) => new Set(prev).add(b.id))}
                />
                <div className="hero-overlay" />
              </div>
            </div>
          ))}
        </Carousel>
      </section>

      <section className="peak-bar">
        <div className="peak-bar-inner">
          <div className="peak-bar-left">
            <span className="peak-bar-title">{t('films.online')}</span>
            <span className="peak-bar-online">{t('films.onlineTag')}</span>
            <CountdownTimer targetDate={NODE_TRADE_DATE} />
          </div>
          <div className="peak-bar-right">
            <img src={logoImg} alt="PEAK" className="peak-bar-logo" />
            <span className="peak-bar-label">PEAK</span>
            <div className="peak-bar-tags">
              <span className="tag tag-film">{t('films.tagFilm')}</span>
              <span className="tag tag-node">{t('films.tagNode')}</span>
              <span className="tag tag-nft">{t('films.tagNft')}</span>
              <span className="tag tag-trade">{t('films.tagTrade')}</span>
            </div>
          </div>
        </div>
        <div className="peak-bar-sub" />
      </section>

      <section className="content-section">
        <div className="content-grid">
          {contentCards.map((card, i) => (
            <div key={i} className="content-card">
              <div className="content-card-image">
                {failedImages.has(i) ? (
                  <div className="content-card-placeholder">
                    <img src={logoImg} alt="PEAK" className="content-card-placeholder-logo" />
                  </div>
                ) : (
                  <img
                    src={card.image}
                    alt={card.title}
                    className="content-card-img"
                    onError={() => handleImageError(i)}
                  />
                )}
              </div>
              <h3 className="content-card-title">{card.title}</h3>
              <p className="content-card-desc">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { AppleFilled, AndroidFilled, CheckOutlined } from '@ant-design/icons'
import { ANDROID_APK_URL } from '@/constants'
import logoImg from '@/assets/logo.png'
import './index.css'

export default function Download() {
  const { t } = useTranslation()

  const features = [
    t('download.feature1'),
    t('download.feature2'),
    t('download.feature3'),
    t('download.feature4'),
    t('download.feature5'),
    t('download.feature6'),
  ]

  return (
    <div className="download-page">
      <div className="download-glow" />
      <div className="download-inner">
        <section className="download-hero">
          <img src={logoImg} alt="Peak TV" className="download-logo" />
          <h1 className="download-title">{t('download.title')}</h1>
          <p className="download-subtitle">{t('download.subtitle')}</p>
        </section>

        <section className="download-intro glow-card">
          <h2 className="download-intro-title">{t('download.introTitle')}</h2>
          <ul className="download-feature-list">
            {features.map((text, i) => (
              <li key={i} className="download-feature">
                <span className="download-feature-icon">
                  <CheckOutlined />
                </span>
                <span className="download-feature-text">{text}</span>
              </li>
            ))}
          </ul>

          <div className="download-actions">
            <button className="download-btn download-btn-ios" title={t('download.comingSoon')}>
              <AppleFilled />
              <span>{t('download.iosBtn')}</span>
            </button>
            <a
              className="download-btn download-btn-android"
              href={ANDROID_APK_URL}
              download
            >
              <AndroidFilled />
              <span>{t('download.androidBtn')}</span>
            </a>
          </div>
          <p className="download-hint">{t('download.androidHint')}</p>
        </section>
      </div>
    </div>
  )
}

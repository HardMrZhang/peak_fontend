import { useTranslation } from 'react-i18next'
import logoImg from '@/assets/logo.png'
import ironman3Img from '@/assets/ironman3_poster.png'
import wukongImg from '@/assets/wukong_poster.png'
import './index.css'

interface ProjectItem {
  titleKey: string
  posterImg: string
  posterLabel: string
  fields: { labelKey: string; value: string }[]
}

const PROJECTS: ProjectItem[] = [
  {
    titleKey: 'ipo.project1Title',
    posterImg: ironman3Img,
    posterLabel: 'ipo.project1Poster',
    fields: [
      { labelKey: 'ipo.fieldProject', value: 'ipo.project1Name' },
      { labelKey: 'ipo.fieldPlot', value: 'ipo.project1Plot' },
      { labelKey: 'ipo.fieldDirector', value: 'ipo.project1Director' },
      { labelKey: 'ipo.fieldDuration', value: 'ipo.project1Duration' },
      { labelKey: 'ipo.fieldTotal', value: '10,000,000 PEAK' },
      { labelKey: 'ipo.fieldSlots', value: '2000' },
      { labelKey: 'ipo.fieldRegTime', value: '2026/06/23  AM 10:00:00' },
      { labelKey: 'ipo.fieldEndTime', value: '2026/06/30  AM 09:59:59' },
      { labelKey: 'ipo.fieldDrawTime', value: '2026/07/01  AM 10:00:00' },
      { labelKey: 'ipo.fieldPayoutTime', value: '2026/07/31  AM 10:00:00' },
    ],
  },
  {
    titleKey: 'ipo.project2Title',
    posterImg: wukongImg,
    posterLabel: 'ipo.project2Poster',
    fields: [
      { labelKey: 'ipo.fieldProject', value: 'ipo.project2Name' },
      { labelKey: 'ipo.fieldPlot', value: 'ipo.project2Plot' },
      { labelKey: 'ipo.fieldDirector', value: 'ipo.project2Director' },
      { labelKey: 'ipo.fieldDuration', value: 'ipo.project2Duration' },
      { labelKey: 'ipo.fieldTotal', value: '10,000,000 PEAK' },
      { labelKey: 'ipo.fieldSlots', value: '2000' },
      { labelKey: 'ipo.fieldRegTime', value: '2026/06/23  AM 10:00:00' },
      { labelKey: 'ipo.fieldEndTime', value: '2026/06/30  AM 09:59:59' },
      { labelKey: 'ipo.fieldDrawTime', value: '2026/07/01  AM 10:00:00' },
      { labelKey: 'ipo.fieldPayoutTime', value: '2026/07/31  AM 10:00:00' },
    ],
  },
]

export default function Ipo() {
  const { t } = useTranslation()

  return (
    <div className="ipo-page">
      <div className="ipo-header">
        <img src={logoImg} alt="Peak" className="ipo-logo" />
        <h1 className="ipo-title">{t('ipo.title')}</h1>
        <p className="ipo-subtitle">{t('ipo.subtitle')}</p>
      </div>

      <div className="ipo-projects">
        {PROJECTS.map((project, idx) => (
          <div className="ipo-project-card" key={idx}>
            <div className="ipo-project-poster">
              <img src={project.posterImg} alt={t(project.titleKey)} className="ipo-poster-img" />
              <div className="ipo-poster-overlay">
                <span className="ipo-poster-label">{t(project.posterLabel)}</span>
              </div>
            </div>
            <div className="ipo-project-info">
              {project.fields.map((field, fi) => {
                const isPlot = field.labelKey === 'ipo.fieldPlot'
                const val = field.value.startsWith('ipo.') ? t(field.value) : field.value
                return (
                  <div className={`ipo-field ${isPlot ? 'ipo-field-plot' : ''}`} key={fi}>
                    <span className="ipo-field-label">{t(field.labelKey)}</span>
                    <span className="ipo-field-value">{val}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

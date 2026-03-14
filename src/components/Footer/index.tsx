import { useTranslation } from 'react-i18next'
import './index.css'

export default function Footer() {
  const { t, i18n } = useTranslation()
  const whitepaperUrl = i18n.language?.startsWith('zh')
    ? '/PEAK-Whitepaper-zh.docx'
    : '/PEAK-Whitepaper-en.docx'

  const socialLinks = [
    { label: 'X', url: 'https://x.com/peak_solana' },
    { label: 'Telegram', url: '#' },
    { label: 'Email', url: 'mailto:peakpeaknode@gmail.com' },
    { label: 'White paper', url: whitepaperUrl },
  ]

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-contact">{t('footer.contact')}</span>
        {socialLinks.map((link, i) => (
          <a key={i} href={link.url} className="footer-link" target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
        <span className="footer-copyright">{t('footer.copyright')}</span>
      </div>
    </footer>
  )
}

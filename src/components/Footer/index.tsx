import { useTranslation } from 'react-i18next'
import './index.css'

export default function Footer() {
  const { t, i18n } = useTranslation()
  const whitepaperUrl = i18n.language?.startsWith('zh')
    ? '/PEAK-Whitepaper-zh.docx'
    : '/PEAK-Whitepaper-en.docx'

  const socialLinks = [
    { label: t('footer.x'), url: 'https://x.com/peak_solana' },
    { label: t('footer.telegram'), url: 'https://t.me/PEAK_Solana' },
    { label: t('footer.email'), url: 'mailto:peakpeaknode@gmail.com' },
    { label: t('footer.whitePaper'), url: whitepaperUrl },
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

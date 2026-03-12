import { useTranslation } from 'react-i18next'
import './index.css'

const socialLinks = [
  { label: 'X', icon: '𝕏', url: '#' },
  { label: 'Telegram', icon: '●', url: '#' },
  { label: 'Email', icon: '✉', url: '#' },
  { label: 'White paper', icon: '■', url: '#' },
]

export default function Footer() {
  const { t } = useTranslation()
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

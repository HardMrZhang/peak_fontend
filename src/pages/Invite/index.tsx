import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'

export default function InvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()

  useEffect(() => {
    const raw = (code || '').trim()
    if (!raw) {
      navigate('/films', { replace: true })
      return
    }
    const inviteCode = normalizeInviteCode(raw)
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, inviteCode)
    message.success(t('invite.codeRecorded'))
    navigate('/films', { replace: true })
  }, [code, navigate, t])

  return null
}

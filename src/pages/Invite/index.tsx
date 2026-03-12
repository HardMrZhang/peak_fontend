import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'
import { useAuthStore } from '@/store/useAuthStore'
import { bindReferrer, getMe } from '@/api'

export default function InvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const bindingRef = useRef(false)

  useEffect(() => {
    const raw = (code || '').trim()
    if (!raw) {
      navigate('/films', { replace: true })
      return
    }

    const inviteCode = normalizeInviteCode(raw)

    if (token && user) {
      if (user.referrerUserId) {
        message.info(t('invite.alreadyBound'))
        navigate('/films', { replace: true })
        return
      }

      if (bindingRef.current) return
      bindingRef.current = true

      bindReferrer(inviteCode)
        .then(() => getMe())
        .then((res) => {
          setUser(res.data)
          localStorage.removeItem(INVITE_CODE_STORAGE_KEY)
          message.success(t('referral.bindSuccess'))
        })
        .catch((err) => {
          const errCode = err?.response?.data?.code
          const errMsg = err?.response?.data?.message || ''
          if (errCode === 'REFERRER_ALREADY_BOUND') {
            message.info(t('invite.alreadyBound'))
          } else if (errMsg.includes('self')) {
            message.warning(t('invite.cannotBindSelf'))
          } else if (errCode === 'INVALID_INVITE_CODE' || errMsg.includes('Invalid invite code')) {
            message.error(t('invite.invalidCode'))
          } else {
            message.error(t('invite.bindFailed'))
          }
        })
        .finally(() => {
          bindingRef.current = false
          navigate('/films', { replace: true })
        })
    } else {
      localStorage.setItem(INVITE_CODE_STORAGE_KEY, inviteCode)
      message.success(t('invite.codeRecorded'))
      navigate('/films', { replace: true })
    }
  }, [code, token, user, navigate, t, setUser])

  return null
}

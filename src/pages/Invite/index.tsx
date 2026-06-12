import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { INVITE_CODE_STORAGE_KEY, normalizeInviteCode } from '@/constants/invite'
import { useAuthStore } from '@/store/useAuthStore'

export default function InvitePage() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    const raw = (code || '').trim()
    if (!raw) {
      navigate('/nodes', { replace: true })
      return
    }

    const inviteCode = normalizeInviteCode(raw)

    if (token && user && user.referrerUserId) {
      navigate('/nodes', { replace: true })
      return
    }

    localStorage.setItem(INVITE_CODE_STORAGE_KEY, inviteCode)
    navigate('/nodes', { replace: true })
  }, [code, token, user, navigate])

  return null
}

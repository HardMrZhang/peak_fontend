export const INVITE_CODE_STORAGE_KEY = 'peak_invite_code'

export function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase()
}

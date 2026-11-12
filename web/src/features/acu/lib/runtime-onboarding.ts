import type { AuthUser } from '@/stores/auth-store'

export const RUNTIME_RELEASE_URL =
  'https://github.com/jerry0012009/acu-runtime/releases/latest'
export type RuntimePlatform = 'windows' | 'mac-arm' | 'mac-intel' | 'other'

export function runtimeDownloadUrl(
  platform: Exclude<RuntimePlatform, 'other'>
): string {
  return `/api/acu-runtime/download/${platform}`
}

export function detectRuntimePlatform(userAgent: string): RuntimePlatform {
  if (/Android|iPhone|iPad|Mobile|Windows.*(?:ARM|aarch64)/i.test(userAgent)) {
    return 'other'
  }
  if (/Windows/i.test(userAgent)) return 'windows'
  // Browsers do not reliably report Mac CPU architecture. Keep both downloads visible.
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac-arm'
  return 'other'
}

export function onboardingPending(user: AuthUser): boolean {
  try {
    const settings =
      typeof user.setting === 'string' ? JSON.parse(user.setting) : user.setting
    return user.role === 1 && settings?.acu_onboarding_pending === true
  } catch {
    return false
  }
}

export function isRuntimeLogin(
  document: Pick<Document, 'querySelector'>
): boolean {
  return document.querySelector('#acu-runtime-connect') !== null
}

export function onboardingLanding(
  user: AuthUser,
  explicitTarget: string | null,
  runtimeLogin: boolean
): string {
  if (explicitTarget) return explicitTarget
  return onboardingPending(user) && !runtimeLogin ? '/#start' : '/dashboard'
}

/**
 * Utilities for managing authentication-related browser storage
 */

// ============================================================================
// LocalStorage Keys
// ============================================================================

const STORAGE_KEYS = {
  AFFILIATE: 'aff',
  STATUS: 'status',
  PENDING_REDEMPTION: 'pending_redeem',
} as const

// ============================================================================
// Affiliate Code Storage
// ============================================================================

/**
 * Get affiliate code from localStorage
 */
export function getAffiliateCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEYS.AFFILIATE) ?? ''
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get affiliate code:', error)
    return ''
  }
}

/**
 * Save affiliate code to localStorage
 */
export function saveAffiliateCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.AFFILIATE, code)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save affiliate code:', error)
  }
}

export function getRedemptionCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return (
      new URLSearchParams(window.location.search).get('redeem')?.trim() ?? ''
    )
  } catch {
    return ''
  }
}

export function clearRedemptionCode(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('redeem')
  window.history.replaceState(window.history.state, '', url)
}

export function clearRedemptionError(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('redeem_error')
  window.history.replaceState(window.history.state, '', url)
}

export function savePendingRedemptionCode(code: string): void {
  if (typeof window === 'undefined' || !code) return
  try {
    window.sessionStorage.setItem(STORAGE_KEYS.PENDING_REDEMPTION, code)
  } catch {
    // Session storage is optional; the signup flow still works without it.
  }
}

export function getPendingRedemptionCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem(STORAGE_KEYS.PENDING_REDEMPTION) ?? ''
  } catch {
    return ''
  }
}

export function clearPendingRedemptionCode(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEYS.PENDING_REDEMPTION)
  } catch {
    // Session storage is optional.
  }
}

const CHUNK_RECOVERY_STORAGE_KEY = 'newapi:chunk-load-recovery-at'
const CHUNK_RECOVERY_WINDOW_MS = 60_000

function getErrorField(error: unknown, field: string): string {
  if (typeof error !== 'object' || error === null) return ''
  const value = (error as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

export function isChunkLoadError(error: unknown): boolean {
  const name = getErrorField(error, 'name')
  const message = getErrorField(error, 'message')
  return (
    name === 'ChunkLoadError' ||
    /Loading (?:CSS )?chunk \d+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  )
}

export function getChunkAssetUrl(
  error: unknown,
  currentOrigin: string
): string | null {
  const request = getErrorField(error, 'request')
  const message = getErrorField(error, 'message')
  const messageUrl = message.match(
    /(?:missing:|from)\s*(https?:\/\/[^\s)]+|\/static\/[^\s)]+)/
  )?.[1]
  const candidate = request || messageUrl
  if (!candidate) return null

  try {
    const url = new URL(candidate, currentOrigin)
    if (url.origin !== currentOrigin || !url.pathname.startsWith('/static/')) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export function shouldAttemptChunkRecovery(
  lastAttemptAt: number | null,
  now: number
): boolean {
  return (
    lastAttemptAt === null ||
    !Number.isFinite(lastAttemptAt) ||
    now - lastAttemptAt >= CHUNK_RECOVERY_WINDOW_MS
  )
}

export async function recoverFromChunkLoadError(
  error: unknown
): Promise<boolean> {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false

  const now = Date.now()
  let lastAttemptAt: number | null = null
  try {
    const storedAttempt = window.sessionStorage.getItem(
      CHUNK_RECOVERY_STORAGE_KEY
    )
    lastAttemptAt = storedAttempt === null ? null : Number(storedAttempt)
  } catch {
    return false
  }
  if (!shouldAttemptChunkRecovery(lastAttemptAt, now)) return false

  try {
    window.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now))
  } catch {
    return false
  }

  const assetUrl = getChunkAssetUrl(error, window.location.origin)
  if (assetUrl) {
    try {
      await window.fetch(assetUrl, {
        cache: 'reload',
        credentials: 'same-origin',
      })
    } catch {
      // A fresh document may reference a different chunk even if this fetch fails.
    }
  }

  window.location.reload()
  return true
}

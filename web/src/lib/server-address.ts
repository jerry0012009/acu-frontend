function isLocalhostAddress(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    )
  } catch {
    return false
  }
}

function getBrowserServerAddress(): string {
  if (typeof window === 'undefined') return ''
  const basePath =
    window.location.pathname === '/acu' ||
    window.location.pathname.startsWith('/acu/')
      ? '/acu'
      : ''
  return `${window.location.origin}${basePath}`
}

export function resolveServerAddress(configuredAddress?: unknown): string {
  const configured =
    typeof configuredAddress === 'string'
      ? configuredAddress.trim().replace(/\/+$/, '')
      : ''
  if (configured && !isLocalhostAddress(configured)) return configured
  return getBrowserServerAddress()
}

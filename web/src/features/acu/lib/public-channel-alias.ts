const PUBLIC_ALIAS_MIN = 1
const PUBLIC_ALIAS_MAX = 9999

/**
 * Render a stable public label without exposing upstream identity.
 *
 * The provider is part of the hash input when available so two upstream
 * providers using similarly named channels do not intentionally share a
 * public label.
 */
export function publicChannelAlias(
  provider?: string,
  channel?: string
): string {
  const normalizedProvider = provider?.trim()
  const normalizedChannel = channel?.trim()
  const identity = normalizedProvider
    ? `${normalizedProvider}|${normalizedChannel ?? ''}`
    : normalizedChannel

  if (!identity) return 'ACU 线路'

  let hash = 0
  for (const character of identity) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  const number =
    (hash % (PUBLIC_ALIAS_MAX - PUBLIC_ALIAS_MIN + 1)) + PUBLIC_ALIAS_MIN

  return `ACU 线路 ${String(number).padStart(4, '0')}`
}

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'

export function frozenBilledInputTokens(
  input: number,
  cached: number,
  cacheWrite: unknown,
  mode: unknown
): number | undefined {
  if (!Number.isSafeInteger(input) || input < 0) return undefined
  if (mode === 'excludes_cached') return input
  if (mode !== 'includes_cached') return undefined
  if (!Number.isSafeInteger(cached) || cached < 0) return undefined
  if (typeof cacheWrite !== 'string' && typeof cacheWrite !== 'number') {
    return undefined
  }
  if (!/^\d+$/.test(String(cacheWrite))) return undefined
  const write = Number(cacheWrite)
  if (!Number.isSafeInteger(write) || write < 0) return undefined
  const uncached = input - cached - write
  return uncached >= 0 ? uncached : undefined
}

export function isFinalizedAcuUsageLog(
  log: UsageLog,
  other: LogOtherData | null
): boolean {
  return (
    log.type === 2 &&
    (log.content === 'ACU usage finalized' ||
      other?.acu_billing_status === 'finalized')
  )
}

export function shouldShowAcuInternalDetails(
  log: UsageLog,
  other: LogOtherData | null,
  isAdmin: boolean
): boolean {
  return isAdmin || !isFinalizedAcuUsageLog(log, other)
}

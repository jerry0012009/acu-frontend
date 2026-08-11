import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'

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

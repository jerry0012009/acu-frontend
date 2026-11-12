import { formatLogQuota } from '@/lib/format'

import { formatListDecimal } from '../lib/decimal-format'
import type { LogStatistics } from '../types'

export function LogUsageAmount(props: { stats: LogStatistics | undefined }) {
  const amount = formatListDecimal(props.stats?.user_charge_cny)
  return (
    <span>
      {amount == null ? formatLogQuota(props.stats?.quota ?? 0) : `¥${amount}`}
    </span>
  )
}

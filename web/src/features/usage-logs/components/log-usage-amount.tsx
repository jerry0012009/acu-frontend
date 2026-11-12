import { useTranslation } from 'react-i18next'

import { formatLogQuota } from '@/lib/format'

import { formatListDecimal } from '../lib/decimal-format'
import type { LogStatistics } from '../types'

export function LogUsageAmount(props: { stats: LogStatistics | undefined }) {
  const { t } = useTranslation()
  const amount = formatListDecimal(props.stats?.user_charge_cny)
  const legacyCount = props.stats?.legacy_charge_count ?? 0
  return (
    <span className='inline-flex flex-wrap items-center gap-x-2'>
      <span>
        {amount == null
          ? formatLogQuota(props.stats?.quota ?? 0)
          : `¥${amount}`}
      </span>
      {(amount == null || legacyCount > 0) && (
        <span className='text-muted-foreground text-xs font-normal'>
          {t('Legacy quota conversion')}
          {legacyCount > 0 ? ` · ${legacyCount}` : ''}
        </span>
      )}
    </span>
  )
}

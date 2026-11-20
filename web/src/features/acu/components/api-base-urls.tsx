import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

import {
  ACU_API_BASE_URL,
  ACU_OVERSEAS_API_BASE_URL,
  ACU_OVERSEAS_API_ORIGIN,
  CC_SWITCH_CLAUDE_API_BASE_URL,
} from '../lib/quick-start'

export function ApiBaseUrls(props: {
  anthropic?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const addresses = [
    {
      label: t('Mainland China Base URL'),
      value: props.anthropic ? CC_SWITCH_CLAUDE_API_BASE_URL : ACU_API_BASE_URL,
      copyLabel: t('Copy Mainland China Base URL'),
    },
    {
      label: t('Overseas Base URL'),
      value: props.anthropic
        ? ACU_OVERSEAS_API_ORIGIN
        : ACU_OVERSEAS_API_BASE_URL,
      copyLabel: t('Copy overseas Base URL'),
    },
  ]

  return (
    <div className={cn('min-w-0 space-y-1', props.className)}>
      <dl className='divide-border grid divide-y'>
        {addresses.map(({ label, value, copyLabel }) => (
          <div
            key={value}
            className='grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)_auto]'
          >
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='col-start-1 row-start-2 min-w-0 pb-1 sm:col-start-2 sm:row-start-1 sm:pb-0'>
              <code className='break-all'>{value}</code>
            </dd>
            <dd className='col-start-2 row-span-2 row-start-1 sm:col-start-3 sm:row-span-1'>
              <CopyButton
                value={value}
                className='size-7'
                tooltip={copyLabel}
              />
            </dd>
          </div>
        ))}
      </dl>
      <p className='text-muted-foreground text-xs'>
        {props.anthropic
          ? t(
              'To switch lines, replace the Base URL and keep the same API key. Claude Code uses the address without /v1.'
            )
          : t(
              'To switch lines, replace the Base URL and keep the same API key. For Claude Code, omit /v1.'
            )}
      </p>
    </div>
  )
}

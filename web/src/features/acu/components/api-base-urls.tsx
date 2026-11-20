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
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const addresses = [
    {
      label: props.compact ? t('Mainland China') : t('Mainland China Base URL'),
      shortLabel: t('China'),
      value: props.anthropic ? CC_SWITCH_CLAUDE_API_BASE_URL : ACU_API_BASE_URL,
      copyLabel: t('Copy Mainland China Base URL'),
    },
    {
      label: props.compact ? t('Overseas') : t('Overseas Base URL'),
      shortLabel: t('Global'),
      value: props.anthropic
        ? ACU_OVERSEAS_API_ORIGIN
        : ACU_OVERSEAS_API_BASE_URL,
      copyLabel: t('Copy overseas Base URL'),
    },
  ]

  if (props.compact) {
    return (
      <dl
        className={cn(
          'text-muted-foreground flex items-center gap-1.5 whitespace-nowrap text-xs sm:gap-3',
          props.className
        )}
      >
        {addresses.map(({ label, shortLabel, value, copyLabel }) => {
          const { protocol, host, pathname } = new URL(value)
          return (
            <div
              key={value}
              className='border-border flex min-w-0 items-center gap-1 not-first:border-l not-first:pl-1.5 sm:gap-1.5 sm:not-first:pl-3'
            >
              <dt className='shrink-0' aria-label={label}>
                <span className='min-[380px]:hidden'>{shortLabel}</span>
                <span className='hidden min-[380px]:inline'>{label}</span>
              </dt>
              <dd className='flex min-w-0 items-center sm:gap-0.5'>
                <code
                  className='text-foreground/80 truncate font-sans sm:font-mono'
                  title={value}
                >
                  <span className='hidden sm:inline'>{protocol}//</span>
                  {host}
                  <span className='hidden sm:inline'>
                    {pathname === '/' ? '' : pathname}
                  </span>
                </code>
                <CopyButton
                  value={value}
                  className='size-6'
                  iconClassName='size-3.5'
                  tooltip={copyLabel}
                />
              </dd>
            </div>
          )
        })}
      </dl>
    )
  }

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

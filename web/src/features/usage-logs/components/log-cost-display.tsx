import { BadgeInfoIcon, Wrench01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatLogQuota } from '@/lib/format'

import { hasToolSurcharge } from '../lib/format'
import type { LogOtherData } from '../types'

interface LogCostDisplayProps {
  quota: number
  other: LogOtherData | null
}

function splitQuotaDisplay(value: string): { prefix: string; amount: string } {
  const match = value.match(/^([^0-9+\-.,\s]+)(.+)$/)
  if (!match) return { prefix: '', amount: value }
  return { prefix: match[1], amount: match[2] }
}

function ToolSurchargeMarker() {
  const { t } = useTranslation()
  const label = t('Includes tool-call surcharge')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant='warning'
            className='h-5 min-w-5 cursor-help gap-0 rounded-full px-1'
            role='img'
            aria-label={label}
            tabIndex={0}
            data-tool-surcharge-indicator='true'
          >
            <HugeiconsIcon
              icon={Wrench01Icon}
              strokeWidth={2}
              aria-hidden='true'
            />
            <span
              className='text-[9px] leading-none font-bold'
              aria-hidden='true'
            >
              +
            </span>
          </Badge>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function QuotaBadge(props: { quota: number }) {
  const quotaDisplay = splitQuotaDisplay(formatLogQuota(props.quota))

  return (
    <span className='border-border/80 bg-muted/60 inline-flex h-6 w-fit items-center rounded-md border px-2 [font-family:var(--font-body)] text-sm leading-none font-semibold tabular-nums'>
      {quotaDisplay.prefix ? (
        <span className='mr-1'>{quotaDisplay.prefix}</span>
      ) : null}
      <span>{quotaDisplay.amount}</span>
    </span>
  )
}

function SubscriptionBadge(props: { quota: number }) {
  const { t } = useTranslation()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <StatusBadge
            label={t('Subscription')}
            variant='success'
            size='sm'
            copyable={false}
            className='cursor-help'
          />
        }
      />
      <TooltipContent>
        <span>
          {t('Deducted by subscription')}: {formatLogQuota(props.quota)}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function formatUsd(
  value: number | string | null | undefined
): string | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? `$${number.toFixed(8)}` : undefined
}

export function formatMultiplier(
  value: number | string | null | undefined
): string | undefined {
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  return `${number.toFixed(Math.abs(number) < 0.1 ? 3 : 2)}x`
}

function CostReferenceTooltip(props: {
  breakdown: NonNullable<LogOtherData['acu_cost_breakdown']>
  adminBreakdown?: NonNullable<LogOtherData['admin_info']>['acu_cost_breakdown']
}) {
  const { t } = useTranslation()
  const reference = formatUsd(props.breakdown.official_reference_cost_usd)
  const multiplier = formatMultiplier(
    props.breakdown.channel_discount_multiplier
  )
  if (!reference || !multiplier) return null

  const admin = props.adminBreakdown
  const rows = [
    ['Input', props.breakdown.official_input_price_per_million_usd],
    [
      'Cached Input',
      props.breakdown.official_cached_input_price_per_million_usd,
    ],
    ['Cache Write', props.breakdown.official_cache_write_price_per_million_usd],
    ['Output', props.breakdown.official_output_price_per_million_usd],
  ].filter(([, value]) => value != null && Number.isFinite(Number(value)))

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            className='text-muted-foreground/70 hover:text-foreground inline-flex size-5 cursor-help items-center justify-center rounded-full'
            aria-label={t('View official cost reference')}
            data-cost-reference-indicator='true'
          >
            <HugeiconsIcon
              icon={BadgeInfoIcon}
              size={14}
              strokeWidth={2}
              aria-hidden='true'
            />
          </button>
        }
      />
      <TooltipContent className='max-w-xs'>
        <div className='flex flex-col gap-1.5'>
          <div className='font-semibold'>{t('Cost reference')}</div>
          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'>
            <span>{t('Actual charge')}</span>
            <span>{`¥${Number(props.breakdown.user_charge_cny ?? 0).toFixed(8)}`}</span>
            <span>{t('Official reference')}</span>
            <span>{reference}</span>
            <span>{t('Channel discount')}</span>
            <span>{`${multiplier} (${(Number(props.breakdown.channel_discount_multiplier) * 100).toFixed(1)}%)`}</span>
          </div>
          {rows.length > 0 && (
            <div className='border-background/20 mt-1 border-t pt-1'>
              <div className='mb-0.5 font-semibold'>
                {t('Official unit prices')}
              </div>
              {rows.map(([label, value]) => (
                <div key={label} className='grid grid-cols-[auto_1fr] gap-x-3'>
                  <span>{label}</span>
                  <span>{`$${Number(value).toFixed(4)} / 1M`}</span>
                </div>
              ))}
            </div>
          )}
          {props.breakdown.official_judge_reference_cost_usd != null && (
            <div>
              {t('Includes Judge official reference')}:{' '}
              {formatUsd(props.breakdown.official_judge_reference_cost_usd)}
            </div>
          )}
          {admin && (
            <div className='border-background/20 mt-1 border-t pt-1 opacity-70'>
              <div className='mb-0.5 font-semibold'>
                {t('Internal billing')}
              </div>
              {admin.billing_multiplier != null && (
                <div>{`${t('Profile multiplier')}: ${formatMultiplier(admin.billing_multiplier)}`}</div>
              )}
              {admin.provider_balance_charge != null && (
                <div>{`${t('Platform debit')}: ${admin.provider_balance_charge} credits`}</div>
              )}
              {admin.provider_credit_cash_cost_cny != null && (
                <div>{`${t('Credit cost')}: ¥${Number(admin.provider_credit_cash_cost_cny).toFixed(8)} / credit`}</div>
              )}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function LogCostDisplay(props: LogCostDisplayProps) {
  if (props.other?.user_charge_cny != null) {
    const breakdown = props.other.acu_cost_breakdown
    return (
      <TooltipProvider>
        <div className='inline-flex items-center gap-1'>
          <span className='border-border/80 bg-muted/60 inline-flex h-6 w-fit items-center rounded-md border px-2 [font-family:var(--font-body)] text-sm leading-none font-semibold tabular-nums'>
            {`¥${Number(props.other.user_charge_cny).toFixed(8)}`}
          </span>
          {breakdown ? (
            <CostReferenceTooltip
              breakdown={breakdown}
              adminBreakdown={props.other.admin_info?.acu_cost_breakdown}
            />
          ) : null}
        </div>
      </TooltipProvider>
    )
  }
  const isSubscription = props.other?.billing_source === 'subscription'
  const showToolSurcharge = hasToolSurcharge(props.other)

  if (!isSubscription && !showToolSurcharge) {
    return (
      <div className='flex flex-col gap-0.5'>
        <QuotaBadge quota={props.quota} />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className='inline-flex items-center gap-1'>
        {isSubscription ? (
          <SubscriptionBadge quota={props.quota} />
        ) : (
          <QuotaBadge quota={props.quota} />
        )}
        {showToolSurcharge ? <ToolSurchargeMarker /> : null}
      </div>
    </TooltipProvider>
  )
}

import type { TFunction } from 'i18next'
import {
  Copy,
  Check,
  Route,
  Settings2,
  AlertTriangle,
  Headphones,
  Monitor,
  Cloud,
  Globe,
  ShieldCheck,
  UserCog,
  Info,
  LogIn,
  Target,
  TimerReset,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Dialog } from '@/components/dialog'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Label } from '@/components/ui/label'
import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatLogQuota, formatTokens, formatUseTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { UsageLog } from '../../data/schema'
import {
  acuBreakdownForView,
  acuPriceComparisonRows,
  acuResolvedReasoningEffort,
  acuSuccessfulAttempt,
} from '../../lib/acu-log-view'
import {
  parseLogOther,
  getParamOverrideActionLabel,
  parseAuditLine,
  decodeBillingExprB64,
  getTieredBillingSummary,
  hasAnyCacheTokens,
  isViolationFeeLog,
  getFirstResponseTimeColor,
  getResponseTimeColor,
  renderAuditContent,
  acuCacheReadTokens,
  acuDurationSeconds,
  acuFirstTokenMs,
  acuLogPresentation,
} from '../../lib/format'
import {
  getLogTypeConfig,
  isPerCallBilling,
  isTimingLogType,
} from '../../lib/utils'
import { USAGE_BILLING_PATH, type LogOtherData } from '../../types'
import { ACUSessionTracePanel } from './acu-session-trace'
import {
  isFinalizedAcuUsageLog,
  shouldShowAcuInternalDetails,
} from './details-dialog-model'

const ACU_CURVE_COLORS = [
  '#0f766e',
  '#2563eb',
  '#c2410c',
  '#a21caf',
  '#ca8a04',
  '#475569',
]

// Maps a channel-update changed-field token (as recorded by the backend audit)
// to its i18n label key for display in the audit details.
const CHANNEL_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  models: 'Models',
  group: 'Group',
  type: 'Type',
  base_url: 'Base URL',
  key: 'Key',
}

function timingTextColorClass(
  variant: 'success' | 'warning' | 'danger'
): string {
  if (variant === 'success') return 'text-emerald-600'
  if (variant === 'warning') return 'text-amber-600'
  return 'text-rose-600'
}

function DetailRow(props: {
  label: React.ReactNode
  value: React.ReactNode
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className='grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3'>
      <span className='text-muted-foreground min-w-0 text-xs'>
        {props.label}
      </span>
      <span
        className={cn(
          'max-w-full min-w-0 text-xs break-all sm:wrap-break-word',
          props.mono && 'font-mono',
          props.muted && 'text-muted-foreground'
        )}
      >
        {props.value}
      </span>
    </div>
  )
}

function DetailSection(props: {
  icon?: React.ReactNode
  iconTone?: IconBadgeTone
  label: string
  variant?: 'default' | 'danger'
  children: React.ReactNode
}) {
  const isDanger = props.variant === 'danger'
  const iconTone = isDanger ? 'destructive' : props.iconTone
  return (
    <div className='min-w-0 space-y-1.5'>
      <Label
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          isDanger && 'text-red-500'
        )}
      >
        {props.icon && (
          <IconBadge tone={iconTone} size='xs'>
            {props.icon}
          </IconBadge>
        )}
        {props.label}
      </Label>
      <div
        className={cn(
          'min-w-0 space-y-1 overflow-hidden rounded-md border p-2.5 max-sm:p-2',
          isDanger
            ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
            : 'bg-muted/30'
        )}
      >
        {props.children}
      </div>
    </div>
  )
}

function formatAttemptTimestamp(value?: string | null): React.ReactNode {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return (
    <span title={date.toISOString()}>
      {date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
      })}
    </span>
  )
}

export function AcuSessionTraceDisclosure(props: {
  identifier: string
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className='border-border/70 min-w-0 rounded-md border p-3 text-xs'
    >
      <summary className='cursor-pointer font-medium'>
        {t('View full Session Trace')}
      </summary>
      {expanded && (
        <div className='mt-3'>
          <ACUSessionTracePanel
            identifier={props.identifier}
            isAdmin={props.isAdmin}
          />
        </div>
      )}
    </details>
  )
}

export function AcuExecutionAttempts(props: {
  breakdown: NonNullable<LogOtherData['acu_cost_breakdown']>
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const attempts = [...(props.breakdown.channel_attempts ?? [])].sort(
    (left, right) => (left.attempt_index ?? 0) - (right.attempt_index ?? 0)
  )
  if (attempts.length === 0) return null

  return (
    <DetailSection
      icon={<Route className='size-3' aria-hidden='true' />}
      iconTone='info'
      label={t('Execution Attempts')}
    >
      <div className='space-y-2'>
        {attempts.map((attempt, index) => {
          const attemptIndex = attempt.attempt_index ?? index + 1
          const successful = attempt.status === 'success'
          const channelId = attempt.channel_id ?? attempt.channel
          const failureReason =
            attempt.error_category ?? attempt.error_class ?? undefined
          let firstEventAt = attempt.first_model_event_at
          if (
            !firstEventAt &&
            attempt.started_at &&
            attempt.first_model_event_latency_ms != null
          ) {
            const startedAt = new Date(attempt.started_at)
            if (!Number.isNaN(startedAt.getTime())) {
              firstEventAt = new Date(
                startedAt.getTime() + attempt.first_model_event_latency_ms
              ).toISOString()
            }
          }
          const firstEventValue = firstEventAt
            ? formatAttemptTimestamp(firstEventAt)
            : '—'
          const publicRoute = publicChannelAlias(attempt.provider, channelId)
          const title = props.isAdmin
            ? [attempt.provider, channelId ? `#${channelId}` : undefined]
                .filter(Boolean)
                .join(' · ') || `${t('Attempt')} ${attemptIndex}`
            : publicRoute
          let statusLabel = t('Retry')
          if (successful) {
            statusLabel = t('Completed')
          } else if (props.isAdmin) {
            statusLabel = attempt.status || t('Failed')
          }

          return (
            <div
              key={`${attemptIndex}:${attempt.execution_profile_id ?? ''}:${attempt.status ?? ''}`}
              className='border-border/70 min-w-0 rounded border p-2.5'
            >
              <div className='mb-2 flex min-w-0 items-center justify-between gap-2'>
                <span className='min-w-0 truncate font-medium'>{title}</span>
                <StatusBadge
                  label={statusLabel}
                  variant={successful ? 'green' : 'orange'}
                  size='sm'
                  copyable={false}
                />
              </div>
              {props.isAdmin ? (
                <div className='grid gap-1.5 sm:grid-cols-2'>
                  <DetailRow
                    label={t('Provider')}
                    value={attempt.provider || '—'}
                    mono
                  />
                  <DetailRow
                    label={t('Channel ID')}
                    value={channelId || '—'}
                    mono
                  />
                  {attempt.channel_name && (
                    <DetailRow
                      label={t('Channel Name')}
                      value={attempt.channel_name}
                      mono
                    />
                  )}
                  <DetailRow
                    label={t('Execution Profile')}
                    value={attempt.execution_profile_id || '—'}
                    mono
                  />
                  <DetailRow
                    label={t('Actual Model')}
                    value={attempt.actual_model ?? attempt.model ?? '—'}
                    mono
                  />
                  <DetailRow
                    label={t('Protocol')}
                    value={attempt.protocol || '—'}
                    mono
                  />
                  <DetailRow
                    label={t('Network Endpoint')}
                    value={
                      attempt.network_endpoint ??
                      attempt.endpoint_host ??
                      attempt.endpoint ??
                      '—'
                    }
                    mono
                  />
                  <DetailRow
                    label={t('Start Time')}
                    value={formatAttemptTimestamp(attempt.started_at)}
                    mono
                  />
                  <DetailRow
                    label={t('First response')}
                    value={firstEventValue}
                    mono
                  />
                  <DetailRow
                    label={t('Completion Time')}
                    value={formatAttemptTimestamp(attempt.completed_at)}
                    mono
                  />
                  <DetailRow
                    label={t('Provider Duration')}
                    value={
                      attempt.latency_ms != null
                        ? formatUseTime(attempt.latency_ms / 1000)
                        : '—'
                    }
                    mono
                  />
                  {attempt.input_price_per_million != null && (
                    <DetailRow
                      label={t('Provider input price')}
                      value={`$${Number(attempt.input_price_per_million).toFixed(6)} / M`}
                      mono
                    />
                  )}
                  {attempt.output_price_per_million != null && (
                    <DetailRow
                      label={t('Provider output price')}
                      value={`$${Number(attempt.output_price_per_million).toFixed(6)} / M`}
                      mono
                    />
                  )}
                  {attempt.nominal_cost_usd != null && (
                    <DetailRow
                      label={t('Attempt provider cost')}
                      value={`$${Number(attempt.nominal_cost_usd).toFixed(8)}`}
                      mono
                    />
                  )}
                  <DetailRow
                    label={t('Status')}
                    value={attempt.status || '—'}
                    mono
                  />
                  {attempt.http_status != null && (
                    <DetailRow
                      label={t('HTTP Status')}
                      value={String(attempt.http_status)}
                      mono
                    />
                  )}
                  {!successful && (
                    <DetailRow
                      label={t('Failure Reason')}
                      value={failureReason || '—'}
                      mono
                    />
                  )}
                </div>
              ) : (
                <div className='text-muted-foreground text-xs'>
                  {successful ? t('Request completed') : t('Route retry')}
                  {attempt.latency_ms != null &&
                    ` · ${formatUseTime(attempt.latency_ms / 1000)}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </DetailSection>
  )
}

function AcuPricingDetails(props: {
  breakdown: NonNullable<LogOtherData['acu_cost_breakdown']>
  modelId: string
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const { models } = usePricingData()
  const pricing = models.find((model) => model.model_name === props.modelId)
  const rows = acuPriceComparisonRows(pricing, props.breakdown.protocol)
  const successfulAttempt = acuSuccessfulAttempt(props.breakdown)
  const hasAdminEconomics =
    props.isAdmin &&
    (props.breakdown.billing_multiplier != null ||
      props.breakdown.retail_markup_multiplier != null ||
      props.breakdown.effective_provider_cash_cost_cny != null ||
      props.breakdown.actual_total_cash_cost_cny != null)
  if (rows.length === 0 && !hasAdminEconomics) return null

  const reference = pricing?.reference
  const referencePrice = (cny: number): string => {
    if (
      reference?.original_currency === 'USD' &&
      reference.fx_cny_per_usd != null &&
      reference.fx_cny_per_usd > 0
    ) {
      return `$${(cny / reference.fx_cny_per_usd).toFixed(4)} / M`
    }
    return `¥${cny.toFixed(4)} / M`
  }
  const kindLabel = {
    input: t('Input'),
    cached: t('Cached Input'),
    output: t('Output'),
  }

  return (
    <DetailSection label={t('Price Comparison')}>
      {rows.length > 0 && (
        <div className='space-y-2'>
          <div className='overflow-x-auto'>
            <div className='grid min-w-[34rem] grid-cols-[minmax(4rem,0.7fr)_repeat(4,minmax(5rem,1fr))] gap-2 text-[11px]'>
              <span />
              <span className='text-muted-foreground'>
                {t('Official reference price')}
              </span>
              <span className='text-muted-foreground'>{t('ACU price')}</span>
              <span className='text-muted-foreground'>
                {t('Actual price multiplier')}
              </span>
              <span className='text-muted-foreground'>{t('Savings')}</span>
              {rows.map((row) => (
                <div key={row.kind} className='contents'>
                  <span>{kindLabel[row.kind]}</span>
                  <span className='font-mono'>
                    {referencePrice(row.referenceCnyPerMillion)}
                  </span>
                  <span className='font-mono'>
                    ¥{row.payableCnyPerMillion.toFixed(4)} / M
                  </span>
                  <span className='font-mono'>
                    {(row.multiplier * 100).toFixed(2)}%
                  </span>
                  <span className='font-mono'>
                    {(row.savings * 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          {reference && (
            <div className='text-muted-foreground text-[11px]'>
              {t('Current catalog reference')} · {t('Reference source')}:{' '}
              {reference.source_name} · {t('Pricing version')}:{' '}
              {pricing?.pricing_version ||
                props.breakdown.route_decision?.price_version ||
                '—'}
            </div>
          )}
        </div>
      )}
      {hasAdminEconomics && (
        <div className='mt-2 grid gap-1.5 border-t pt-2 sm:grid-cols-2'>
          <DetailRow
            label={t('Provider')}
            value={
              successfulAttempt?.provider ??
              props.breakdown.actual_provider ??
              '—'
            }
            mono
          />
          <DetailRow
            label={t('Channel ID')}
            value={
              successfulAttempt?.channel_id ??
              successfulAttempt?.channel ??
              props.breakdown.channel_id ??
              '—'
            }
            mono
          />
          <DetailRow
            label={t('Execution Profile')}
            value={successfulAttempt?.execution_profile_id || '—'}
            mono
          />
          {props.breakdown.billing_multiplier != null && (
            <DetailRow
              label={t('Supplier billing multiplier')}
              value={String(props.breakdown.billing_multiplier)}
              mono
            />
          )}
          {props.breakdown.provider_credit_cash_cost_cny != null && (
            <DetailRow
              label={t('Recharge conversion')}
              value={`¥${Number(props.breakdown.provider_credit_cash_cost_cny).toFixed(6)} / credit`}
              mono
            />
          )}
          {props.breakdown.billing_multiplier != null &&
            props.breakdown.provider_credit_cash_cost_cny != null && (
              <DetailRow
                label={t('Provider cash conversion')}
                value={`¥${(
                  props.breakdown.billing_multiplier *
                  Number(props.breakdown.provider_credit_cash_cost_cny)
                ).toFixed(6)} / nominal USD`}
                mono
              />
            )}
          {props.breakdown.retail_markup_multiplier != null && (
            <DetailRow
              label={t('Retail markup')}
              value={`${props.breakdown.retail_markup_multiplier}×`}
              mono
            />
          )}
          {props.breakdown.effective_provider_cash_cost_cny != null && (
            <DetailRow
              label={t('Effective provider cash cost')}
              value={`¥${Number(props.breakdown.effective_provider_cash_cost_cny).toFixed(8)}`}
              mono
            />
          )}
          {props.breakdown.user_charge_cny != null && (
            <DetailRow
              label={t('Actual charge')}
              value={`¥${Number(props.breakdown.user_charge_cny).toFixed(8)}`}
              mono
            />
          )}
          <DetailRow
            label={t('Billing / pricing version')}
            value={
              [
                props.breakdown.billing_policy_version,
                props.breakdown.route_decision?.price_version,
                props.breakdown.effective_cost_version,
              ]
                .filter(Boolean)
                .join(' · ') || '—'
            }
            mono
          />
          <DetailRow
            label={t('Cost source / status')}
            value={
              [
                props.breakdown.effective_cost_source,
                props.breakdown.effective_cost_status,
              ]
                .filter(Boolean)
                .join(' · ') || '—'
            }
            mono
          />
        </div>
      )}
    </DetailSection>
  )
}

function formatRatio(ratio: number | undefined): string {
  if (ratio == null) return '-'
  return ratio.toFixed(4)
}

function getUsageBillingPathLabel(
  t: TFunction,
  adminInfo: LogOtherData['admin_info']
): string {
  switch (adminInfo?.usage_billing_path) {
    case USAGE_BILLING_PATH.LOCAL:
      return t('Local Billing')
    case USAGE_BILLING_PATH.OPENAI:
      return t('Upstream Response (billing-usage-openai)')
    case USAGE_BILLING_PATH.OPENAI_ESTIMATED:
      return t('Upstream Response (billing-usage-openai-estimated)')
    case USAGE_BILLING_PATH.ANTHROPIC:
      return t('Upstream Response (billing-usage-anthropic)')
    case USAGE_BILLING_PATH.ANTHROPIC_ESTIMATED:
      return t('Upstream Response (billing-usage-anthropic-estimated)')
    case USAGE_BILLING_PATH.GEMINI:
      return t('Upstream Response (billing-usage-gemini)')
    case USAGE_BILLING_PATH.GEMINI_ESTIMATED:
      return t('Upstream Response (billing-usage-gemini-estimated)')
    case USAGE_BILLING_PATH.UPSTREAM:
      return t('Upstream Response')
    default:
      return adminInfo?.local_count_tokens
        ? t('Local Billing')
        : t('Upstream Response')
  }
}

function isUsageBillingPathLocal(
  adminInfo: LogOtherData['admin_info']
): boolean {
  if (adminInfo?.usage_billing_path) {
    return adminInfo.usage_billing_path === USAGE_BILLING_PATH.LOCAL
  }
  return adminInfo?.local_count_tokens === true
}

function quotaSaturationKindLabel(
  kind: 'overflow' | 'underflow' | 'nan',
  t: (key: string) => string
): string {
  if (kind === 'overflow') return t('Overflow')
  if (kind === 'underflow') return t('Underflow')
  return t('Invalid (NaN)')
}

function BillingBreakdown(props: {
  log: UsageLog
  other: LogOtherData
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const { log, other, isAdmin } = props
  const isPerCall = isPerCallBilling(other.model_price)
  const isClaude = other.claude === true
  const isTieredExpr = other.billing_mode === 'tiered_expr'
  const tieredSummary = getTieredBillingSummary(other)

  const rows: Array<{ label: string; value: string }> = []
  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const fmtPrice = (usd: number) => formatBillingCurrencyFromUSD(usd, priceOpts)
  const baseInputUSD = other.model_ratio != null ? other.model_ratio * 2.0 : 0

  if (isTieredExpr) {
    rows.push({
      label: t('Billing Mode'),
      value: t('Dynamic Pricing'),
    })
    if (tieredSummary) {
      if (tieredSummary.tier.label) {
        rows.push({
          label: t('Matched Tier'),
          value: tieredSummary.tier.label,
        })
      }
      for (const entry of tieredSummary.priceEntries) {
        rows.push({
          label: t(entry.shortLabel),
          value: `${fmtPrice(entry.price)}/M`,
        })
      }
    } else {
      rows.push({
        label: t('Matched Tier'),
        value: t('No matching results'),
      })
    }
  } else if (isPerCall) {
    rows.push({ label: t('Billing Mode'), value: t('Per-call') })
    if (other.model_price != null) {
      rows.push({
        label: t('Model Price'),
        value: fmtPrice(other.model_price),
      })
    }
  } else {
    rows.push({ label: t('Billing Mode'), value: t('Per-token') })
    if (other.model_ratio != null) {
      rows.push({
        label: t('Input'),
        value: `${fmtPrice(baseInputUSD)}/M`,
      })
    }
    if (other.completion_ratio != null && other.model_ratio != null) {
      rows.push({
        label: t('Output'),
        value: `${fmtPrice(baseInputUSD * other.completion_ratio)}/M`,
      })
    }
  }

  const userGR = other.user_group_ratio
  const isUserGR = userGR != null && Number.isFinite(userGR) && userGR !== -1
  const effectiveGR = isUserGR ? userGR : other.group_ratio
  if (effectiveGR != null && Number.isFinite(effectiveGR)) {
    rows.push({
      label: isUserGR ? t('User Exclusive Ratio') : t('Group Ratio'),
      value: `${formatRatio(effectiveGR)}x`,
    })
  }

  if (!isTieredExpr && isClaude && hasAnyCacheTokens(other)) {
    if (other.cache_ratio != null && other.cache_ratio !== 1) {
      rows.push({
        label: t('Cache Read'),
        value: `${fmtPrice(baseInputUSD * other.cache_ratio)}/M`,
      })
    }
    if (
      other.cache_creation_ratio != null &&
      other.cache_creation_ratio !== 1
    ) {
      rows.push({
        label: t('Cache Creation'),
        value: `${fmtPrice(baseInputUSD * other.cache_creation_ratio)}/M`,
      })
    }
    if (
      other.cache_creation_ratio_5m != null &&
      other.cache_creation_ratio_5m !== 0
    ) {
      rows.push({
        label: t('Cache Creation (5m)'),
        value: `${fmtPrice(baseInputUSD * other.cache_creation_ratio_5m)}/M`,
      })
    }
    if (
      other.cache_creation_ratio_1h != null &&
      other.cache_creation_ratio_1h !== 0
    ) {
      rows.push({
        label: t('Cache Creation (1h)'),
        value: `${fmtPrice(baseInputUSD * other.cache_creation_ratio_1h)}/M`,
      })
    }
  }

  if (!isTieredExpr) {
    if (other.audio_ratio != null && other.audio_ratio !== 1) {
      rows.push({
        label: t('Audio input'),
        value: `${fmtPrice(baseInputUSD * other.audio_ratio)}/M`,
      })
    }

    if (
      other.audio_completion_ratio != null &&
      other.audio_completion_ratio !== 1
    ) {
      rows.push({
        label: t('Audio output'),
        value: `${fmtPrice(baseInputUSD * other.audio_completion_ratio)}/M`,
      })
    }

    if (other.image_ratio != null && other.image_ratio !== 1) {
      rows.push({
        label: t('Image input'),
        value: `${fmtPrice(baseInputUSD * other.image_ratio)}/M`,
      })
    }
  }

  if (other.web_search && other.web_search_call_count) {
    rows.push({
      label: t('Web Search'),
      value: `${other.web_search_call_count}x${other.web_search_price ? ` (${fmtPrice(other.web_search_price)})` : ''}`,
    })
  }

  if (other.file_search && other.file_search_call_count) {
    rows.push({
      label: t('File Search'),
      value: `${other.file_search_call_count}x${other.file_search_price ? ` (${fmtPrice(other.file_search_price)})` : ''}`,
    })
  }

  if (other.image_generation_call && other.image_generation_call_price) {
    rows.push({
      label: t('Image Generation'),
      value: fmtPrice(other.image_generation_call_price),
    })
  }

  if (other.audio_input_seperate_price && other.audio_input_price) {
    rows.push({
      label: t('Audio Input Price'),
      value: fmtPrice(other.audio_input_price),
    })
  }

  if (isAdmin && other.admin_info) {
    rows.push({
      label: t('Billing Path'),
      value: getUsageBillingPathLabel(t, other.admin_info),
    })
  }

  rows.push({
    label: other.user_charge_cny != null ? t('Actual charge') : t('Total Cost'),
    value:
      other.user_charge_cny != null
        ? `¥${Number(other.user_charge_cny).toFixed(8)}`
        : formatLogQuota(log.quota),
  })

  if (rows.length === 0) return null

  return (
    <DetailSection label={t('Billing Details')}>
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} mono />
      ))}
    </DetailSection>
  )
}

function TokenBreakdown(props: { log: UsageLog; other: LogOtherData }) {
  const { t } = useTranslation()
  const { log, other } = props

  const promptTokens = log.prompt_tokens || 0
  const completionTokens = log.completion_tokens || 0
  const cacheRead = acuCacheReadTokens(other)
  const cacheWrite = other.cache_creation_tokens || 0
  const cacheWrite5m = other.cache_creation_tokens_5m || 0
  const cacheWrite1h = other.cache_creation_tokens_1h || 0
  const hasTokens = promptTokens > 0 || completionTokens > 0

  if (!hasTokens) return null

  const rows: Array<{ label: string; value: string }> = []

  rows.push({ label: t('Input Tokens'), value: promptTokens.toLocaleString() })
  rows.push({
    label: t('Output Tokens'),
    value: completionTokens.toLocaleString(),
  })

  if (cacheRead > 0) {
    rows.push({
      label: t('Cache Read'),
      value: cacheRead.toLocaleString(),
    })
  }

  if (cacheWrite > 0 && cacheWrite5m === 0 && cacheWrite1h === 0) {
    rows.push({
      label: t('Cache Write'),
      value: cacheWrite.toLocaleString(),
    })
  }

  if (cacheWrite5m > 0) {
    rows.push({
      label: t('Cache Write (5m)'),
      value: cacheWrite5m.toLocaleString(),
    })
  }

  if (cacheWrite1h > 0) {
    rows.push({
      label: t('Cache Write (1h)'),
      value: cacheWrite1h.toLocaleString(),
    })
  }

  if (other.image && other.image_output) {
    rows.push({
      label: t('Image Tokens'),
      value: other.image_output.toLocaleString(),
    })
  }

  return (
    <DetailSection label={t('Token Breakdown')}>
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} mono />
      ))}
    </DetailSection>
  )
}

export function AcuDecisionVisualization(props: {
  route: NonNullable<
    NonNullable<LogOtherData['acu_cost_breakdown']>['route_decision']
  >
  breakdown: NonNullable<LogOtherData['acu_cost_breakdown']>
  other: LogOtherData
  actualModel: string
  isAdmin?: boolean
}) {
  const { t } = useTranslation()
  const { route, breakdown, other } = props
  const isAdmin = props.isAdmin === true
  const candidates = route.candidate_estimates ?? []
  const snapshotCandidates = route.decision_snapshot?.candidates ?? []
  const curves = route.curves ?? {}
  const modelIds = Object.keys(curves)
  const selectedModel =
    route.decision_snapshot?.selectedModel ??
    String(route.selected_profile?.modelId ?? breakdown.selected_model ?? '')
  const difficulty = Number(route.difficulty ?? breakdown.difficulty ?? 0)
  const pareto = new Set(route.pareto_frontier ?? [])
  const candidateIdentity = (candidate: {
    candidateId?: string
    modelId?: string
  }) => candidate.candidateId ?? candidate.modelId ?? ''
  const selectedCandidateId =
    route.decision_snapshot?.selectedCandidateId ??
    (route.decision_snapshot as { selected_candidate_id?: string } | undefined)
      ?.selected_candidate_id
  const candidateById = new Map(
    candidates.map((candidate) => [candidateIdentity(candidate), candidate])
  )
  const snapshotById = new Map(
    snapshotCandidates.map((candidate) => [
      candidateIdentity(candidate),
      candidate,
    ])
  )
  const candidateForModel = (modelId: string) =>
    candidates.find((candidate) => candidate.modelId === modelId)
  const snapshotForModel = (modelId: string) =>
    snapshotCandidates.find((candidate) => candidate.modelId === modelId)
  const selectedCandidate =
    (selectedCandidateId
      ? candidateById.get(selectedCandidateId)
      : undefined) ??
    candidates.find((candidate) => candidate.selected === true)
  const isSelectedCandidate = (candidate: {
    candidateId?: string
    modelId?: string
    selected?: boolean
  }) =>
    selectedCandidateId
      ? candidateIdentity(candidate) === selectedCandidateId
      : candidate.selected === true ||
        (!candidates.some((item) => item.candidateId) &&
          candidate.modelId === selectedModel)
  const curveData = Array.from({ length: 101 }, (_, difficultyValue) => {
    const row: Record<string, number> = { difficulty: difficultyValue }
    for (const modelId of modelIds) {
      const point = curves[modelId]?.find(
        (entry) => entry.difficulty === difficultyValue
      )
      const quality = point?.estimatedQuality ?? point?.estimated_quality
      if (quality != null) row[modelId] = quality
    }
    return row
  })
  const qualityForCandidate = (candidateId: string) => {
    const value = Number(candidateById.get(candidateId)?.estimatedQuality ?? 0)
    return value <= 1 ? value * 100 : value
  }
  const qualityForModel = (modelId: string) =>
    qualityForCandidate(candidateIdentity(candidateForModel(modelId) ?? {}))
  const cashCostForCandidate = (candidateId: string): number | null => {
    const snapshotCost = snapshotById.get(candidateId)?.effectiveCashCost
    const rawCost =
      snapshotCost ?? candidateById.get(candidateId)?.expectedTotalCost
    if (rawCost == null) return null
    const cost = Number(rawCost)
    return Number.isFinite(cost) ? cost : null
  }
  const cashCostForModel = (modelId: string): number | null => {
    const snapshot = snapshotForModel(modelId)
    const candidate = candidateForModel(modelId)
    const snapshotCost = snapshot?.effectiveCashCost
    const rawCost = snapshotCost ?? candidate?.expectedTotalCost
    if (rawCost == null) return null
    const cost = Number(rawCost)
    return Number.isFinite(cost) ? cost : null
  }
  const displayNameForCandidate = (candidateId: string) =>
    candidateById.get(candidateId)?.displayName ||
    snapshotById.get(candidateId)?.displayName ||
    candidateId
  const displayNameForModel = (modelId: string) =>
    candidateForModel(modelId)?.displayName ||
    snapshotForModel(modelId)?.displayName ||
    modelId
  const selectedCandidateKey = selectedCandidate
    ? candidateIdentity(selectedCandidate)
    : selectedCandidateId
  const selectedQuality = selectedCandidateKey
    ? qualityForCandidate(selectedCandidateKey)
    : qualityForModel(selectedModel)
  const selectedCost = selectedCandidateKey
    ? cashCostForCandidate(selectedCandidateKey)
    : cashCostForModel(selectedModel)
  const candidateReason = (candidateId: string) => {
    const candidate = candidateById.get(candidateId)
    if (!candidate) return '-'
    if (isSelectedCandidate(candidate)) return t('Selected')
    const isPareto =
      pareto.has(candidateId) || candidate.paretoEfficient === true
    if (!isPareto) {
      return t(
        'Dominated by another option with higher quality and lower cost.'
      )
    }
    const quality = qualityForCandidate(candidateId)
    const cost = cashCostForCandidate(candidateId)
    if (cost == null || selectedCost == null) {
      return candidate.selectionReason ?? '-'
    }
    if (cost < selectedCost && quality < selectedQuality) {
      return t('Lower cost, but the estimated quality gain is insufficient.')
    }
    if (quality > selectedQuality && cost > selectedCost) {
      return t('Higher quality, but the marginal cost increases materially.')
    }
    return t('Overall value is lower than the selected option.')
  }
  const attempts = breakdown.channel_attempts ?? []
  const counterfactual = Number(
    breakdown.counterfactual_quality_ceiling_cost_cny ?? 0
  )
  const actualCost = Number(breakdown.actual_total_cash_cost_cny ?? 0)
  const reduction =
    counterfactual > 0
      ? Math.max(0, ((counterfactual - actualCost) / counterfactual) * 100)
      : null

  return (
    <DetailSection
      icon={<Target className='size-3' aria-hidden='true' />}
      iconTone='success'
      label={t('ACU Routing Decision')}
    >
      <div className='grid gap-2 border-b pb-2 sm:grid-cols-3 lg:grid-cols-6'>
        <DetailRow label={t('Difficulty')} value={difficulty.toFixed(1)} mono />
        <DetailRow
          label={t('Routing Preference')}
          value={
            route.routing_preference ?? breakdown.routing_preference ?? '-'
          }
          mono
        />
        <DetailRow
          label={t('Phase')}
          value={route.phase ?? breakdown.phase ?? '-'}
          mono
        />
        <DetailRow
          label={t('Selected Model')}
          value={selectedModel || props.actualModel}
          mono
        />
        {isAdmin ? (
          <>
            <DetailRow
              label={t('Actual Provider')}
              value={other.actual_provider ?? breakdown.actual_provider ?? '-'}
              mono
            />
            <DetailRow
              label={t('Actual Channel')}
              value={other.actual_channel ?? breakdown.channel_id ?? '-'}
              mono
            />
          </>
        ) : (
          <DetailRow
            label={t('Execution route', { defaultValue: '执行线路' })}
            value={publicChannelAlias(
              other.actual_provider ?? breakdown.actual_provider,
              other.actual_channel ?? breakdown.channel_id
            )}
            mono
          />
        )}
      </div>

      {modelIds.length > 0 && (
        <div className='space-y-2 pt-1'>
          <div className='h-[340px] min-h-[340px] w-full sm:h-[400px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={curveData}
                margin={{ top: 18, right: 22, bottom: 12, left: 0 }}
              >
                <CartesianGrid strokeDasharray='3 3' opacity={0.35} />
                <XAxis
                  dataKey='difficulty'
                  type='number'
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  label={{
                    value: t('Task Difficulty'),
                    position: 'insideBottom',
                    offset: -8,
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  width={34}
                  label={{
                    value: t('Estimated Quality'),
                    angle: -90,
                    position: 'insideLeft',
                  }}
                />
                <Tooltip
                  content={({ active, label, payload }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className='bg-popover text-popover-foreground max-w-[19rem] space-y-1 border p-2 text-xs shadow-md'>
                        <div className='font-medium'>
                          {t('Difficulty')}: {Number(label).toFixed(1)}
                        </div>
                        {payload.map((entry) => {
                          const modelId = String(
                            entry.dataKey ?? entry.name ?? ''
                          )
                          const cost = cashCostForModel(modelId)
                          return (
                            <div
                              key={modelId}
                              className='grid grid-cols-[minmax(7rem,1fr)_auto] gap-x-3'
                            >
                              <span>{displayNameForModel(modelId)}</span>
                              <span className='font-mono'>
                                {t('Quality')} {Number(entry.value).toFixed(1)}{' '}
                                ·{' '}
                                {cost == null
                                  ? t('Cost unavailable')
                                  : `¥${cost.toFixed(6)}`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                <Legend
                  formatter={(value) => displayNameForModel(String(value))}
                />
                <ReferenceLine
                  x={difficulty}
                  stroke='#111827'
                  strokeDasharray='5 4'
                  label={{
                    value: `D ${difficulty.toFixed(1)}`,
                    position: 'insideTopRight',
                  }}
                />
                {modelIds.map((modelId, index) => (
                  <Line
                    key={modelId}
                    type='monotone'
                    dataKey={modelId}
                    stroke={ACU_CURVE_COLORS[index % ACU_CURVE_COLORS.length]}
                    strokeWidth={modelId === selectedModel ? 3.5 : 1.8}
                    strokeOpacity={modelId === selectedModel ? 1 : 0.72}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
                {candidates.map((candidate, index) => {
                  const modelId = candidate.modelId ?? ''
                  if (!modelId) return null
                  const candidateId = candidateIdentity(candidate)
                  const selected = isSelectedCandidate(candidate)
                  const quality = qualityForCandidate(candidateId)
                  const cost = cashCostForCandidate(candidateId)
                  const labelPosition = index % 2 === 0 ? 'top' : 'bottom'
                  return (
                    <ReferenceDot
                      key={candidateId}
                      x={difficulty}
                      y={quality}
                      r={selected ? 6 : 4}
                      fill={ACU_CURVE_COLORS[index % ACU_CURVE_COLORS.length]}
                      stroke={selected ? '#111827' : '#ffffff'}
                      strokeWidth={selected ? 2 : 1}
                      label={{
                        value: `${displayNameForCandidate(candidateId)} · Q ${quality.toFixed(1)} · ${cost == null ? t('Cost unavailable') : `¥${cost.toFixed(6)}`}`,
                        position: labelPosition,
                        offset: 10 + Math.floor(index / 2) * 12,
                        fill: selected ? '#111827' : '#4b5563',
                        fontSize: selected ? 12 : 10,
                        fontWeight: selected ? 700 : 500,
                      }}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Estimated quality is a curve estimate, not the measured success rate of this request.'
            )}
          </p>
        </div>
      )}

      <div className='space-y-1.5 border-t pt-2'>
        <div className='text-xs font-semibold'>
          {t('All Eligible Candidates')}
        </div>
        <div className='overflow-x-auto'>
          <div className='min-w-[620px]'>
            <div className='text-muted-foreground grid grid-cols-[minmax(11rem,1.6fr)_6rem_7.5rem_6rem_minmax(10rem,1.4fr)] gap-2 border-b pb-1 text-[11px]'>
              <span>{t('Model')}</span>
              <span>{t('Quality')}</span>
              <span>{t('Estimated Cost')}</span>
              <span>{t('Pareto')}</span>
              <span>{t('Selection')}</span>
            </div>
            {candidates.map((candidate) => {
              const candidateId = candidateIdentity(candidate)
              const selected = isSelectedCandidate(candidate)
              return (
                <div
                  key={candidateId}
                  className={cn(
                    'grid grid-cols-[minmax(11rem,1.6fr)_6rem_7.5rem_6rem_minmax(10rem,1.4fr)] gap-2 border-b py-1.5 text-xs last:border-b-0',
                    selected &&
                      'bg-emerald-50 font-medium dark:bg-emerald-950/25'
                  )}
                >
                  <span className='font-mono'>
                    {displayNameForCandidate(candidateId)}
                  </span>
                  <span>{qualityForCandidate(candidateId).toFixed(1)}</span>
                  <span className='font-mono'>
                    {cashCostForCandidate(candidateId) == null
                      ? t('Cost unavailable')
                      : `¥${Number(cashCostForCandidate(candidateId)).toFixed(6)}`}
                  </span>
                  <span>
                    {pareto.has(candidateId) || candidate.paretoEfficient
                      ? t('Yes')
                      : t('No')}
                  </span>
                  <span>{candidateReason(candidateId)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className='grid gap-2 border-t pt-2 sm:grid-cols-2'>
        <div className='space-y-1'>
          <div className='text-xs font-semibold'>{t('Final Selection')}</div>
          <DetailRow
            label={t('Model')}
            value={selectedModel || props.actualModel}
            mono
          />
          <DetailRow
            label={t('Reason')}
            value={
              route.decision_snapshot?.modelSelectionReason ??
              route.route_explanation ??
              breakdown.route_reason ??
              '-'
            }
          />
          {isAdmin && (
            <DetailRow
              label={t('Channel Reason')}
              value={
                route.decision_snapshot?.channelSelectionReason ??
                breakdown.provider_selection_reason ??
                '-'
              }
            />
          )}
        </div>
        <div className='space-y-1'>
          <div className='text-xs font-semibold'>{t('Cost Outcome')}</div>
          <DetailRow
            label={t('Actual Cost')}
            value={`¥${actualCost.toFixed(8)}`}
            mono
          />
          <DetailRow
            label={t('Quality Ceiling Cost')}
            value={counterfactual > 0 ? `¥${counterfactual.toFixed(8)}` : '-'}
            mono
          />
          <DetailRow
            label={t('Reduction')}
            value={reduction == null ? '-' : `${reduction.toFixed(2)}%`}
            mono
          />
        </div>
      </div>

      {attempts.length > 0 && (
        <div className='space-y-1.5 border-t pt-2'>
          <div className='flex items-center gap-1 text-xs font-semibold'>
            <TimerReset className='size-3.5' aria-hidden='true' />
            {t('Channel Attempt Timeline')}
          </div>
          <div className='space-y-0'>
            {attempts.map((attempt, index) => (
              <div
                key={`${attempt.attempt_index ?? index}-${attempt.execution_profile_id ?? ''}`}
                className='grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 pb-2 last:pb-0'
              >
                <div className='flex flex-col items-center'>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                      attempt.status === 'success'
                        ? 'bg-emerald-600'
                        : 'bg-rose-600'
                    )}
                  >
                    {attempt.attempt_index ?? index + 1}
                  </span>
                  {index < attempts.length - 1 && (
                    <span className='bg-border mt-1 h-full w-px' />
                  )}
                </div>
                <div className='grid gap-1 text-xs sm:grid-cols-4'>
                  {isAdmin ? (
                    <>
                      <span className='font-medium'>
                        {attempt.provider ?? '-'}
                      </span>
                      <span className='font-mono'>
                        {attempt.channel ?? '-'}
                      </span>
                    </>
                  ) : (
                    <span className='font-medium'>
                      {publicChannelAlias(
                        attempt.provider,
                        attempt.channel_id ?? attempt.channel
                      )}
                    </span>
                  )}
                  <span>{attempt.status ?? '-'}</span>
                  <span className='text-muted-foreground'>
                    {attempt.error_category ||
                      (attempt.http_status
                        ? `HTTP ${attempt.http_status}`
                        : '-')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(route.excluded_profiles?.length ?? 0) > 0 && (
        <details className='border-t pt-2 text-xs'>
          <summary className='cursor-pointer font-semibold'>
            {t('Excluded Models')}
          </summary>
          <div className='mt-2 space-y-1'>
            {route.excluded_profiles?.map((excluded) => (
              <DetailRow
                key={`${excluded.executionProfileId ?? 'excluded'}-${excluded.exclusionReason ?? excluded.exclusionDetail ?? excluded.reasons?.join(',')}`}
                label={
                  isAdmin
                    ? (excluded.executionProfileId ?? t('Profile'))
                    : t('Execution route', { defaultValue: '执行线路' })
                }
                value={
                  excluded.exclusionReason ??
                  excluded.reasons?.[0] ??
                  excluded.exclusionDetail ??
                  '-'
                }
                mono
              />
            ))}
          </div>
        </details>
      )}

      {breakdown.judge_explanation && (
        <details className='border-t pt-2 text-xs'>
          <summary className='cursor-pointer font-semibold'>
            {t('Judge Explanation')}
          </summary>
          <p className='mt-2 break-words whitespace-pre-wrap'>
            {breakdown.judge_explanation}
          </p>
        </details>
      )}

      <details className='border-t pt-2 text-xs'>
        <summary className='cursor-pointer font-semibold'>
          {t('Decision Versions')}
        </summary>
        <div className='mt-2 space-y-1'>
          <DetailRow
            label={t('Curve Version')}
            value={route.curve_version ?? '-'}
            mono
          />
          <DetailRow
            label={t('Price Version')}
            value={route.price_version ?? '-'}
            mono
          />
          <DetailRow
            label={t('Formula Version')}
            value={route.routing_formula_version ?? '-'}
            mono
          />
          <DetailRow
            label={t('Route Decision ID')}
            value={route.route_decision_id ?? '-'}
            mono
          />
        </div>
      </details>
    </DetailSection>
  )
}

interface DetailsDialogProps {
  log: UsageLog
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DetailsDialog(props: DetailsDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const details = props.log.content ?? ''
  const other = parseLogOther(props.log.other)
  const finalizedAcu = isFinalizedAcuUsageLog(props.log, other)
  const showAcuInternalDetails = shouldShowAcuInternalDetails(
    props.log,
    other,
    props.isAdmin
  )
  const acuRoute = acuBreakdownForView(other, props.isAdmin)
  const acuDecision = acuRoute?.route_decision
  const actualRouteChannel =
    acuRoute?.channel_id ??
    other?.admin_info?.actual_channel ??
    other?.actual_channel
  const actualRouteProvider =
    acuRoute?.actual_provider ??
    other?.admin_info?.actual_provider ??
    other?.actual_provider ??
    acuRoute?.selected_provider
  const advancedOther = other ?? ({} as LogOtherData)
  const showAcuAdvancedDetails =
    showAcuInternalDetails &&
    (Boolean(advancedOther.acu_logical_request_id) ||
      acuRoute?.billing_multiplier != null)
  const typeConfig = getLogTypeConfig(props.log.type)
  let judgeCostLabel = t('Judge Cost (CNY)')
  if (acuRoute?.judge_cost_status === 'estimated_blended') {
    judgeCostLabel = t('MiMo Judge Cost (Blended Estimate)')
  } else if (acuRoute?.judge_cost_status === 'mixed') {
    judgeCostLabel = t('Judge Cost (Mixed Estimate)')
  }

  const isViolation = isViolationFeeLog(other)
  const isRefund = props.log.type === 6
  const isConsume = props.log.type === 2
  const isTopup = props.log.type === 1
  const isManage = props.log.type === 3
  const isSubscription = other?.billing_source === 'subscription'
  const isTieredBilling =
    isConsume &&
    !isViolation &&
    other?.billing_mode === 'tiered_expr' &&
    !!other?.expr_b64
  const hasAudioTokens = other?.ws || other?.audio
  const showTiming = isTimingLogType(props.log.type)
  const showAdminIp =
    !!props.log.ip && (showTiming || (props.isAdmin && isTopup))
  const adminInfo = other?.admin_info
  const topupAuditFields =
    isTopup && props.isAdmin && adminInfo
      ? ([
          adminInfo.payment_method && {
            label: t('Order Payment Method'),
            value: adminInfo.payment_method,
          },
          adminInfo.callback_payment_method && {
            label: t('Callback Payment Method'),
            value: adminInfo.callback_payment_method,
          },
          adminInfo.caller_ip && {
            label: t('Callback Caller IP'),
            value: adminInfo.caller_ip,
          },
          adminInfo.server_ip && {
            label: t('Server IP'),
            value: adminInfo.server_ip,
          },
          adminInfo.node_name && {
            label: t('Node Name'),
            value: adminInfo.node_name,
          },
          adminInfo.version && {
            label: t('System Version'),
            value: adminInfo.version,
          },
        ].filter(Boolean) as Array<{ label: string; value: string }>)
      : []
  const showLegacyTopupWarning = isTopup && props.isAdmin && !adminInfo
  const showTopupAuditSection =
    isTopup &&
    props.isAdmin &&
    (topupAuditFields.length > 0 || showLegacyTopupWarning)
  const manageOperator = (() => {
    if (!isManage || !props.isAdmin || !adminInfo) return null
    const username = adminInfo.admin_username
    const id = adminInfo.admin_id
    const hasUsername = username != null && String(username).trim() !== ''
    const hasId = id != null && String(id).trim() !== ''
    if (!hasUsername && !hasId) return null
    if (hasUsername && hasId) return `${username} (ID: ${id})`
    if (hasUsername) return String(username)
    return `ID: ${id}`
  })()
  const authMethodLabel = (() => {
    if (!isManage || !props.isAdmin || !adminInfo?.auth_method) return ''
    if (adminInfo.auth_method === 'access_token') return t('Access Token')
    if (adminInfo.auth_method === 'session') return t('Session')
    return String(adminInfo.auth_method)
  })()

  // Localized operation text rendered from the language-independent op
  // descriptor (shared by audit type=3 and login type=7).
  const operationText = renderAuditContent(other, t)
  const auditRoute = isManage && props.isAdmin ? other?.audit_info : undefined
  // Channel update records which fields changed (stable field tokens); render
  // them with their localized labels for admins.
  const changedFieldTokens =
    isManage &&
    props.isAdmin &&
    Array.isArray(other?.op?.params?.changed_fields)
      ? (other.op.params.changed_fields as string[])
      : []
  const changedFieldsText = changedFieldTokens
    .map((field) => t(CHANNEL_FIELD_LABELS[field] ?? field))
    .join(', ')
  const showManageAuditSection =
    isManage && props.isAdmin && (operationText != null || auditRoute != null)

  // Login audit (type=7); visible to the log owner, not admin-only.
  const isLogin = props.log.type === 7
  const loginAuditFields = isLogin
    ? ([
        other?.login_method && {
          label: t('Login Method'),
          value: String(other.login_method),
        },
        props.log.ip && {
          label: t('IP Address'),
          value: props.log.ip,
        },
        other?.user_agent && {
          label: t('User Agent'),
          value: String(other.user_agent),
        },
      ].filter(Boolean) as Array<{ label: string; value: string }>)
    : []

  const conversionChain =
    other && Array.isArray(other.request_conversion)
      ? other.request_conversion.filter(Boolean)
      : []
  const conversionLabel =
    conversionChain.length <= 1
      ? t('Native format')
      : conversionChain.join(' -> ')
  const showConversion =
    props.isAdmin &&
    props.log.type !== 6 &&
    (other?.request_path || conversionChain.length > 0)

  const useChannel = other?.admin_info?.use_channel
  const channelChain =
    useChannel && useChannel.length > 0 ? useChannel.join(' → ') : undefined
  const reasoningEffort = acuRoute
    ? acuResolvedReasoningEffort(other, acuRoute)
    : other?.reasoning_effort
  let reasoningEffortVariant: StatusBadgeProps['variant'] = 'green'
  if (
    reasoningEffort === 'high' ||
    reasoningEffort === 'xhigh' ||
    reasoningEffort === 'max'
  ) {
    reasoningEffortVariant = 'orange'
  } else if (reasoningEffort === 'medium') {
    reasoningEffortVariant = 'yellow'
  }
  const acuPresentation = acuLogPresentation(other)
  let acuJudgeLabel = t('Judge unavailable')
  if (acuPresentation.judgeMode === 'reused') {
    acuJudgeLabel = t('Judge reused')
  } else if (acuPresentation.judgeMode === 'cache') {
    acuJudgeLabel = t('Judge cache')
  } else if (acuPresentation.judgeMode === 'rules_fallback') {
    acuJudgeLabel = t('Judge rules fallback')
  } else if (acuPresentation.judgeMode === 'profile_failover') {
    acuJudgeLabel = t('Judge Profile failover')
  } else if (acuPresentation.judgeMode === 'judge') {
    acuJudgeLabel = `${t('Judge')} · ${acuPresentation.judgeModel || '—'}`
  } else if (acuPresentation.judgeMode === 'not_required') {
    acuJudgeLabel = t('Judge not required')
  } else if (acuPresentation.judgeMode === 'pending') {
    acuJudgeLabel = t('Waiting for ACU finalize')
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          {t('Log Details')}
          <StatusBadge
            label={t(typeConfig.label)}
            variant={typeConfig.color as StatusBadgeProps['variant']}
            size='sm'
            copyable={false}
          />
        </>
      }
      description={t('View the complete details for this log entry')}
      contentClassName={cn(
        'min-w-0 overflow-hidden',
        'max-sm:max-h-[calc(100dvh-1.5rem)] max-sm:w-[calc(100vw-1.5rem)] max-sm:max-w-[calc(100vw-1.5rem)] max-sm:p-4',
        isTieredBilling || acuDecision
          ? 'sm:max-w-6xl lg:max-w-7xl'
          : 'sm:max-w-lg'
      )}
      headerClassName='max-sm:gap-1'
      titleClassName='flex items-center gap-2 text-base'
      descriptionClassName='sr-only'
      contentHeight='min(72dvh, 720px)'
      bodyClassName='pr-2 sm:pr-4'
    >
      <div className='w-full max-w-full min-w-0 space-y-2.5 overflow-x-hidden py-1 sm:space-y-3'>
        {props.isAdmin && props.open && other?.acu_logical_request_id && (
          <AcuSessionTraceDisclosure
            identifier={other.acu_logical_request_id}
            isAdmin={props.isAdmin}
          />
        )}
        {showAcuInternalDetails && !!other?.acu_related_events?.length && (
          <details className='border-border/70 min-w-0 rounded-md border p-3 text-xs'>
            <summary className='cursor-pointer font-medium'>
              {t('Related request events')} (
              {other.acu_related_events.length + 1})
            </summary>
            <div className='mt-2 space-y-1.5'>
              {other.acu_related_events.map((event) => (
                <div
                  key={event.id}
                  className='bg-muted/30 flex min-w-0 flex-wrap items-center gap-x-2 rounded px-2 py-1.5'
                >
                  <span className='font-mono'>#{event.id}</span>
                  <span>
                    {event.status
                      ? `HTTP ${event.status}`
                      : t('Finalization event')}
                  </span>
                  <span className='text-muted-foreground min-w-0 break-words'>
                    {event.content}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
        {finalizedAcu && acuRoute && (
          <DetailSection label={t('Request')}>
            <div className='grid gap-1.5 sm:grid-cols-2'>
              <DetailRow
                label={t('Requested Model')}
                value={acuRoute.requested_model || '—'}
                mono
              />
              <DetailRow
                label={t('Actual Model')}
                value={acuRoute.canonical_model || props.log.model_name}
                mono
              />
              <DetailRow
                label={t('Thinking effort')}
                value={
                  reasoningEffort === 'default'
                    ? t('Model default')
                    : reasoningEffort || t('Model default')
                }
                mono
              />
              <DetailRow label={t('Judge')} value={acuJudgeLabel} mono />
            </div>
          </DetailSection>
        )}
        {showAcuInternalDetails && acuDecision && acuRoute && other && (
          <AcuDecisionVisualization
            route={acuDecision}
            breakdown={acuRoute}
            other={other}
            actualModel={props.log.model_name}
            isAdmin={props.isAdmin}
          />
        )}
        {/* Overview section - key identifiers */}
        <div className='min-w-0 space-y-1'>
          {props.log.request_id && (
            <DetailRow
              label={t('Request ID')}
              value={props.log.request_id}
              mono
            />
          )}
          {props.log.upstream_request_id && (
            <DetailRow
              label={t('Upstream Request ID')}
              value={props.log.upstream_request_id}
              mono
            />
          )}

          {props.isAdmin && props.log.channel > 0 && (
            <DetailRow
              label={t('Channel')}
              value={
                <span>
                  {props.log.channel}
                  {props.log.channel_name && (
                    <span className='text-muted-foreground'>
                      {' '}
                      ({props.log.channel_name})
                    </span>
                  )}
                </span>
              }
              mono
            />
          )}

          {channelChain && props.isAdmin && (
            <DetailRow label={t('Retry Chain')} value={channelChain} mono />
          )}

          {props.log.token_name && (
            <DetailRow label={t('Token')} value={props.log.token_name} mono />
          )}

          {(props.log.group || other?.group) && (
            <DetailRow
              label={t('Group')}
              value={props.log.group || other?.group || ''}
              mono
            />
          )}

          {!props.isAdmin && actualRouteChannel && !acuDecision && (
            <DetailRow
              label={t('Execution route', { defaultValue: '执行线路' })}
              value={publicChannelAlias(
                actualRouteProvider,
                actualRouteChannel
              )}
              mono
            />
          )}

          {showAdminIp && (
            <DetailRow
              label={t('IP Address')}
              value={
                <span className='flex items-center gap-1'>
                  <Globe className='size-3 text-amber-500' aria-hidden='true' />
                  {props.log.ip}
                </span>
              }
              mono
            />
          )}

          {showTiming && acuDurationSeconds(props.log, other) > 0 && (
            <DetailRow
              label={t('Response Time')}
              value={
                <span
                  className={cn(
                    'font-medium',
                    timingTextColorClass(
                      getResponseTimeColor(
                        acuDurationSeconds(props.log, other),
                        props.log.completion_tokens
                      )
                    )
                  )}
                >
                  {formatUseTime(acuDurationSeconds(props.log, other))}
                  {(props.log.is_stream || acuRoute) &&
                    acuFirstTokenMs(other) != null && (
                      <span
                        className={cn(
                          'font-normal',
                          timingTextColorClass(
                            getFirstResponseTimeColor(
                              (acuFirstTokenMs(other) ?? 0) / 1000
                            )
                          )
                        )}
                      >
                        {' '}
                        ({t('First response')}:{' '}
                        {formatUseTime((acuFirstTokenMs(other) ?? 0) / 1000)})
                      </span>
                    )}
                </span>
              }
            />
          )}
        </div>

        {finalizedAcu && acuRoute && (
          <AcuExecutionAttempts breakdown={acuRoute} isAdmin={props.isAdmin} />
        )}

        {showAcuAdvancedDetails && (
          <DetailSection label={t('ACU Advanced Details')}>
            {acuRoute?.mode && (
              <DetailRow label={t('Mode')} value={acuRoute.mode} mono />
            )}
            {acuRoute?.difficulty != null && (
              <DetailRow
                label={t('Difficulty')}
                value={Number(acuRoute.difficulty).toFixed(1)}
                mono
              />
            )}
            {acuRoute?.routing_preference && (
              <DetailRow
                label={t('Routing Preference')}
                value={acuRoute.routing_preference}
                mono
              />
            )}
            {acuRoute?.candidate_count != null && (
              <DetailRow
                label={t('Candidates')}
                value={String(acuRoute.candidate_count)}
                mono
              />
            )}
            {acuRoute?.client_declared_web_tool != null && (
              <DetailRow
                label={t('Client Declared Web Tool')}
                value={String(acuRoute.client_declared_web_tool)}
                mono
              />
            )}
            {acuRoute?.web_intent && (
              <DetailRow
                label={t('Web Intent')}
                value={acuRoute.web_intent}
                mono
              />
            )}
            {acuRoute?.web_intent_source && (
              <DetailRow
                label={t('Web Intent Source')}
                value={acuRoute.web_intent_source}
                mono
              />
            )}
            {acuRoute?.web_actually_invoked != null && (
              <DetailRow
                label={t('Web Actually Invoked')}
                value={String(acuRoute.web_actually_invoked)}
                mono
              />
            )}
            {acuRoute?.web_search_event_status && (
              <DetailRow
                label={t('Web Search Event Status')}
                value={acuRoute.web_search_event_status.join(' -> ')}
                mono
              />
            )}
            {acuRoute?.web_profile_verified != null && (
              <DetailRow
                label={t('Web Profile Verified')}
                value={String(acuRoute.web_profile_verified)}
                mono
              />
            )}
            {props.isAdmin &&
              acuRoute?.web_fallback_chain &&
              acuRoute.web_fallback_chain.length > 0 && (
                <DetailRow
                  label={t('Web Fallback Chain')}
                  value={acuRoute.web_fallback_chain.join(' -> ')}
                  mono
                />
              )}
            {acuRoute?.web_tool_pruned != null && (
              <DetailRow
                label={t('Web Tool Pruned')}
                value={String(acuRoute.web_tool_pruned)}
                mono
              />
            )}
            {acuRoute?.web_tool_prune_reason && (
              <DetailRow
                label={t('Prune Reason')}
                value={acuRoute.web_tool_prune_reason}
              />
            )}
            {acuRoute?.selected_model && (
              <DetailRow
                label={t('Selected Model')}
                value={acuRoute.selected_model}
                mono
              />
            )}
            {acuRoute?.canonical_model && (
              <DetailRow
                label={t('Canonical Model')}
                value={acuRoute.canonical_model}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.provider_model && (
              <DetailRow
                label={t('Provider Model')}
                value={acuRoute.provider_model}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.selected_provider && (
              <DetailRow
                label={t('Selected Provider')}
                value={acuRoute.selected_provider}
                mono
              />
            )}
            <DetailRow
              label={t('Actual Model')}
              value={props.log.model_name}
              mono
            />
            {props.isAdmin && advancedOther.actual_provider && (
              <DetailRow
                label={t('Actual Provider')}
                value={advancedOther.actual_provider}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.provider_selection_reason && (
              <DetailRow
                label={t('Provider Selection Reason')}
                value={acuRoute.provider_selection_reason}
              />
            )}
            {acuRoute?.model_selection_reason && (
              <DetailRow
                label={t('Model Selection Reason')}
                value={acuRoute.model_selection_reason}
              />
            )}
            {props.isAdmin && acuRoute?.routing_group && (
              <DetailRow
                label={t('Routing Group')}
                value={acuRoute.routing_group}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.channel_id && (
              <DetailRow
                label={t('Channel ID')}
                value={acuRoute.channel_id}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.network_endpoint && (
              <DetailRow
                label={t('Network Endpoint')}
                value={acuRoute.network_endpoint}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.fallback_chain && (
              <DetailRow
                label={t('Fallback Chain')}
                value={acuRoute.fallback_chain}
                mono
              />
            )}
            {acuRoute?.circuit_state && (
              <DetailRow
                label={t('Circuit State')}
                value={acuRoute.circuit_state}
                mono
              />
            )}
            {acuRoute?.cooldown_until && (
              <DetailRow
                label={t('Cooldown Until')}
                value={acuRoute.cooldown_until}
                mono
              />
            )}
            {acuRoute?.error_class && (
              <DetailRow
                label={t('Error Class')}
                value={acuRoute.error_class}
                mono
              />
            )}
            {acuRoute?.recent_success_rate != null && (
              <DetailRow
                label={t('Recent Success Rate')}
                value={`${(acuRoute.recent_success_rate * 100).toFixed(1)}%`}
                mono
              />
            )}
            {acuRoute?.effective_cost_status && (
              <DetailRow
                label={t('Effective Cost Status')}
                value={acuRoute.effective_cost_status}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.billing_multiplier != null && (
              <DetailRow
                label={t('Supplier billing multiplier')}
                value={String(acuRoute.billing_multiplier)}
                mono
              />
            )}
            {props.isAdmin && advancedOther.actual_channel && (
              <DetailRow
                label={t('Actual Channel')}
                value={advancedOther.actual_channel}
                mono
              />
            )}
            {advancedOther.acu_logical_request_id && (
              <DetailRow
                label={t('Logical Request ID')}
                value={advancedOther.acu_logical_request_id}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.nominal_provider_cost_usd != null && (
              <DetailRow
                label={t('Nominal Provider Cost (USD)')}
                value={`$${Number(acuRoute.nominal_provider_cost_usd).toFixed(10)}`}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.provider_balance_charge != null && (
              <DetailRow
                label={t('Provider Credits Deduction')}
                value={`${Number(acuRoute.provider_balance_charge).toFixed(10)} Credits`}
                mono
              />
            )}
            {props.isAdmin &&
              acuRoute?.provider_credit_cash_cost_cny != null && (
                <DetailRow
                  label={t('Provider Credit Cash Conversion')}
                  value={`¥${Number(acuRoute.provider_credit_cash_cost_cny).toFixed(10)} / Credit`}
                  mono
                />
              )}
            {props.isAdmin && acuRoute?.effective_cash_cost_cny != null && (
              <DetailRow
                label={t('Effective Cash Cost (CNY)')}
                value={`¥${Number(acuRoute.effective_cash_cost_cny).toFixed(8)}`}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.judge_cash_cost_cny != null && (
              <DetailRow
                label={judgeCostLabel}
                value={`¥${Number(acuRoute.judge_cash_cost_cny).toFixed(8)}`}
                mono
              />
            )}
            {props.isAdmin &&
              (acuRoute?.judge_cost_status === 'estimated_blended' ||
                acuRoute?.judge_cost_status === 'mixed') &&
              acuRoute.judge_official_payg_equivalent_cost != null && (
                <DetailRow
                  label={t('MiMo Official PAYG Equivalent')}
                  value={`¥${Number(acuRoute.judge_official_payg_equivalent_cost).toFixed(8)}`}
                  mono
                />
              )}
            {acuRoute?.judge_model && (
              <DetailRow
                label={t('Judge Model')}
                value={acuRoute.judge_model}
                mono
              />
            )}
            {props.isAdmin && acuRoute?.judge_cost_status && (
              <DetailRow
                label={t('Judge Cost Status')}
                value={acuRoute.judge_cost_status}
                mono
              />
            )}
            {props.isAdmin &&
              acuRoute?.failed_attempt_cash_cost_cny != null && (
                <DetailRow
                  label={t('Failed Attempt Cost (CNY)')}
                  value={`¥${Number(acuRoute.failed_attempt_cash_cost_cny).toFixed(8)}`}
                  mono
                />
              )}
            {props.isAdmin && acuRoute?.actual_total_cash_cost_cny != null && (
              <DetailRow
                label={t('Actual Total Cost (CNY)')}
                value={`¥${Number(acuRoute.actual_total_cash_cost_cny).toFixed(8)}`}
                mono
              />
            )}
            {acuRoute?.user_charge != null && (
              <DetailRow
                label={t('Actual charge')}
                value={`¥${Number(acuRoute.user_charge).toFixed(8)}`}
                mono
              />
            )}
            {props.isAdmin &&
              acuRoute?.counterfactual_quality_ceiling_cost_cny != null && (
                <DetailRow
                  label={t('Quality Ceiling Counterfactual Cost (CNY)')}
                  value={`¥${Number(acuRoute.counterfactual_quality_ceiling_cost_cny).toFixed(8)}`}
                  mono
                />
              )}
            {props.isAdmin &&
              acuRoute?.counterfactual_quality_ceiling_cost_cny != null &&
              acuRoute.actual_total_cash_cost_cny != null &&
              acuRoute.counterfactual_quality_ceiling_cost_cny > 0 && (
                <DetailRow
                  label={t('Cost Reduction vs Quality Ceiling')}
                  value={`${Math.max(0, ((acuRoute.counterfactual_quality_ceiling_cost_cny - acuRoute.actual_total_cash_cost_cny) / acuRoute.counterfactual_quality_ceiling_cost_cny) * 100).toFixed(2)}%`}
                  mono
                />
              )}
            {props.isAdmin && acuRoute?.reference_provider && (
              <DetailRow
                label={t('Reference Provider')}
                value={acuRoute.reference_provider}
                mono
              />
            )}
            {props.isAdmin &&
              acuRoute?.effective_savings_vs_reference_cny != null && (
                <DetailRow
                  label={t('Effective Savings vs Reference (CNY)')}
                  value={`¥${Number(acuRoute.effective_savings_vs_reference_cny).toFixed(8)}`}
                  mono
                />
              )}
            {advancedOther.cached_input_tokens != null && (
              <DetailRow
                label={t('Cached Input Tokens')}
                value={String(advancedOther.cached_input_tokens)}
                mono
              />
            )}
            {advancedOther.reasoning_tokens != null && (
              <DetailRow
                label={t('Reasoning Tokens')}
                value={String(advancedOther.reasoning_tokens)}
                mono
              />
            )}
            {acuRoute?.quality_upper_bound_model && (
              <DetailRow
                label={t('Quality Upper Bound Model')}
                value={acuRoute.quality_upper_bound_model}
                mono
              />
            )}
            {acuRoute?.estimated_cost_reduction_vs_quality_upper_bound_usd !=
              null && (
              <DetailRow
                label={t('Estimated Cost Reduction vs Quality Upper Bound')}
                value={`$${Number(acuRoute.estimated_cost_reduction_vs_quality_upper_bound_usd).toFixed(6)}`}
                mono
              />
            )}
            {acuRoute?.estimated_cost_reduction_vs_quality_upper_bound_cny !=
              null && (
              <DetailRow
                label={t(
                  'Estimated Cost Reduction vs Quality Upper Bound (CNY)'
                )}
                value={`¥${Number(acuRoute.estimated_cost_reduction_vs_quality_upper_bound_cny).toFixed(8)}`}
                mono
              />
            )}
            {acuRoute?.route_reason && (
              <DetailRow
                label={t('Route Reason')}
                value={acuRoute.route_reason}
              />
            )}
          </DetailSection>
        )}

        {/* Request conversion (admin only, not for refund) */}
        {showConversion && (
          <DetailSection label={t('Request Conversion')}>
            <div className='relative min-w-0'>
              <Button
                variant='ghost'
                size='sm'
                className='absolute top-0 right-0 h-5 w-5 p-0'
                onClick={() => copyToClipboard(conversionLabel)}
                title={t('Copy to clipboard')}
                aria-label={t('Copy to clipboard')}
              >
                {copiedText === conversionLabel ? (
                  <Check className='size-3 text-green-600' />
                ) : (
                  <Copy className='size-3' />
                )}
              </Button>
              <div className='min-w-0 space-y-1 pr-6'>
                {other?.request_path && (
                  <DetailRow
                    label={t('Path')}
                    value={other.request_path}
                    mono
                  />
                )}
                <div className='flex min-w-0 items-center gap-1.5 text-xs'>
                  <Route
                    className='text-muted-foreground size-3'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 break-all sm:wrap-break-word'>
                    {conversionLabel}
                  </span>
                </div>
              </div>
            </div>
          </DetailSection>
        )}

        {/* Quota saturation marker (admin only) */}
        {props.isAdmin && other?.admin_info?.quota_saturation && (
          <DetailSection
            icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
            label={t('Quota clamped')}
            variant='danger'
          >
            <p className='mb-1 text-xs wrap-break-word'>
              {t('Quota saturation protection triggered')}
            </p>
            <DetailRow
              label={t('Kind')}
              value={quotaSaturationKindLabel(
                other.admin_info.quota_saturation.kind,
                t
              )}
            />
            <DetailRow
              label={t('Original value')}
              value={String(other.admin_info.quota_saturation.original)}
              mono
            />
            <DetailRow
              label={t('Clamped to')}
              value={String(other.admin_info.quota_saturation.clamped)}
              mono
            />
            <DetailRow
              label={t('Operation')}
              value={other.admin_info.quota_saturation.op}
              mono
            />
          </DetailSection>
        )}

        {/* Reject reason (admin only) */}
        {props.isAdmin && other?.reject_reason && (
          <DetailSection
            icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
            label={t('Reject Reason')}
            variant='danger'
          >
            <p className='text-xs wrap-break-word'>{other.reject_reason}</p>
          </DetailSection>
        )}

        {/* Violation fee info */}
        {isViolation && other && (
          <DetailSection
            icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
            label={t('Violation Fee')}
            variant='danger'
          >
            {other.violation_fee_code && (
              <DetailRow
                label={t('Violation Code')}
                value={other.violation_fee_code}
                mono
              />
            )}
            {other.violation_fee_marker && (
              <DetailRow
                label={t('Violation Marker')}
                value={other.violation_fee_marker}
              />
            )}
            <DetailRow
              label={t('Fee Amount')}
              value={formatLogQuota(other.fee_quota ?? props.log.quota)}
              mono
            />
          </DetailSection>
        )}

        {/* Refund details (type=6) */}
        {isRefund && other && (other.task_id || other.reason) && (
          <DetailSection label={t('Refund Details')}>
            {other.task_id && (
              <DetailRow label={t('Task ID')} value={other.task_id} mono />
            )}
            {other.reason && (
              <DetailRow label={t('Reason')} value={other.reason} />
            )}
          </DetailSection>
        )}

        {/* Top-up audit info (type=1, admin only) */}
        {showTopupAuditSection && (
          <DetailSection
            icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}
            iconTone='success'
            label={t('Top-up Audit Info')}
          >
            {topupAuditFields.map((field) => (
              <DetailRow
                key={field.label}
                label={field.label}
                value={field.value}
                mono
              />
            ))}
            {showLegacyTopupWarning && (
              <div className='flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400'>
                <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
                <span>
                  {t(
                    'This historical record predates audit-info tracking and cannot be backfilled. The current instance already records server IP, callback IP, payment method, and system version for new top-ups going forward.'
                  )}
                </span>
              </div>
            )}
          </DetailSection>
        )}

        {/* Manage operator (type=3, admin only) */}
        {manageOperator && (
          <DetailRow
            label={
              <span className='flex items-center gap-1.5'>
                <UserCog
                  className='text-muted-foreground size-3.5'
                  aria-hidden='true'
                />
                {t('Operator Admin')}
              </span>
            }
            value={manageOperator}
            mono
          />
        )}

        {/* Operation audit info (type=3, admin only) */}
        {showManageAuditSection && (
          <DetailSection
            icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}
            iconTone='info'
            label={t('Operation Audit Info')}
          >
            {operationText != null && (
              <DetailRow label={t('Operation')} value={operationText} />
            )}
            {authMethodLabel !== '' && (
              <DetailRow
                label={t('Authentication Method')}
                value={authMethodLabel}
              />
            )}
            {changedFieldsText !== '' && (
              <DetailRow
                label={t('Changed Fields')}
                value={changedFieldsText}
              />
            )}
            {auditRoute?.method && auditRoute?.route && (
              <DetailRow
                label={t('Request')}
                value={`${auditRoute.method} ${auditRoute.route}`}
                mono
              />
            )}
            {auditRoute?.status != null && (
              <DetailRow
                label={t('Result')}
                value={
                  auditRoute.success
                    ? `${t('Success')} (${auditRoute.status})`
                    : `${t('Failed')} (${auditRoute.status})`
                }
                mono
              />
            )}
          </DetailSection>
        )}

        {/* Login audit info (type=7) */}
        {isLogin && loginAuditFields.length > 0 && (
          <DetailSection
            icon={<LogIn className='size-3.5' aria-hidden='true' />}
            iconTone='info'
            label={t('Login Info')}
          >
            {operationText != null && (
              <DetailRow label={t('Operation')} value={operationText} />
            )}
            {loginAuditFields.map((field) => (
              <DetailRow
                key={field.label}
                label={field.label}
                value={field.value}
                mono
              />
            ))}
          </DetailSection>
        )}

        {/* Audio/WebSocket token breakdown */}
        {hasAudioTokens && other && (
          <DetailSection
            icon={<Headphones className='size-3.5' aria-hidden='true' />}
            iconTone='chart-4'
            label={t('Audio Tokens')}
          >
            {other.audio_input != null && other.audio_input > 0 && (
              <DetailRow
                label={t('Audio Input')}
                value={formatTokens(other.audio_input)}
                mono
              />
            )}
            {other.audio_output != null && other.audio_output > 0 && (
              <DetailRow
                label={t('Audio Output')}
                value={formatTokens(other.audio_output)}
                mono
              />
            )}
            {other.text_input != null && other.text_input > 0 && (
              <DetailRow
                label={t('Text Input')}
                value={formatTokens(other.text_input)}
                mono
              />
            )}
            {other.text_output != null && other.text_output > 0 && (
              <DetailRow
                label={t('Text Output')}
                value={formatTokens(other.text_output)}
                mono
              />
            )}
          </DetailSection>
        )}

        {/* Reasoning effort */}
        {reasoningEffort && (
          <DetailRow
            label={t('Reasoning Effort')}
            value={
              <StatusBadge
                label={reasoningEffort}
                variant={reasoningEffortVariant}
                size='sm'
                copyable={false}
              />
            }
          />
        )}

        {/* System prompt override */}
        {other?.is_system_prompt_overwritten && (
          <DetailRow
            label={t('System Prompt')}
            value={
              <StatusBadge
                label={t('Overwritten')}
                variant='orange'
                size='sm'
                copyable={false}
              />
            }
          />
        )}

        {/* Model mapping */}
        {other?.is_model_mapped && other?.upstream_model_name && (
          <DetailSection label={t('Model Mapping')}>
            <DetailRow
              label={t('Request Model')}
              value={props.log.model_name}
              mono
            />
            <DetailRow
              label={t('Actual Model')}
              value={other.upstream_model_name}
              mono
            />
          </DetailSection>
        )}

        {/* Token breakdown (for consume/error types with token data) */}
        {isDisplayableType(props.log.type) && other && (
          <TokenBreakdown log={props.log} other={other} />
        )}

        {finalizedAcu && acuRoute && (
          <AcuPricingDetails
            breakdown={acuRoute}
            modelId={acuRoute.canonical_model || props.log.model_name}
            isAdmin={props.isAdmin}
          />
        )}

        {/* Billing breakdown (consume type) */}
        {isConsume && other && !isViolation && (
          <BillingBreakdown
            log={props.log}
            other={other}
            isAdmin={props.isAdmin}
          />
        )}

        {/* Tiered pricing breakdown (when billing_mode is tiered_expr) */}
        {showAcuInternalDetails && isTieredBilling && other?.expr_b64 && (
          <DetailSection label={t('Dynamic Pricing')}>
            <DynamicPricingBreakdown
              compact
              billingExpr={decodeBillingExprB64(other.expr_b64)}
              matchedTierLabel={other.matched_tier}
              hideCacheColumns={!hasAnyCacheTokens(other)}
            />
          </DetailSection>
        )}

        {/* Admin billing mode indicator for non-consume */}
        {props.isAdmin &&
          !isConsume &&
          props.log.type !== 6 &&
          other?.admin_info && (
            <DetailRow
              label={t('Billing Path')}
              value={
                <span className='flex items-center gap-1'>
                  {isUsageBillingPathLocal(other.admin_info) ? (
                    <Monitor className='size-3 text-blue-500' />
                  ) : (
                    <Cloud className='size-3 text-emerald-500' />
                  )}
                  <span className='text-xs'>
                    {getUsageBillingPathLabel(t, other.admin_info)}
                  </span>
                </span>
              }
            />
          )}

        {/* Stream status details (admin only) */}
        {props.isAdmin &&
          other?.stream_status &&
          other.stream_status.status !== 'ok' && (
            <DetailSection label={t('Stream Status')}>
              <DetailRow
                label={t('Status')}
                value={
                  <StatusBadge
                    label={other.stream_status.status || t('Error')}
                    variant='red'
                    size='sm'
                    copyable={false}
                  />
                }
              />
              {other.stream_status.end_reason && (
                <DetailRow
                  label={t('End Reason')}
                  value={other.stream_status.end_reason}
                />
              )}
              {(other.stream_status.error_count ?? 0) > 0 && (
                <DetailRow
                  label={t('Soft Errors')}
                  value={String(other.stream_status.error_count)}
                />
              )}
              {other.stream_status.end_error && (
                <DetailRow
                  label={t('End Error')}
                  value={other.stream_status.end_error}
                />
              )}
              {Array.isArray(other.stream_status.errors) &&
                other.stream_status.errors.length > 0 && (
                  <pre className='bg-background/60 mt-1 max-h-32 overflow-y-auto rounded border p-2 font-mono text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap'>
                    {other.stream_status.errors.join('\n')}
                  </pre>
                )}
            </DetailSection>
          )}

        {/* Subscription billing details */}
        {isSubscription && other && (
          <DetailSection label={t('Subscription Billing')}>
            {other.subscription_plan_id && (
              <DetailRow
                label={t('Plan')}
                value={`#${other.subscription_plan_id} ${other.subscription_plan_title || ''}`.trim()}
              />
            )}
            {other.subscription_id && (
              <DetailRow
                label={t('Instance')}
                value={`#${other.subscription_id}`}
                mono
              />
            )}
            {other.subscription_pre_consumed != null && (
              <DetailRow
                label={t('Pre-consumed')}
                value={formatLogQuota(other.subscription_pre_consumed)}
                mono
              />
            )}
            {other.subscription_post_delta != null &&
              other.subscription_post_delta !== 0 && (
                <DetailRow
                  label={t('Post Delta')}
                  value={formatLogQuota(other.subscription_post_delta)}
                  mono
                />
              )}
            {other.subscription_consumed != null && (
              <DetailRow
                label={t('Final Consumed')}
                value={formatLogQuota(other.subscription_consumed)}
                mono
              />
            )}
            {other.subscription_remain != null && (
              <DetailRow
                label={t('Remaining')}
                value={`${formatLogQuota(other.subscription_remain)}${other.subscription_total != null ? ` / ${formatLogQuota(other.subscription_total)}` : ''}`}
                mono
              />
            )}
          </DetailSection>
        )}

        {/* Param override */}
        {other?.po && Array.isArray(other.po) && other.po.length > 0 && (
          <DetailSection
            icon={<Settings2 className='size-3.5' aria-hidden='true' />}
            iconTone='chart-3'
            label={`${t('Param Override')} (${other.po.length})`}
          >
            {other.po.filter(Boolean).map((line) => {
              const parsed = parseAuditLine(line)
              if (!parsed) return null
              return (
                <div
                  key={`${parsed.action}-${parsed.content}`}
                  className='bg-background/60 flex min-w-0 flex-col gap-1.5 rounded border p-2 sm:flex-row sm:items-start sm:gap-2'
                >
                  <StatusBadge
                    variant='neutral'
                    label={getParamOverrideActionLabel(parsed.action, t)}
                    className='shrink-0 font-medium'
                    copyable={false}
                  />
                  <span className='min-w-0 font-mono text-[11px] leading-relaxed break-all sm:wrap-break-word'>
                    {parsed.content}
                  </span>
                </div>
              )
            })}
          </DetailSection>
        )}

        {/* Content */}
        {details && (
          <div className='space-y-1.5'>
            <Label className='text-xs font-semibold'>{t('Content')}</Label>
            <div className='bg-muted/30 relative min-w-0 overflow-hidden rounded-md border p-2.5'>
              <Button
                variant='ghost'
                size='sm'
                className='absolute top-1.5 right-1.5 h-5 w-5 p-0'
                onClick={() => copyToClipboard(details)}
                title={t('Copy to clipboard')}
                aria-label={t('Copy to clipboard')}
              >
                {copiedText === details ? (
                  <Check className='size-3 text-green-600' />
                ) : (
                  <Copy className='size-3' />
                )}
              </Button>
              <p className='min-w-0 pr-6 text-xs leading-relaxed break-all whitespace-pre-wrap sm:wrap-break-word'>
                {details}
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function isDisplayableType(type: number): boolean {
  return [0, 2, 5, 6].includes(type)
}

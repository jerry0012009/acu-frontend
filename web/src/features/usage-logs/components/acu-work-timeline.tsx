import { useQuery } from '@tanstack/react-query'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  Activity,
  ChevronDown,
  Clock3,
  Coins,
  Gauge,
  RotateCcw,
  Route,
  Scale,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'

import {
  getACUWorkTimeline,
  type ACUWorkTimelineItem,
} from '../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  filterTimelineBySupply,
  filterTimelineItems,
  formatTimelineTimestamp,
  isCompletedStatus,
  rollingTimelineRange,
  summarizeTimelineItems,
  timelineItemFromChartEvent,
  timelineOrderRangeFromZoom,
  timelineUserCharge,
  timelinePhaseAdjustment,
  timelineWorkPhase,
  type TimelineProtocolFilter,
  thinkingEffort,
} from './acu-work-timeline-model'
import { ACUSessionTracePanel } from './dialogs/acu-session-trace'

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  DataZoomComponent,
  TooltipComponent,
  CanvasRenderer,
])

function ms(value: number) {
  if (value <= 0) return '—'
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`
}

function money(value: number) {
  return `¥${value.toFixed(value < 0.01 ? 6 : 3)}`
}

function optionalMoney(value: number | undefined) {
  return value == null ? '—' : money(value)
}

function datetimeLocalValue(timestampMs: number) {
  const date = new Date(
    timestampMs - new Date(timestampMs).getTimezoneOffset() * 60_000
  )
  return date.toISOString().slice(0, 16)
}

function statusTone(status: string) {
  if (isCompletedStatus(status)) return 'text-emerald-600'
  if (status === 'cancelled') return 'text-muted-foreground'
  return 'text-destructive'
}

function judgeMode(item: ACUWorkTimelineItem) {
  if (item.judgeReused) return 'Judge Reused'
  if (
    item.judgeStatus === 'rules_fallback' ||
    item.judgeResultSource === 'rules_strategy'
  ) {
    return 'Judge rules fallback'
  }
  if (item.judgeSameModelFailoverUsed) {
    return `Judge Profile failover · ${item.judgeModel}`
  }
  if (item.judgeResultSource === 'upstream_live') return 'Judge Fresh'
  if (item.judgeResultSource === 'disk_cache') return 'Judge Cache'
  if (item.judgeResultSource === 'recent_evaluation') {
    return 'Judge failed · reused previous'
  }
  if (item.judgeResultSource === 'rules_strategy') return 'Rules fallback'
  if (!item.judgeCalled) return 'Judge not required'
  return item.judgeModel ? `Judge · ${item.judgeModel}` : 'Judge unavailable'
}

function difficultyText(item: ACUWorkTimelineItem, digits = 0) {
  return item.difficultyRecorded ? item.difficulty.toFixed(digits) : '—'
}

function StepDetailContent(props: {
  item: ACUWorkTimelineItem
  onTrace: (id: string) => void
  onOpen?: (id: string) => void
  showDetails?: boolean
}) {
  const { t } = useTranslation()
  const { item } = props
  const model =
    item.pointType === 'judge'
      ? item.judgeModel
      : item.selectedDisplayName || item.actualModel
  const provider =
    item.pointType === 'judge'
      ? item.judgeAttempts.find((attempt) => attempt.status === 'success')
          ?.provider ||
        item.provider ||
        'rules'
      : item.provider
  const channel =
    item.pointType === 'judge'
      ? item.judgeAttempts.find((attempt) => attempt.status === 'success')
          ?.channelId ||
        item.channel ||
        '—'
      : item.channel
  let pointJudgeLabel = t('Execution')
  if (item.pointType === 'judge') {
    pointJudgeLabel = `${t(judgeMode(item))} · D${difficultyText(item)}`
  } else if (item.judgeReused) {
    pointJudgeLabel = `${t('Judge Reused')} · D${difficultyText(item)}`
  }
  const failedAttempts =
    item.pointType === 'judge'
      ? item.judgeAttempts.filter((attempt) => attempt.status !== 'success')
          .length
      : item.providerAttempts.filter((attempt) => attempt.status !== 'success')
          .length
  return (
    <div className='border-border/70 border-b last:border-b-0'>
      <button
        type='button'
        onClick={() => props.onOpen?.(item.pointId)}
        aria-label={t('Open route step {{sequence}}', {
          sequence: item.sequence,
        })}
        className='group hover:bg-muted/35 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3 text-left sm:px-4 lg:items-center'
      >
        <span className='bg-muted flex size-7 items-center justify-center rounded text-xs font-semibold'>
          {item.sequence}
        </span>
        <span className='hidden min-w-0 grid-cols-[6.5rem_5.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_6.5rem_5.5rem_3.5rem] items-center gap-3 lg:grid'>
          <span className='font-medium'>
            {item.pointType === 'judge'
              ? t('Judge')
              : `${timelineWorkPhase(item)} ${timelinePhaseAdjustment(item.workPhaseQualityTargetOffset)}`}
          </span>
          <span className='text-muted-foreground text-xs'>
            {pointJudgeLabel}
          </span>
          <span className='truncate text-sm font-medium' title={model}>
            {model}
          </span>
          <span
            className='text-muted-foreground truncate text-xs'
            title={`${provider} · ${channel}`}
          >
            {provider} · {channel}
          </span>
          <span
            className={cn('truncate text-xs', statusTone(item.status))}
            title={item.status}
          >
            {t(item.status)}
          </span>
          <span className='text-xs tabular-nums' title={t('User charge')}>
            {optionalMoney(timelineUserCharge(item))}
          </span>
          <span className='text-xs tabular-nums'>
            {ms(item.endToEndLatencyMs)}
          </span>
          <span className='text-xs tabular-nums'>
            {(item.cacheHitRatio * 100).toFixed(0)}%
          </span>
        </span>
        <span className='min-w-0 lg:hidden'>
          <span className='flex min-w-0 items-center justify-between gap-2'>
            <span className='truncate text-sm font-medium' title={model}>
              {model}
            </span>
            <span className={cn('shrink-0 text-xs', statusTone(item.status))}>
              {t(item.status)}
            </span>
          </span>
          <span className='text-muted-foreground mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4'>
            <span>
              {t('Difficulty')} {difficultyText(item)}
            </span>
            {item.pointType === 'execution' ? (
              <span>
                {timelineWorkPhase(item)}{' '}
                {timelinePhaseAdjustment(item.workPhaseQualityTargetOffset)}
              </span>
            ) : null}
            <span className='truncate' title={`${provider} · ${channel}`}>
              {provider} · {channel}
            </span>
            <span>
              {t('User charge')} {optionalMoney(timelineUserCharge(item))}
            </span>
            <span>
              {ms(item.endToEndLatencyMs)} · {t('Cache')}{' '}
              {(item.cacheHitRatio * 100).toFixed(0)}%
            </span>
          </span>
        </span>
        <span className='pt-1 lg:pt-0'>
          <ChevronDown className='size-4 transition-transform group-data-[panel-open]:rotate-180' />
        </span>
      </button>
      {props.showDetails ? (
        <div className='bg-muted/20 grid gap-4 border-t px-4 py-4 text-xs lg:grid-cols-4'>
          {item.pointType === 'judge' ? (
            <div>
              <div className='text-muted-foreground mb-1'>
                {t('Trigger / Judge')}
              </div>
              <div>
                {item.judgeTrigger || t('n/a')} ·{' '}
                {item.judgeStatus || t(judgeMode(item))}
              </div>
              <div>
                {item.judgeResultSource || t('n/a')} ·{' '}
                {item.judgeProfileAttemptCount} {t('Judge attempts')}
              </div>
              <div>
                {t('Time')} {formatTimelineTimestamp(item.timestamp)}
              </div>
            </div>
          ) : null}
          {item.pointType === 'execution' ? (
            <div>
              <div className='text-muted-foreground mb-1'>
                {t('Thinking effort')} {thinkingEffort(item)}
              </div>
              <div>
                {item.clientRequestedReasoningEffort || t('none')} →{' '}
                {item.presetReasoningEffort || t('base')} →{' '}
                {item.resolvedReasoningEffort || t('default')}
              </div>
              <div>{item.reasoningMappingStatus || t('model_default')}</div>
            </div>
          ) : null}
          {item.pointType === 'judge' ? (
            <div className='lg:col-span-4'>
              <div className='text-muted-foreground mb-1'>
                {t('Judge attempts')}
              </div>
              <div>
                {item.judgeProfileSelection.formulaVersion ||
                  'acu-profile-utility-v2.1'}{' '}
                · {item.judgeProfileSelection.supplyStrategy || 'balanced'} · #
                {item.judgeProfileSelection.selectedProfileRank || '—'} /{' '}
                {item.judgeProfileSelection.candidateCount}
              </div>
              {item.judgeAttempts.map((attempt) => (
                <div
                  key={attempt.attemptIndex}
                  className='mt-1 grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] gap-2'
                >
                  <span>{attempt.attemptIndex}</span>
                  <span className='truncate'>
                    {attempt.channelId} · {attempt.executionProfileId}
                  </span>
                  <span>{attempt.status}</span>
                  <span>{ms(attempt.latencyMs)}</span>
                  <span className='text-muted-foreground col-span-4'>
                    Input {attempt.inputTokens.toLocaleString()} · Cached input{' '}
                    {attempt.cachedInputTokens.toLocaleString()} · Output{' '}
                    {attempt.outputTokens.toLocaleString()} ·{' '}
                    {attempt.usageStatus} · {attempt.costStatus}{' '}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {item.pointType === 'execution' ? (
            <div>
              <div className='text-muted-foreground mb-1'>
                {t('Token usage')}
              </div>
              <div>
                {t('Input')} {item.inputTokens.toLocaleString()} · {t('Cached')}{' '}
                {item.cachedInputTokens.toLocaleString()}
              </div>
              <div>
                {t('Output')} {item.outputTokens.toLocaleString()} ·{' '}
                {t('Reasoning')} {item.reasoningTokens.toLocaleString()}
              </div>
            </div>
          ) : null}
          {item.pointType === 'execution' ? (
            <div>
              <div className='text-muted-foreground mb-1'>{t('Recovery')}</div>
              <div>
                {item.recoveryDecisionReason ||
                  item.routeRefreshReason ||
                  t('No recovery')}
              </div>
            </div>
          ) : null}
          <div>
            <div className='text-muted-foreground mb-1'>{t('Cost')}</div>
            <div>
              {item.billingStatus === 'unsettled'
                ? t('Estimated user charge (unsettled)')
                : t('User charge')}{' '}
              {optionalMoney(timelineUserCharge(item))}
            </div>
            <div>
              {t('Failed attempts')} {failedAttempts}
            </div>
            <div
              className={cn(
                item.billingStatus === 'unsettled' && 'text-orange-600'
              )}
            >
              {t('Billing status')} ·{' '}
              {item.billingStatus === 'unsettled'
                ? t('Billing unsettled · insufficient quota')
                : t(item.billingStatus)}
            </div>
          </div>
          <div>
            <button
              type='button'
              className='text-primary underline-offset-2 hover:underline'
              onClick={() => props.onTrace(item.logicalRequestId)}
            >
              {t('View full Session Trace')}
            </button>
          </div>
          {item.pointType === 'execution' ? (
            <div className='lg:col-span-2'>
              <div className='text-muted-foreground mb-1'>
                {t('Top candidates')}
              </div>
              {item.topCandidates.length ? (
                item.topCandidates.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className='grid grid-cols-[minmax(0,1fr)_4rem_5rem] gap-2 py-0.5'
                  >
                    <span className='truncate' title={candidate.displayName}>
                      {candidate.selected ? `${t('Selected')} · ` : ''}
                      {candidate.displayName}
                    </span>
                    <span>Q {candidate.estimatedQuality.toFixed(1)}</span>
                    <span>U {candidate.valueUtility.toFixed(3)}</span>
                  </div>
                ))
              ) : (
                <div>{t('No candidate summary for this legacy request.')}</div>
              )}
            </div>
          ) : null}
          {item.pointType === 'execution' ? (
            <div className='lg:col-span-2'>
              <div className='text-muted-foreground mb-1'>
                {t('Provider attempts')}
              </div>
              {item.providerAttempts.map((attempt) => (
                <div
                  key={`${attempt.attemptIndex}-${attempt.executionProfileId}`}
                  className='grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] gap-2 py-0.5'
                >
                  <span>{attempt.attemptIndex}</span>
                  <span
                    className='truncate'
                    title={`${attempt.channel} · ${attempt.executionProfileId}`}
                  >
                    {attempt.channel} · {attempt.executionProfileId}
                  </span>
                  <span>{t(attempt.status)}</span>
                  <span>{ms(attempt.latencyMs)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TimelineStep(props: {
  item: ACUWorkTimelineItem
  onOpen: (id: string) => void
}) {
  return <StepDetailContent {...props} onTrace={() => {}} showDetails={false} />
}

export function ACUWorkTimeline() {
  const { t } = useTranslation()
  const [hours, setHours] = useState(1)
  const [rangeMode, setRangeMode] = useState<'rolling' | 'custom'>('rolling')
  const initialNow = useRef(Date.now())
  const [customStart, setCustomStart] = useState(() =>
    datetimeLocalValue(initialNow.current - 3600_000)
  )
  const [customEnd, setCustomEnd] = useState(() =>
    datetimeLocalValue(initialNow.current)
  )
  const [customRange, setCustomRange] = useState(() =>
    rollingTimelineRange(1, initialNow.current)
  )
  const [rangeError, setRangeError] = useState('')
  const [traceId, setTraceId] = useState('')
  const [selectedPointId, setSelectedPointId] = useState('')
  const [trendOpen, setTrendOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'errors'>('all')
  const [protocolFilter, setProtocolFilter] =
    useState<TimelineProtocolFilter>('all')
  const [channelFilter, setChannelFilter] = useState('')
  const [pointTypeFilter, setPointTypeFilter] = useState<
    'all' | 'judge' | 'execution'
  >('all')
  const [resultFilter, setResultFilter] = useState<
    'all' | 'success' | 'issues'
  >('all')
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const { resolvedTheme, themeReady } = useChartTheme()
  const [visibleOrderRange, setVisibleOrderRange] = useState({
    start: 1,
    end: 1,
  })
  const query = useQuery({
    queryKey:
      rangeMode === 'rolling'
        ? ['acu-work-timeline', 'rolling', hours]
        : ['acu-work-timeline', 'custom', customRange.from, customRange.to],
    queryFn: () => {
      const range =
        rangeMode === 'rolling' ? rollingTimelineRange(hours) : customRange
      return getACUWorkTimeline(range.from, range.to)
    },
    refetchInterval: 60_000,
  })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])
  const supplyItems = useMemo(
    () =>
      filterTimelineBySupply(
        items,
        protocolFilter,
        channelFilter,
        pointTypeFilter,
        resultFilter
      ),
    [
      channelFilter,
      items,
      pointTypeFilter,
      protocolFilter,
      resultFilter,
    ]
  )
  const channelOptions = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => [item.provider, item.channel]).filter(Boolean)
        ),
      ].sort(),
    [items]
  )
  const selectedPoint = useMemo(
    () => items.find((item) => item.pointId === selectedPointId),
    [items, selectedPointId]
  )

  useEffect(() => {
    setVisibleOrderRange({ start: 1, end: Math.max(1, supplyItems.length) })
  }, [customRange.from, customRange.to, hours, rangeMode, supplyItems.length])

  const applyCustomRange = () => {
    const from = Math.floor(new Date(customStart).getTime() / 1000)
    const to = Math.floor(new Date(customEnd).getTime() / 1000)
    const now = Math.floor(Date.now() / 1000)
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setRangeError(t('Enter valid start and end times.'))
      return
    }
    if (to <= from) {
      setRangeError(t('End time must be after start time.'))
      return
    }
    if (to - from > 7 * 24 * 3600) {
      setRangeError(t('Custom range cannot exceed 7 days.'))
      return
    }
    if (to > now) {
      setRangeError(t('End time cannot be in the future.'))
      return
    }
    setRangeError('')
    setCustomRange({ from, to })
    setRangeMode('custom')
  }

  const rangeItems = useMemo(
    () => supplyItems.slice(visibleOrderRange.start - 1, visibleOrderRange.end),
    [supplyItems, visibleOrderRange]
  )
  const visibleItems = useMemo(
    () => filterTimelineItems(rangeItems, search, filterMode),
    [filterMode, rangeItems, search]
  )
  const summary = useMemo(
    () => summarizeTimelineItems(visibleItems),
    [visibleItems]
  )
  const taskGroups = useMemo(() => {
    const groups = new Map<string, ACUWorkTimelineItem[]>()
    for (const item of visibleItems) {
      const task = item.taskId || 'unassigned'
      const group = groups.get(task) ?? []
      group.push(item)
      groups.set(task, group)
    }
    return [...groups.entries()]
  }, [visibleItems])
  const chartOption = useMemo(
    () =>
      buildACUWorkTimelineChartOption({
        items: supplyItems,
        dark: resolvedTheme === 'dark',
      }),
    [resolvedTheme, supplyItems]
  )

  const resetZoom = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: 'dataZoom',
      dataZoomId: ACU_TIMELINE_INSIDE_ZOOM_ID,
      start: 0,
      end: 100,
    })
    setVisibleOrderRange({ start: 1, end: Math.max(1, supplyItems.length) })
  }, [supplyItems.length])

  useEffect(() => {
    const container = chartContainerRef.current
    if (!trendOpen || !container || !themeReady || supplyItems.length === 0) {
      return
    }
    const chart = echarts.init(
      container,
      resolvedTheme === 'dark' ? 'dark' : undefined,
      { renderer: 'canvas' }
    )
    chartRef.current = chart
    chart.setOption(chartOption, { notMerge: true })

    const handleZoom = (event: unknown) => {
      const range = timelineOrderRangeFromZoom(event, supplyItems.length)
      if (range) setVisibleOrderRange(range)
    }
    const handleClick = (event: unknown) => {
      const item = timelineItemFromChartEvent(event)
      if (item) setSelectedPointId(item.pointId)
    }
    const handleDoubleClick = (event: { target?: unknown }) => {
      if (!event.target) resetZoom()
    }
    chart.on('datazoom', handleZoom)
    chart.on('click', handleClick)
    chart.getZr().on('dblclick', handleDoubleClick)

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
      chart.getZr().off('dblclick', handleDoubleClick)
      chart.off('datazoom', handleZoom)
      chart.off('click', handleClick)
      chart.dispose()
      if (chartRef.current === chart) chartRef.current = null
    }
  }, [
    chartOption,
    supplyItems.length,
    resetZoom,
    resolvedTheme,
    themeReady,
    trendOpen,
  ])

  const stats = [
    [t('Execution Steps'), summary.executionSteps, Activity, ''],
    [t('Judge Evaluations'), summary.judgeEvaluations, Scale, ''],
    [
      t('Judge first-attempt success'),
      summary.judgeFirstAttemptSuccessSamples
        ? `${(summary.judgeFirstAttemptSuccessRate * 100).toFixed(0)}%`
        : '—',
      Scale,
      t('{{count}} recorded samples from {{total}} Judge calls', {
        count: summary.judgeFirstAttemptSuccessSamples,
        total: summary.judgeCalledRequests,
      }),
    ],
    [
      t('Judge rules fallback'),
      summary.judgeRulesFallbackSamples
        ? `${(summary.judgeRulesFallbackRate * 100).toFixed(0)}%`
        : '—',
      Route,
      t('{{count}} recorded samples from {{total}} Judge calls', {
        count: summary.judgeRulesFallbackSamples,
        total: summary.judgeCalledRequests,
      }),
    ],
    [
      t('Completion rate'),
      `${(summary.completionRate * 100).toFixed(0)}%`,
      Gauge,
      '',
    ],
    [
      t('Cache hit rate'),
      `${(summary.cacheHitRate * 100).toFixed(0)}%`,
      Clock3,
      '',
    ],
    [
      t('Collected user charges'),
      summary.userChargeSamples ? money(summary.totalUserChargeCny) : '—',
      Coins,
      t('{{count}} recorded cost samples from {{total}} steps', {
        count: summary.userChargeSamples,
        total: summary.apiSteps,
      }),
    ],
    [t('Unsettled requests'), summary.unsettledRequests, Coins, ''],
  ] as const

  let chartContent = (
    <div className='text-muted-foreground rounded border p-8 text-center text-sm'>
      {t('No ACU requests in the current range.')}
    </div>
  )
  if (query.isLoading || !themeReady) {
    chartContent = (
      <div className='text-muted-foreground p-8 text-center text-sm'>
        {t('Loading…')}
      </div>
    )
  } else if (supplyItems.length > 0) {
    chartContent = (
      <section className='bg-card min-w-0 overflow-hidden rounded border'>
        <div className='border-b px-4 py-3'>
          <div className='text-sm font-medium'>
            {t('Difficulty and user charge by request order')}
          </div>
          <div className='text-muted-foreground mt-0.5 text-xs'>
            {t(
              'Difficulty is shown above and user charge below. Both use the same request-order axis.'
            )}
          </div>
        </div>
        <div className='h-[34rem] min-w-0 touch-pan-y sm:h-[38rem]'>
          <div ref={chartContainerRef} className='size-full min-w-0' />
        </div>
      </section>
    )
  }

  return (
    <div
      data-testid='acu-work-timeline-root'
      className='flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain pb-4 [&>*]:shrink-0'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'View production requests, channel status, automatic Probes, and recovery progress.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-end gap-1'>
          {[1, 6, 24].map((value) => (
            <Button
              key={value}
              size='sm'
              variant={
                rangeMode === 'rolling' && hours === value
                  ? 'default'
                  : 'outline'
              }
              aria-pressed={rangeMode === 'rolling' && hours === value}
              onClick={() => {
                setHours(value)
                setRangeMode('rolling')
                setRangeError('')
              }}
            >
              {value === 1 ? t('1 hour') : `${value} ${t('hours')}`}
            </Button>
          ))}
          <Button size='sm' variant='outline' onClick={resetZoom}>
            <RotateCcw className='mr-1.5 size-3.5' />
            {t('Reset zoom')}
          </Button>
        </div>
      </div>
      <div className='flex flex-wrap items-end gap-2 rounded border p-3'>
        <label className='grid min-w-44 flex-1 gap-1 text-xs sm:flex-none'>
          <span className='text-muted-foreground'>{t('Protocol')}</span>
          <select
            className='bg-background h-8 rounded border px-2'
            value={protocolFilter}
            onChange={(event) =>
              setProtocolFilter(event.target.value as TimelineProtocolFilter)
            }
          >
            <option value='all'>{t('All protocols')}</option>
            <option value='responses'>{t('OpenAI Responses (Codex)')}</option>
            <option value='messages'>
              {t('Anthropic Messages (Claude protocol)')}
            </option>
          </select>
        </label>
        <label className='grid min-w-44 flex-1 gap-1 text-xs sm:flex-none'>
          <span className='text-muted-foreground'>
            {t('Provider / Channel')}
          </span>
          <select
            className='bg-background h-8 rounded border px-2'
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value=''>{t('All')}</option>
            {channelOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className='grid min-w-36 flex-1 gap-1 text-xs sm:flex-none'>
          <span className='text-muted-foreground'>{t('Event type')}</span>
          <select
            className='bg-background h-8 rounded border px-2'
            value={pointTypeFilter}
            onChange={(event) =>
              setPointTypeFilter(event.target.value as typeof pointTypeFilter)
            }
          >
            <option value='all'>{t('All event types')}</option>
            <option value='judge'>{t('Judge evaluation')}</option>
            <option value='execution'>{t('Production request')}</option>
          </select>
        </label>
        <label className='grid min-w-32 flex-1 gap-1 text-xs sm:flex-none'>
          <span className='text-muted-foreground'>{t('Result')}</span>
          <select
            className='bg-background h-8 rounded border px-2'
            value={resultFilter}
            onChange={(event) =>
              setResultFilter(event.target.value as typeof resultFilter)
            }
          >
            <option value='all'>{t('All results')}</option>
            <option value='success'>{t('Successful')}</option>
            <option value='issues'>{t('Issues only')}</option>
          </select>
        </label>
        <label className='grid gap-1 text-xs'>
          <span className='text-muted-foreground'>{t('Start time')}</span>
          <Input
            type='datetime-local'
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
            className='h-8 w-[13rem]'
          />
        </label>
        <label className='grid gap-1 text-xs'>
          <span className='text-muted-foreground'>{t('End time')}</span>
          <Input
            type='datetime-local'
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
            className='h-8 w-[13rem]'
          />
        </label>
        <Button
          size='sm'
          variant={rangeMode === 'custom' ? 'default' : 'outline'}
          onClick={applyCustomRange}
        >
          {t('Apply')}
        </Button>
        {rangeError ? (
          <span className='text-destructive text-xs'>{rangeError}</span>
        ) : null}
      </div>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <span>
          {t('Visible requests #{{start}}–#{{end}} of {{total}}', {
            start: visibleOrderRange.start,
            end: Math.min(
              visibleOrderRange.end,
              Math.max(1, supplyItems.length)
            ),
            total: supplyItems.length,
          })}
        </span>
        <span>
          {t(
            'Scroll the page, drag the lower selector to zoom, and select a point to inspect its trace.'
          )}
        </span>
      </div>
      <div className='bg-border grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded border lg:grid-cols-8'>
        {stats.map(([label, value, Icon, description]) => (
          <div
            key={label}
            className='bg-background min-w-0 p-3'
            title={description || undefined}
          >
            <div className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
              <Icon className='size-3.5' />
              {label}
            </div>
            <div className='mt-1 truncate text-sm font-semibold'>{value}</div>
          </div>
        ))}
      </div>
      <Collapsible open={trendOpen} onOpenChange={setTrendOpen}>
        <CollapsibleTrigger
          aria-expanded={trendOpen}
          className='bg-card flex w-full items-center justify-between rounded border px-4 py-3 text-left text-sm font-medium'
        >
          {t('Difficulty and user charge trend')}
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              trendOpen && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>{chartContent}</CollapsibleContent>
      </Collapsible>
      <section className='bg-card min-w-0 overflow-hidden rounded border'>
        <div className='flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3'>
          <div>
            <div className='text-sm font-medium'>{t('Route steps')}</div>
            <div className='text-muted-foreground mt-0.5 text-xs'>
              {t('Grouped by task and ordered by time within each task.')}
            </div>
          </div>
          <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
            <label className='relative min-w-0 flex-1 sm:w-72 sm:flex-none'>
              <Search
                className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
                aria-hidden='true'
              />
              <span className='sr-only'>{t('Search route steps')}</span>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search task, request, model, or channel')}
                className='pl-8'
              />
            </label>
            <div
              className='flex rounded border p-0.5'
              aria-label={t('Status filter')}
            >
              {(['all', 'errors'] as const).map((mode) => (
                <Button
                  key={mode}
                  type='button'
                  size='sm'
                  variant={filterMode === mode ? 'secondary' : 'ghost'}
                  aria-pressed={filterMode === mode}
                  onClick={() => setFilterMode(mode)}
                >
                  {mode === 'all' ? t('All') : t('Issues only')}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div
          role='row'
          className='bg-muted/30 text-muted-foreground hidden grid-cols-[2.5rem_6.5rem_5.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_6.5rem_5.5rem_3.5rem_1rem] items-center gap-3 border-b px-4 py-2 text-[11px] font-medium lg:grid'
        >
          <span role='columnheader'>#</span>
          <span role='columnheader'>{t('Phase')}</span>
          <span role='columnheader'>{t('Judge')}</span>
          <span role='columnheader'>{t('Model')}</span>
          <span role='columnheader'>{t('Provider / channel')}</span>
          <span role='columnheader'>{t('Status')}</span>
          <span role='columnheader'>{t('User charge')}</span>
          <span role='columnheader'>{t('Latency')}</span>
          <span role='columnheader'>{t('Cache')}</span>
          <span aria-hidden='true' />
        </div>
        {taskGroups.length ? (
          taskGroups.map(([taskId, taskItems]) => (
            <div key={taskId}>
              <div className='bg-muted/40 border-b px-4 py-2 text-xs font-medium'>
                {t('Task')}{' '}
                <span className='font-mono break-all select-all' title={taskId}>
                  {taskId}
                </span>
              </div>
              {taskItems.map((item) => (
                <TimelineStep
                  key={item.pointId}
                  item={item}
                  onOpen={setSelectedPointId}
                />
              ))}
            </div>
          ))
        ) : (
          <div className='text-muted-foreground p-8 text-center text-sm'>
            {t('No route steps match the current filters.')}
          </div>
        )}
      </section>
      <Dialog
        open={Boolean(selectedPointId)}
        onOpenChange={(open) => {
          if (!open) setSelectedPointId('')
        }}
      >
        <DialogContent className='max-h-[90vh] w-[min(52rem,calc(100%-1rem))] max-w-none overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{t('Step Detail')}</DialogTitle>
          </DialogHeader>
          {selectedPoint ? (
            <StepDetailContent
              item={selectedPoint}
              onTrace={setTraceId}
              showDetails
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        modal={false}
        open={Boolean(traceId)}
        onOpenChange={(open) => {
          if (!open) setTraceId('')
        }}
      >
        <DialogContent
          showBackdrop={false}
          className={cn(
            'inset-0 max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:w-[min(68rem,calc(100%-2rem))] sm:rounded-lg'
          )}
        >
          <DialogHeader>
            <DialogTitle>{t('ACU Session Trace')}</DialogTitle>
          </DialogHeader>
          {traceId && <ACUSessionTracePanel identifier={traceId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

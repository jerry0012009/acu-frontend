import { useQuery } from '@tanstack/react-query'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
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

import { getACUWorkTimeline, type ACUWorkTimelineItem } from '../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  filterTimelineItems,
  formatTimelineTimestamp,
  isCompletedStatus,
  summarizeTimelineItems,
  timelineCashCost,
  timelineItemFromChartEvent,
  timelineOrderRangeFromZoom,
  timelineUserCharge,
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

function statusTone(status: string) {
  if (isCompletedStatus(status)) return 'text-emerald-600'
  if (status === 'cancelled') return 'text-muted-foreground'
  return 'text-destructive'
}

function judgeMode(item: ACUWorkTimelineItem) {
  if (item.judgeResultSource === 'upstream_live') return 'Judge Fresh'
  if (item.judgeResultSource === 'disk_cache') return 'Judge Cache'
  if (item.judgeResultSource === 'recent_evaluation') {
    return 'Judge failed · reused previous'
  }
  if (item.judgeResultSource === 'rules_strategy') return 'Rules fallback'
  if (item.judgeReused && !item.judgeCalled) return 'Judge Reused'
  return 'Judge unavailable'
}

function difficultyText(item: ACUWorkTimelineItem, digits = 0) {
  return item.difficultyRecorded ? item.difficulty.toFixed(digits) : '—'
}

function TimelineStep(props: {
  item: ACUWorkTimelineItem
  onTrace: (id: string) => void
}) {
  const { t } = useTranslation()
  const { item } = props
  const model = item.selectedDisplayName || item.actualModel
  return (
    <Collapsible className='border-border/70 border-b last:border-b-0'>
      <CollapsibleTrigger
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
            {item.workPhase || t('general')}{' '}
            {item.workPhaseQualityTargetOffset
              ? `${item.workPhaseQualityTargetOffset > 0 ? '+' : ''}${item.workPhaseQualityTargetOffset}`
              : ''}
          </span>
          <span className='text-muted-foreground text-xs'>
            {t(judgeMode(item))} · D{difficultyText(item)}
          </span>
          <span className='truncate text-sm font-medium' title={model}>
            {model}
          </span>
          <span
            className='text-muted-foreground truncate text-xs'
            title={`${item.provider} · ${item.channel}`}
          >
            {item.provider} · {item.channel}
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
            <span
              className='truncate'
              title={`${item.provider} · ${item.channel}`}
            >
              {item.provider} · {item.channel}
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
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='bg-muted/20 grid gap-4 border-t px-4 py-4 text-xs lg:grid-cols-4'>
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
          <div>
            <div className='text-muted-foreground mb-1'>{t('Token usage')}</div>
            <div>
              {t('Input')} {item.inputTokens.toLocaleString()} · {t('Cached')}{' '}
              {item.cachedInputTokens.toLocaleString()}
            </div>
            <div>
              {t('Output')} {item.outputTokens.toLocaleString()} ·{' '}
              {t('Reasoning')} {item.reasoningTokens.toLocaleString()}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground mb-1'>{t('Recovery')}</div>
            <div>
              {item.recoveryDecisionReason ||
                item.routeRefreshReason ||
                t('No recovery')}
            </div>
            <button
              type='button'
              className='text-primary mt-1 underline-offset-2 hover:underline'
              onClick={() => props.onTrace(item.logicalRequestId)}
            >
              {t('Open Session Trace')}
            </button>
          </div>
          <div>
            <div className='text-muted-foreground mb-1'>{t('Cost')}</div>
            <div>
              {t('User charge')} {optionalMoney(timelineUserCharge(item))}
            </div>
            <div>
              {t('Cash cost')} {optionalMoney(timelineCashCost(item))}
            </div>
          </div>
          <div className='lg:col-span-2'>
            <div className='text-muted-foreground mb-1'>
              {t('Top candidates')}
            </div>
            {item.topCandidates.length ? (
              item.topCandidates.map((candidate) => (
                <div
                  key={candidate.candidateId}
                  className='grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] gap-2 py-0.5'
                >
                  <span className='truncate' title={candidate.displayName}>
                    {candidate.selected ? `${t('Selected')} · ` : ''}
                    {candidate.displayName}
                  </span>
                  <span>Q {candidate.estimatedQuality.toFixed(1)}</span>
                  <span>{money(candidate.estimatedCallCost)}</span>
                  <span>U {candidate.valueUtility.toFixed(3)}</span>
                </div>
              ))
            ) : (
              <div>{t('No candidate summary for this legacy request.')}</div>
            )}
          </div>
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ACUWorkTimeline() {
  const { t } = useTranslation()
  const [hours, setHours] = useState(1)
  const [traceId, setTraceId] = useState('')
  const [trendOpen, setTrendOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'errors'>('all')
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const { resolvedTheme, themeReady } = useChartTheme()
  const to = Math.floor(Date.now() / 60_000) * 60
  const from = to - hours * 3600
  const [visibleOrderRange, setVisibleOrderRange] = useState({
    start: 1,
    end: 1,
  })
  const query = useQuery({
    queryKey: ['acu-work-timeline', hours, to],
    queryFn: () => getACUWorkTimeline(from, to),
    refetchInterval: 60_000,
  })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])

  useEffect(() => {
    setVisibleOrderRange({ start: 1, end: Math.max(1, items.length) })
  }, [from, hours, items.length, to])

  const rangeItems = useMemo(
    () => items.slice(visibleOrderRange.start - 1, visibleOrderRange.end),
    [items, visibleOrderRange]
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
        items,
        dark: resolvedTheme === 'dark',
      }),
    [items, resolvedTheme]
  )

  const resetZoom = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: 'dataZoom',
      dataZoomId: ACU_TIMELINE_INSIDE_ZOOM_ID,
      start: 0,
      end: 100,
    })
    setVisibleOrderRange({ start: 1, end: Math.max(1, items.length) })
  }, [items.length])

  useEffect(() => {
    const container = chartContainerRef.current
    if (!trendOpen || !container || !themeReady || items.length === 0) return
    const chart = echarts.init(
      container,
      resolvedTheme === 'dark' ? 'dark' : undefined,
      { renderer: 'canvas' }
    )
    chartRef.current = chart
    chart.setOption(chartOption, { notMerge: true })

    const handleZoom = (event: unknown) => {
      const range = timelineOrderRangeFromZoom(event, items.length)
      if (range) setVisibleOrderRange(range)
    }
    const handleClick = (event: unknown) => {
      const item = timelineItemFromChartEvent(event)
      if (item) setTraceId(item.logicalRequestId)
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
    items.length,
    resetZoom,
    resolvedTheme,
    themeReady,
    trendOpen,
  ])

  const stats = [
    [t('API steps'), summary.apiSteps, Activity, ''],
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
      t('User charge'),
      summary.userChargeSamples ? money(summary.totalUserChargeCny) : '—',
      Coins,
      t('{{count}} recorded cost samples from {{total}} steps', {
        count: summary.userChargeSamples,
        total: summary.apiSteps,
      }),
    ],
    [
      t('Cash cost'),
      summary.actualCashCostSamples
        ? money(summary.totalActualCashCostCny)
        : '—',
      Coins,
      t('{{count}} recorded cost samples from {{total}} steps', {
        count: summary.actualCashCostSamples,
        total: summary.apiSteps,
      }),
    ],
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
  } else if (items.length > 0) {
    chartContent = (
      <section className='bg-card min-w-0 overflow-hidden rounded border'>
        <div className='border-b px-4 py-3'>
          <div className='text-sm font-medium'>
            {t('Difficulty and cash cost by request order')}
          </div>
          <div className='text-muted-foreground mt-0.5 text-xs'>
            {t(
              'Difficulty is shown above and actual cash cost below. Both use the same request-order axis.'
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
            'Each point is a logical request. Select a point or cost bar to inspect its session trace.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-end gap-1'>
          {[1, 6, 24].map((value) => (
            <Button
              key={value}
              size='sm'
              variant={hours === value ? 'default' : 'outline'}
              aria-pressed={hours === value}
              onClick={() => setHours(value)}
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
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <span>
          {t('Visible requests #{{start}}–#{{end}} of {{total}}', {
            start: visibleOrderRange.start,
            end: Math.min(visibleOrderRange.end, Math.max(1, items.length)),
            total: items.length,
          })}
        </span>
        <span>
          {t(
            'Scroll the page, drag the lower selector to zoom, and select a point to inspect its trace.'
          )}
        </span>
      </div>
      <div className='bg-border grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded border lg:grid-cols-7'>
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
          {t('Difficulty and cash cost trend')}
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
                  key={item.logicalRequestId}
                  item={item}
                  onTrace={setTraceId}
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

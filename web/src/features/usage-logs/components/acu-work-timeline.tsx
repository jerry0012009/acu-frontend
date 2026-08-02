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
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'

import { getACUWorkTimeline, type ACUWorkTimelineItem } from '../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  summarizeTimelineItems,
  timelineItemFromChartEvent,
  timelineRangeFromZoom,
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
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`
}

function money(value: number) {
  return `¥${value.toFixed(value < 0.01 ? 6 : 3)}`
}

function visibleTime(value: number) {
  return new Date(value * 1000).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function judgeMode(item: ACUWorkTimelineItem) {
  if (item.judgeResultSource === 'rules_strategy') return 'Rules'
  if (item.judgeResultSource === 'recent_evaluation') return 'Recent'
  if (item.judgeReused) return 'Reused'
  return item.judgeCalled ? 'New' : 'None'
}

function TimelineStep(props: {
  item: ACUWorkTimelineItem
  onTrace: (id: string) => void
}) {
  const { item } = props
  return (
    <Collapsible className='border-border/70 border-b last:border-b-0'>
      <CollapsibleTrigger className='group hover:bg-muted/35 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left sm:px-4'>
        <span className='bg-muted flex size-7 items-center justify-center rounded text-xs font-semibold'>
          {item.sequence}
        </span>
        <span className='grid min-w-0 gap-1 lg:grid-cols-[8rem_7rem_minmax(9rem,1fr)_6rem_9rem] lg:items-center lg:gap-3'>
          <span className='font-medium'>{item.workPhase || 'general'} {item.workPhaseQualityTargetOffset ? `${item.workPhaseQualityTargetOffset > 0 ? '+' : ''}${item.workPhaseQualityTargetOffset}` : ''}</span>
          <span className='text-muted-foreground text-xs'>{judgeMode(item)} · D{item.difficulty.toFixed(0)}</span>
          <span className='truncate text-sm font-medium'>{item.selectedDisplayName || item.actualModel}</span>
          <span className='text-muted-foreground text-xs'>{item.resolvedReasoningEffort || 'default'}</span>
          <span className='text-muted-foreground truncate text-xs'>{item.channel} · {item.profileAttemptCount || 1} attempt</span>
        </span>
        <span className='flex items-center gap-3 text-xs'>
          <span className={item.status.includes('completed') ? 'text-emerald-600' : 'text-destructive'}>{item.status}</span>
          <span>{money(item.actualCostCny)}</span>
          <span>{ms(item.endToEndLatencyMs)}</span>
          <span>{(item.cacheHitRatio * 100).toFixed(0)}%</span>
          <ChevronDown className='size-4 transition-transform group-data-[panel-open]:rotate-180' />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='bg-muted/20 grid gap-4 border-t px-4 py-4 text-xs lg:grid-cols-4'>
          <div>
            <div className='text-muted-foreground mb-1'>Trigger / Judge</div>
            <div>{item.judgeTrigger || 'n/a'} · {item.judgeStatus || judgeMode(item)}</div>
            <div>{item.judgeResultSource || 'n/a'} · {item.judgeProfileAttemptCount} Judge attempts</div>
          </div>
          <div>
            <div className='text-muted-foreground mb-1'>Reasoning mapping</div>
            <div>{item.clientRequestedReasoningEffort || 'none'} → {item.presetReasoningEffort || 'base'} → {item.resolvedReasoningEffort || 'default'}</div>
            <div>{item.reasoningMappingStatus || 'model_default'}</div>
          </div>
          <div>
            <div className='text-muted-foreground mb-1'>Token usage</div>
            <div>Input {item.inputTokens.toLocaleString()} · Cached {item.cachedInputTokens.toLocaleString()}</div>
            <div>Output {item.outputTokens.toLocaleString()} · Reasoning {item.reasoningTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className='text-muted-foreground mb-1'>Recovery</div>
            <div>{item.recoveryDecisionReason || item.routeRefreshReason || 'No recovery'}</div>
            <button type='button' className='text-primary mt-1 underline-offset-2 hover:underline' onClick={() => props.onTrace(item.logicalRequestId)}>Open Session Trace</button>
          </div>
          <div className='lg:col-span-2'>
            <div className='text-muted-foreground mb-1'>Top candidates</div>
            {item.topCandidates.length ? item.topCandidates.map((candidate) => (
              <div key={candidate.candidateId} className='grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] gap-2 py-0.5'>
                <span className='truncate'>{candidate.selected ? 'Selected · ' : ''}{candidate.displayName}</span>
                <span>Q {candidate.estimatedQuality.toFixed(1)}</span><span>{money(candidate.estimatedCallCost)}</span><span>U {candidate.valueUtility.toFixed(3)}</span>
              </div>
            )) : <div>No candidate summary for this legacy request.</div>}
          </div>
          <div className='lg:col-span-2'>
            <div className='text-muted-foreground mb-1'>Provider attempts</div>
            {item.providerAttempts.map((attempt) => (
              <div key={`${attempt.attemptIndex}-${attempt.executionProfileId}`} className='grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] gap-2 py-0.5'>
                <span>{attempt.attemptIndex}</span><span className='truncate'>{attempt.channel} · {attempt.executionProfileId}</span><span>{attempt.status}</span><span>{ms(attempt.latencyMs)}</span>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ACUWorkTimeline() {
  const [hours, setHours] = useState(1)
  const [traceId, setTraceId] = useState('')
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const { resolvedTheme, themeReady } = useChartTheme()
  const to = Math.floor(Date.now() / 60_000) * 60
  const from = to - hours * 3600
  const [visibleRange, setVisibleRange] = useState({ start: from, end: to })
  const query = useQuery({
    queryKey: ['acu-work-timeline', hours, to],
    queryFn: () => getACUWorkTimeline(from, to),
    refetchInterval: 60_000,
  })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])

  useEffect(() => {
    setVisibleRange({ start: from, end: to })
  }, [from, hours, to])

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.timestamp >= visibleRange.start &&
          item.timestamp <= visibleRange.end
      ),
    [items, visibleRange]
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
        hours,
        from,
        to,
        dark: resolvedTheme === 'dark',
      }),
    [from, hours, items, resolvedTheme, to]
  )

  const resetZoom = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: 'dataZoom',
      dataZoomId: ACU_TIMELINE_INSIDE_ZOOM_ID,
      start: 0,
      end: 100,
    })
    setVisibleRange({ start: from, end: to })
  }, [from, to])

  useEffect(() => {
    const container = chartContainerRef.current
    if (!container || !themeReady || items.length === 0) return
    const chart = echarts.init(
      container,
      resolvedTheme === 'dark' ? 'dark' : undefined,
      { renderer: 'canvas' }
    )
    chartRef.current = chart
    chart.setOption(chartOption, { notMerge: true })

    const handleZoom = (event: unknown) => {
      const range = timelineRangeFromZoom(event, from, to)
      if (range) setVisibleRange(range)
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
    from,
    items.length,
    resetZoom,
    resolvedTheme,
    themeReady,
    to,
  ])

  const stats = [
    ['API Steps', summary.apiSteps, Activity],
    ['Judge 首次成功率', `${(summary.judgeFirstAttemptSuccessRate * 100).toFixed(0)}%`, Scale],
    ['Judge Rules Fallback', `${(summary.judgeRulesFallbackRate * 100).toFixed(0)}%`, Route],
    ['完成率', `${(summary.completionRate * 100).toFixed(0)}%`, Gauge],
    ['Cache 命中率', `${(summary.cacheHitRate * 100).toFixed(0)}%`, Clock3],
    ['累计扣费', money(summary.actualTotalCostCny), Coins],
  ] as const

  let chartContent = (
    <div className='text-muted-foreground rounded border p-8 text-center text-sm'>
      当前时间范围没有 ACU 请求。
    </div>
  )
  if (query.isLoading || !themeReady) {
    chartContent = (
      <div className='text-muted-foreground p-8 text-center text-sm'>
        加载中…
      </div>
    )
  } else if (items.length > 0) {
    chartContent = (
      <section className='bg-card min-w-0 overflow-hidden rounded border'>
        <div className='border-b px-4 py-3'>
          <div className='text-sm font-medium'>难度与实际成本</div>
          <div className='text-muted-foreground mt-0.5 text-xs'>
            上方为任务难度轨迹，下方为实际人民币成本；两者共享同一时间窗口。
          </div>
        </div>
        <div className='h-[34rem] min-w-0 touch-pan-y sm:h-[38rem]'>
          <div ref={chartContainerRef} className='size-full min-w-0' />
        </div>
      </section>
    )
  }

  return (
    <div data-testid='acu-work-timeline-root' className='flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain pb-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>工作路由轨迹</h2>
          <p className='text-muted-foreground text-xs'>
            每个点是一条 Logical Request，点击点或成本柱查看 Session Trace。
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-end gap-1'>
          {[1, 6, 24, 168].map((value) => (
            <Button
              key={value}
              size='sm'
              variant={hours === value ? 'default' : 'outline'}
              onClick={() => setHours(value)}
            >
              {value === 168 ? '7 天' : `${value} 小时`}
            </Button>
          ))}
          <Button size='sm' variant='outline' onClick={resetZoom}>
            <RotateCcw className='mr-1.5 size-3.5' />
            重置缩放
          </Button>
        </div>
      </div>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <span>
          可见区间 {visibleTime(visibleRange.start)} -{' '}
          {visibleTime(visibleRange.end)}
        </span>
        <span>页面滚轮滚动 · 底部选区拖动缩放 · 点击数据点查看 Trace</span>
      </div>
      <div className='bg-border grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded border lg:grid-cols-6'>
        {stats.map(([label, value, Icon]) => (
          <div key={label} className='bg-background min-w-0 p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
              <Icon className='size-3.5' />
              {label}
            </div>
            <div className='mt-1 truncate text-sm font-semibold'>{value}</div>
          </div>
        ))}
      </div>
      <section className='bg-card min-w-0 overflow-hidden rounded border'>
        <div className='border-b px-4 py-3'>
          <div className='text-sm font-medium'>路由步骤</div>
          <div className='text-muted-foreground mt-0.5 text-xs'>按 Task 分组，Task 内按时间顺序。</div>
        </div>
        {taskGroups.length ? taskGroups.map(([taskId, taskItems]) => (
          <div key={taskId}>
            <div className='bg-muted/40 border-b px-4 py-2 text-xs font-medium'>Task {taskId}</div>
            {taskItems.map((item) => <TimelineStep key={item.logicalRequestId} item={item} onTrace={setTraceId} />)}
          </div>
        )) : <div className='text-muted-foreground p-8 text-center text-sm'>当前时间范围没有 ACU 请求。</div>}
      </section>
      <Collapsible>
        <CollapsibleTrigger className='bg-card flex w-full items-center justify-between rounded border px-4 py-3 text-left text-sm font-medium'>
          难度与实际成本趋势
          <ChevronDown className='size-4' />
        </CollapsibleTrigger>
        <CollapsibleContent className='pt-3'>{chartContent}</CollapsibleContent>
      </Collapsible>
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
            'top-4 right-4 bottom-4 left-auto max-h-none w-[min(48rem,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 overflow-y-auto'
          )}
        >
          <DialogHeader>
            <DialogTitle>ACU Session Trace</DialogTitle>
          </DialogHeader>
          {traceId && <ACUSessionTracePanel identifier={traceId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

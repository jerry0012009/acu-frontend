import { useQuery } from '@tanstack/react-query'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { VChart } from '@visactor/react-vchart'
import type { EventParamsDefinition, IVChart } from '@visactor/vchart'
import {
  Activity,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

import { getACUWorkTimeline, type ACUWorkTimelineItem } from '../api'
import {
  ACU_TIMELINE_ZOOM_ID,
  buildACUWorkTimelineChartSpec,
  summarizeTimelineItems,
} from './acu-work-timeline-model'
import { ACUSessionTracePanel } from './dialogs/acu-session-trace'

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

function eventTimelineItem(
  event: EventParamsDefinition['click'] | EventParamsDefinition['dblclick']
): ACUWorkTimelineItem | undefined {
  const datum = event.datum as Partial<ACUWorkTimelineItem> | undefined
  return typeof datum?.logicalRequestId === 'string'
    ? (datum as ACUWorkTimelineItem)
    : undefined
}

type DataZoomChangeEvent = {
  value?: {
    startValue?: number | string
    endValue?: number | string
  }
}

export function ACUWorkTimeline() {
  const [hours, setHours] = useState(1)
  const [traceId, setTraceId] = useState('')
  const chartRef = useRef<IVChart | null>(null)
  const { resolvedTheme, themeReady } = useChartTheme()
  const to = Math.floor(Date.now() / 1000)
  const from = to - hours * 3600
  const [visibleRange, setVisibleRange] = useState({ start: from, end: to })
  const query = useQuery({
    queryKey: ['acu-work-timeline', hours, Math.floor(to / 60)],
    queryFn: () => getACUWorkTimeline(from, to),
    refetchInterval: 60_000,
  })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])

  useEffect(() => {
    setVisibleRange({ start: from, end: to })
  }, [from, hours, to])

  const handleDataZoomChange = useCallback((event: DataZoomChangeEvent) => {
    const start = Number(event.value?.startValue)
    const end = Number(event.value?.endValue)
    if (Number.isFinite(start) && Number.isFinite(end)) {
      setVisibleRange({
        start: Math.min(start, end),
        end: Math.max(start, end),
      })
    }
  }, [])
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
  const chartSpec = useMemo(
    () =>
      buildACUWorkTimelineChartSpec({
        items,
        hours,
        dark: resolvedTheme === 'dark',
      }),
    [hours, items, resolvedTheme]
  )

  const resetZoom = useCallback(() => {
    chartRef.current?.updateModelSpecSync(
      ACU_TIMELINE_ZOOM_ID,
      { start: 0, end: 1 },
      true
    )
    setVisibleRange({ start: from, end: to })
  }, [from, to])
  const handleChartClick = useCallback(
    (event: EventParamsDefinition['click']) => {
      const item = eventTimelineItem(event)
      if (item) setTraceId(item.logicalRequestId)
    },
    []
  )
  const handleChartDoubleClick = useCallback(
    (event: EventParamsDefinition['dblclick']) => {
      if (!eventTimelineItem(event)) resetZoom()
    },
    [resetZoom]
  )

  const stats = [
    ['API Steps', summary.apiSteps, Activity],
    ['Judge Calls', summary.judgeCalls, Scale],
    ['Judge Reuse', `${(summary.judgeReuseRate * 100).toFixed(0)}%`, Route],
    ['完成率', `${(summary.completionRate * 100).toFixed(0)}%`, Gauge],
    ['实际总成本', money(summary.actualTotalCostCny), Coins],
    [
      '首事件 p50 / p95',
      `${ms(summary.p50FirstModelEventLatencyMs)} / ${ms(summary.p95FirstModelEventLatencyMs)}`,
      Clock3,
    ],
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
          <VChart
            key={`acu-work-timeline-${hours}-${resolvedTheme}`}
            spec={{
              ...chartSpec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            }}
            option={VCHART_OPTION}
            onReady={(instance: IVChart) => {
              chartRef.current = instance
            }}
            onClick={handleChartClick}
            onDblClick={handleChartDoubleClick}
            onDataZoomChange={handleDataZoomChange}
          />
        </div>
      </section>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4'>
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
        <span>滚轮缩放 · 图内拖动平移 · 底部选区拖动缩放</span>
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
      {chartContent}
      <Dialog
        open={Boolean(traceId)}
        onOpenChange={(open) => {
          if (!open) setTraceId('')
        }}
      >
        <DialogContent className={cn('max-h-[92vh] max-w-6xl overflow-y-auto')}>
          <DialogHeader>
            <DialogTitle>ACU Session Trace</DialogTitle>
          </DialogHeader>
          {traceId && <ACUSessionTracePanel identifier={traceId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

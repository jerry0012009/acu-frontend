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

import { getACUWorkTimeline } from '../api'
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
    ['Judge Calls', summary.judgeCalls, Scale],
    ['Judge Reuse', `${(summary.judgeReuseRate * 100).toFixed(0)}%`, Route],
    ['完成率', `${(summary.completionRate * 100).toFixed(0)}%`, Gauge],
    ['累计扣费', money(summary.actualTotalCostCny), Coins],
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
          <div ref={chartContainerRef} className='size-full min-w-0' />
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

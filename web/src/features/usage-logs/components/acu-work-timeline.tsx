/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
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
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { getACUWorkTimeline, type ACUWorkTimelineItem } from '../api'
import {
  boundTimelineViewport,
  buildTimelineBuckets,
  summarizeTimelineItems,
} from './acu-work-timeline-model'
import { ACUSessionTracePanel } from './dialogs/acu-session-trace'

const MODEL_COLORS: Record<string, string> = {
  'gpt-5.4-mini': '#0f766e',
  'gpt-5.6-luna': '#2563eb',
  'gpt-5.6-terra': '#c2410c',
  'gpt-5.6-sol': '#a21caf',
  'gpt-5.5': '#ca8a04',
}

function ms(value: number) {
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`
}
function money(value: number) {
  return `¥${value.toFixed(value < 0.01 ? 6 : 3)}`
}
function time(value: number) {
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
function judgeLabel(item: ACUWorkTimelineItem) {
  if (item.judgeCalled) return 'Judge New'
  if (item.judgeReused) return 'Judge Reused'
  return 'Judge unavailable'
}

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ACUWorkTimelineItem }>
}) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return (
    <div className='bg-popover max-w-72 rounded border p-3 text-xs shadow-md'>
      <div className='mb-2 font-medium'>
        {item.actualModel || item.requestedModel}
      </div>
      <div>
        Difficulty {item.difficulty.toFixed(1)} · Step {item.sequence}
      </div>
      <div>
        {judgeLabel(item)}
        {item.judgeBackupUsed ? ' · Backup' : ''}
      </div>
      <div>
        {item.provider} · {item.channel}
      </div>
      <div>
        端到端 {ms(item.endToEndLatencyMs)} · 首模型事件{' '}
        {ms(item.firstModelEventLatencyMs)}
      </div>
      <div>
        Judge {ms(item.judgeLatencyMs)} · Provider {ms(item.providerLatencyMs)}
      </div>
      <div>
        成本 {money(item.actualCostCny)}（Judge {money(item.judgeCostCny)} /
        Provider {money(item.providerCostCny)} / 失败{' '}
        {money(item.failedAttemptCostCny)}）
      </div>
      {item.errorClass && (
        <div className='mt-1 text-rose-600'>{item.errorClass}</div>
      )}
    </div>
  )
}

export function ACUWorkTimeline() {
  const [hours, setHours] = useState(1)
  const [traceId, setTraceId] = useState('')
  const [viewport, setViewport] = useState({
    start: 0,
    end: Number.MAX_SAFE_INTEGER,
  })
  const drag = useRef<{
    x: number
    start: number
    end: number
    moved: boolean
  } | null>(null)
  const suppressTraceClickUntil = useRef(0)
  const to = Math.floor(Date.now() / 1000)
  const from = to - hours * 3600
  const query = useQuery({
    queryKey: ['acu-work-timeline', hours, Math.floor(to / 60)],
    queryFn: () => getACUWorkTimeline(from, to),
    refetchInterval: 60_000,
  })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])
  const buckets = useMemo(
    () => buildTimelineBuckets(from, to, hours, items),
    [from, hours, items, to]
  )
  const lastIndex = Math.max(0, buckets.length - 1)
  const startIndex = Math.min(viewport.start, lastIndex)
  const endIndex = Math.min(viewport.end, lastIndex)
  const visibleFrom = buckets[startIndex]?.timestamp ?? from
  const visibleTo = buckets[endIndex]?.timestamp ?? to
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) => item.timestamp >= visibleFrom && item.timestamp <= visibleTo
      ),
    [items, visibleFrom, visibleTo]
  )
  const resetViewport = useCallback(
    () => setViewport({ start: 0, end: Number.MAX_SAFE_INTEGER }),
    []
  )
  useEffect(() => {
    resetViewport()
  }, [hours, resetViewport])
  const setBoundedViewport = useCallback(
    (start: number, end: number) => {
      const minimumIntervals = Math.min(
        hours <= 1 ? 5 : 4,
        Math.max(1, buckets.length - 1)
      )
      setViewport(
        boundTimelineViewport(buckets.length, start, end, minimumIntervals)
      )
    },
    [buckets.length, hours]
  )
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (buckets.length < 3) return
      event.preventDefault()
      const currentWidth = endIndex - startIndex
      const nextWidth = Math.round(
        currentWidth * (event.deltaY > 0 ? 1.2 : 0.8)
      )
      const bounds = event.currentTarget.getBoundingClientRect()
      const center = Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width)
      )
      const anchor = startIndex + center * currentWidth
      setBoundedViewport(
        anchor - center * nextWidth,
        anchor + (1 - center) * nextWidth
      )
    },
    [buckets.length, endIndex, setBoundedViewport, startIndex]
  )
  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!drag.current || buckets.length < 2) return
      if (Math.abs(event.clientX - drag.current.x) > 5) {
        drag.current.moved = true
      }
      if (!drag.current.moved) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const width = drag.current.end - drag.current.start
      const shift = Math.round(
        ((drag.current.x - event.clientX) / Math.max(1, bounds.width)) * width
      )
      setBoundedViewport(drag.current.start + shift, drag.current.end + shift)
    },
    [buckets.length, setBoundedViewport]
  )
  const finishDrag = useCallback(() => {
    if (drag.current?.moved) suppressTraceClickUntil.current = Date.now() + 250
    drag.current = null
  }, [])
  const openTrace = useCallback((item: ACUWorkTimelineItem) => {
    if (Date.now() >= suppressTraceClickUntil.current) {
      setTraceId(item.logicalRequestId)
    }
  }, [])
  const segmentSeries = useMemo(
    () => [...new Set(visibleItems.map((item) => item.segmentId))],
    [visibleItems]
  )
  const taskRanges = useMemo(
    () =>
      [...new Set(visibleItems.map((item) => item.taskId))].map(
        (taskId, index) => {
          const taskItems = visibleItems.filter(
            (item) => item.taskId === taskId
          )
          return {
            taskId,
            index,
            from: taskItems[0]?.timestamp ?? 0,
            to: taskItems.at(-1)?.timestamp ?? 0,
          }
        }
      ),
    [visibleItems]
  )
  const summary = useMemo(
    () => summarizeTimelineItems(visibleItems),
    [visibleItems]
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
  if (query.isLoading) {
    chartContent = (
      <div className='text-muted-foreground p-8 text-center text-sm'>
        加载中…
      </div>
    )
  } else if (items.length > 0) {
    chartContent = (
      <div
        className='min-w-0 touch-pan-y space-y-3 select-none'
        onWheel={onWheel}
        onMouseDown={(event) => {
          const target = event.target as Element
          if (
            target.closest('[data-trace-point]') ||
            target.closest('.recharts-brush')
          ) {
            return
          }
          drag.current = {
            x: event.clientX,
            start: startIndex,
            end: endIndex,
            moved: false,
          }
        }}
        onMouseMove={onMouseMove}
        onMouseUp={finishDrag}
        onMouseLeave={finishDrag}
        onDoubleClick={(event) => {
          const target = event.target as Element
          if (!target.closest('[data-trace-point]')) resetViewport()
        }}
      >
        <section className='min-w-0 shrink-0 rounded border p-3'>
          <div className='mb-2 text-xs font-medium'>难度轨迹</div>
          <div className='h-72 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <ComposedChart data={visibleItems}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='timestamp'
                  type='number'
                  domain={[visibleFrom, visibleTo]}
                  allowDataOverflow
                  tickFormatter={time}
                  tickLine={false}
                />
                <YAxis domain={[0, 100]} width={32} />
                <Tooltip content={<TimelineTooltip />} />
                {taskRanges.map((range) => (
                  <ReferenceArea
                    key={range.taskId}
                    x1={range.from}
                    x2={range.to}
                    fill={range.index % 2 ? '#64748b' : '#0f766e'}
                    fillOpacity={0.045}
                  />
                ))}
                {segmentSeries.map((segmentId) => (
                  <Line
                    key={segmentId}
                    data={visibleItems.filter(
                      (item) => item.segmentId === segmentId
                    )}
                    dataKey='difficulty'
                    stroke='#64748b'
                    strokeWidth={1.5}
                    connectNulls={false}
                    dot={(props) => {
                      const item = items.find(
                        (candidate) =>
                          candidate.timestamp === props.payload.timestamp &&
                          candidate.logicalRequestId ===
                            props.payload.logicalRequestId
                      )
                      const color =
                        MODEL_COLORS[item?.actualModel ?? ''] ?? '#64748b'
                      let border = color
                      if (item?.status === 'failed') {
                        border = '#e11d48'
                      } else if (item?.status === 'completed_with_recovery') {
                        border = '#f97316'
                      }
                      const costRadius = Math.min(
                        2,
                        Math.sqrt(Math.max(0, item?.actualCostCny ?? 0)) * 2
                      )
                      return (
                        <circle
                          key={props.key}
                          data-trace-point='true'
                          cx={props.cx}
                          cy={props.cy}
                          r={(item?.judgeBackupUsed ? 7 : 5) + costRadius}
                          fill={item?.judgeCalled ? color : 'var(--background)'}
                          stroke={border}
                          strokeWidth={item?.judgeBackupUsed ? 3 : 2}
                          className='cursor-pointer'
                          onClick={(event) => {
                            event.stopPropagation()
                            if (item) openTrace(item)
                          }}
                        />
                      )
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className='min-w-0 shrink-0 rounded border p-3'>
          <div className='mb-2 text-xs font-medium'>实际人民币成本</div>
          <div className='h-52 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={visibleItems}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='timestamp'
                  type='number'
                  domain={[visibleFrom, visibleTo]}
                  allowDataOverflow
                  tickFormatter={time}
                  tickLine={false}
                />
                <YAxis width={42} />
                <Tooltip content={<TimelineTooltip />} />
                <Bar dataKey='actualCostCny' radius={[3, 3, 0, 0]}>
                  {visibleItems.map((item) => (
                    <Cell
                      key={item.logicalRequestId}
                      data-trace-point='true'
                      className='cursor-pointer'
                      fill={MODEL_COLORS[item.actualModel] ?? '#64748b'}
                      onClick={(event) => {
                        event.stopPropagation()
                        openTrace(item)
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <div className='h-14 min-w-0 rounded border px-2 pt-1'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={buckets}>
              <Bar
                dataKey='requestCount'
                fill='#64748b'
                isAnimationActive={false}
              />
              <Brush
                dataKey='timestamp'
                height={30}
                travellerWidth={10}
                startIndex={startIndex}
                endIndex={endIndex}
                tickFormatter={time}
                onChange={(selection) => {
                  if (
                    selection.startIndex == null ||
                    selection.endIndex == null
                  ) {
                    return
                  }
                  setBoundedViewport(selection.startIndex, selection.endIndex)
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }
  return (
    <div className='flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>工作路由轨迹</h2>
          <p className='text-muted-foreground text-xs'>
            每个点是一条 Logical Request，点击查看完整 Session Trace。
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
          <Button size='sm' variant='outline' onClick={resetViewport}>
            <RotateCcw className='mr-1.5 size-3.5' />
            重置缩放
          </Button>
        </div>
      </div>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <span>
          可见区间 {new Date(visibleFrom * 1000).toLocaleString()} -{' '}
          {new Date(visibleTo * 1000).toLocaleString()}
        </span>
        <span>滚轮缩放 · 空白处拖动平移 · 双击重置</span>
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

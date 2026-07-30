/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { Activity, Clock3, Coins, Gauge, Route, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { getACUWorkTimeline, type ACUWorkTimelineItem } from '../api'
import { ACUSessionTracePanel } from './dialogs/acu-session-trace'

const MODEL_COLORS: Record<string, string> = {
  'gpt-5.4-mini': '#0f766e', 'gpt-5.6-luna': '#2563eb', 'gpt-5.6-terra': '#c2410c',
  'gpt-5.6-sol': '#a21caf', 'gpt-5.5': '#ca8a04',
}

function ms(value: number) { return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s` }
function money(value: number) { return `¥${value.toFixed(value < 0.01 ? 6 : 3)}` }
function judgeLabel(item: ACUWorkTimelineItem) {
  if (item.judgeCalled) return 'Judge New'
  if (item.judgeReused) return 'Judge Reused'
  return 'Judge unavailable'
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ACUWorkTimelineItem }> }) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return <div className='bg-popover max-w-72 rounded border p-3 text-xs shadow-md'>
    <div className='mb-2 font-medium'>{item.actualModel || item.requestedModel}</div>
    <div>Difficulty {item.difficulty.toFixed(1)} · Step {item.sequence}</div>
    <div>{judgeLabel(item)}{item.judgeBackupUsed ? ' · Backup' : ''}</div>
    <div>{item.provider} · {item.channel}</div>
    <div>首模型事件 {ms(item.firstModelEventLatencyMs)} · 总耗时 {ms(item.totalLatencyMs)}</div>
    <div>成本 {money(item.actualCostCny)}（Judge {money(item.judgeCostCny)} / Provider {money(item.providerCostCny)} / 失败 {money(item.failedAttemptCostCny)}）</div>
    {item.errorClass && <div className='mt-1 text-rose-600'>{item.errorClass}</div>}
  </div>
}

export function ACUWorkTimeline() {
  const [hours, setHours] = useState(1)
  const [traceId, setTraceId] = useState('')
  const to = Math.floor(Date.now() / 1000)
  const from = to - hours * 3600
  const query = useQuery({ queryKey: ['acu-work-timeline', hours, Math.floor(to / 60)], queryFn: () => getACUWorkTimeline(from, to), refetchInterval: 60_000 })
  const data = query.data?.data
  const items = useMemo(() => data?.items ?? [], [data])
  const summary = data?.summary
  const openActivePoint = (state: unknown) => {
    const index = Number((state as { activeIndex?: number | string } | undefined)?.activeIndex)
    const item = Number.isInteger(index) ? items[index] : undefined
    if (item) setTraceId(item.logicalRequestId)
  }
  const stats = [
    ['API Steps', summary?.apiSteps ?? 0, Activity], ['Judge Calls', summary?.judgeCalls ?? 0, Scale],
    ['Judge Reuse', `${((summary?.judgeReuseRate ?? 0) * 100).toFixed(0)}%`, Route],
    ['完成率', `${((summary?.completionRate ?? 0) * 100).toFixed(0)}%`, Gauge],
    ['实际总成本', money(summary?.actualTotalCostCny ?? 0), Coins],
    ['首事件 p50 / p95', `${ms(summary?.p50FirstModelEventLatencyMs ?? 0)} / ${ms(summary?.p95FirstModelEventLatencyMs ?? 0)}`, Clock3],
  ] as const
  let chartContent = <div className='text-muted-foreground rounded border p-8 text-center text-sm'>当前时间范围没有 ACU 请求。</div>
  if (query.isLoading) {
    chartContent = <div className='text-muted-foreground p-8 text-center text-sm'>加载中…</div>
  } else if (items.length > 0) {
    chartContent = <>
    <section className='min-w-0 shrink-0 rounded border p-3'><div className='mb-2 text-xs font-medium'>难度轨迹</div><div className='h-72 w-full min-w-0'><ResponsiveContainer width='100%' height='100%'><ComposedChart data={items} onClick={openActivePoint}><CartesianGrid strokeDasharray='3 3' vertical={false}/><XAxis dataKey='sequence' tickLine={false}/><YAxis domain={[0,100]} width={32}/><Tooltip content={<TimelineTooltip/>}/><Line dataKey='difficulty' stroke='#64748b' strokeWidth={1.5} dot={(props) => { const item = items[props.index]; const color = MODEL_COLORS[item?.actualModel] ?? '#64748b'; return <circle key={props.key} cx={props.cx} cy={props.cy} r={item?.judgeBackupUsed ? 7 : 5} fill={item?.judgeCalled ? color : 'var(--background)'} stroke={item?.status === 'error' ? '#e11d48' : color} strokeWidth={item?.judgeBackupUsed ? 3 : 2}/> }}/></ComposedChart></ResponsiveContainer></div></section>
    <section className='min-w-0 shrink-0 rounded border p-3'><div className='mb-2 text-xs font-medium'>实际人民币成本</div><div className='h-52 w-full min-w-0'><ResponsiveContainer width='100%' height='100%'><BarChart data={items} onClick={openActivePoint}><CartesianGrid strokeDasharray='3 3' vertical={false}/><XAxis dataKey='sequence' tickLine={false}/><YAxis width={42}/><Tooltip content={<TimelineTooltip/>}/><Bar dataKey='actualCostCny' fill='#0f766e' radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></section>
    </>
  }
  return <div className='flex h-full min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-4'>
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div><h2 className='text-base font-semibold'>工作路由轨迹</h2><p className='text-muted-foreground text-xs'>每个点是一条 Logical Request，点击查看完整 Session Trace。</p></div>
      <div className='flex gap-1'>{[1, 6, 24].map(value => <Button key={value} size='sm' variant={hours === value ? 'default' : 'outline'} onClick={() => setHours(value)}>{value} 小时</Button>)}</div>
    </div>
    <div className='grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded border bg-border lg:grid-cols-6'>
      {stats.map(([label, value, Icon]) => <div key={label} className='bg-background min-w-0 p-3'><div className='text-muted-foreground flex items-center gap-1.5 text-[11px]'><Icon className='size-3.5'/>{label}</div><div className='mt-1 truncate text-sm font-semibold'>{value}</div></div>)}
    </div>
    {chartContent}
    <Dialog open={Boolean(traceId)} onOpenChange={(open) => { if (!open) setTraceId('') }}><DialogContent className={cn('max-h-[92vh] max-w-6xl overflow-y-auto')}><DialogHeader><DialogTitle>ACU Session Trace</DialogTitle></DialogHeader>{traceId && <ACUSessionTracePanel identifier={traceId}/>}</DialogContent></Dialog>
  </div>
}

import { RotateCcw } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'

import type {
  ACUChannelCooldownInterval,
  ACUChannelHistoryRow,
  ACUChannelMonitorProfile,
  ACUMonitorRange,
} from '../api'
import {
  boundMonitorWindow,
  buildMonitorChartData,
  monitorNumber,
  selectMonitorCooldownIntervals,
  selectMonitorHistoryRows,
  summarizeMonitorRows,
  type MonitorChartPoint,
} from './acu-channel-history-model'

const COLORS = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#c2410c',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#a16207',
]

function latency(value: unknown): string {
  const parsed = monitorNumber(value)
  if (!parsed) return 'n/a'
  return parsed < 1000
    ? `${Math.round(parsed)} ms`
    : `${(parsed / 1000).toFixed(1)} s`
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function unique(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort()
}

function HistoryTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: MonitorChartPoint }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className='bg-popover max-h-80 max-w-[min(92vw,34rem)] overflow-y-auto rounded border p-3 text-xs shadow-md'>
      <div className='mb-2 font-medium'>{timeLabel(point.bucket)}</div>
      <div className='space-y-2'>
        {point.details.map((row) => {
          const requestCount = monitorNumber(row.request_count)
          const successRate = requestCount
            ? monitorNumber(row.success_count) / requestCount
            : 0
          return (
            <div
              key={`${row.scope_id}:${row.bucket}`}
              className='border-t pt-2 first:border-0 first:pt-0'
            >
              <div className='font-medium'>
                {row.canonical_model || 'All models'}
              </div>
              <div className='text-muted-foreground'>
                {row.provider} · {row.channel}
              </div>
              <div className='mt-1 grid grid-cols-2 gap-x-4 gap-y-1'>
                <span>Requests {requestCount}</span>
                <span>Success {(successRate * 100).toFixed(0)}%</span>
                <span>p50 {latency(row.p50_first_model_event_ms)}</span>
                <span>p95 {latency(row.p95_first_model_event_ms)}</span>
                <span>Errors {monitorNumber(row.error_count)}</span>
                <span>Watchdog {monitorNumber(row.watchdog_count)}</span>
                <span>Recovery {monitorNumber(row.recovery_count)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function nearestBucket(
  points: MonitorChartPoint[],
  timestamp: string
): string | undefined {
  const target = new Date(timestamp).getTime()
  if (!Number.isFinite(target) || points.length === 0) return undefined
  return points.reduce((nearest, point) => {
    const distance = Math.abs(new Date(point.bucket).getTime() - target)
    const current = Math.abs(new Date(nearest.bucket).getTime() - target)
    return distance < current ? point : nearest
  }).bucket
}

export function ACUChannelHistory(props: {
  range: ACUMonitorRange
  onRangeChange: (range: ACUMonitorRange) => void
  profiles: ACUChannelMonitorProfile[]
  rows: ACUChannelHistoryRow[]
  cooldownIntervals: ACUChannelCooldownInterval[]
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState({
    model: '',
    provider: '',
    channel: '',
    profile: '',
  })
  const [window, setWindow] = useState({
    start: 0,
    end: Number.MAX_SAFE_INTEGER,
  })
  const [activeCooldown, setActiveCooldown] =
    useState<ACUChannelCooldownInterval | null>(null)
  const drag = useRef<{ x: number; start: number; end: number } | null>(null)

  const models = unique(props.profiles.map((profile) => profile.canonicalModel))
  const providers = unique(props.profiles.map((profile) => profile.provider))
  const channels = unique(
    props.profiles
      .filter(
        (profile) => !filters.provider || profile.provider === filters.provider
      )
      .map((profile) => profile.channel)
  )
  const profileOptions = props.profiles.filter(
    (profile) =>
      (!filters.model || profile.canonicalModel === filters.model) &&
      (!filters.provider || profile.provider === filters.provider) &&
      (!filters.channel || profile.channel === filters.channel)
  )

  const selectedRows = useMemo(() => {
    return selectMonitorHistoryRows(props.rows, filters)
  }, [filters, props.rows])

  const seriesIds = useMemo(
    () => unique(selectedRows.map((row) => row.scope_id)),
    [selectedRows]
  )
  const chartData = useMemo(
    () => buildMonitorChartData(selectedRows, props.range),
    [props.range, selectedRows]
  )

  const lastIndex = Math.max(0, chartData.length - 1)
  const startIndex = Math.min(window.start, lastIndex)
  const endIndex = Math.min(window.end, lastIndex)
  const visibleData = chartData.slice(startIndex, endIndex + 1)
  const lastVisibleBucket = visibleData.at(-1)?.bucket
  const visibleRangeLabel =
    visibleData.length && lastVisibleBucket
      ? `${timeLabel(visibleData[0].bucket)} - ${timeLabel(lastVisibleBucket)}`
      : 'n/a'
  const visibleBuckets = new Set(visibleData.map((point) => point.bucket))
  const visibleRows = selectedRows.filter((row) =>
    visibleBuckets.has(row.bucket)
  )
  const summary = useMemo(
    () => summarizeMonitorRows(visibleRows),
    [visibleRows]
  )

  const resetZoom = useCallback(
    () => setWindow({ start: 0, end: Number.MAX_SAFE_INTEGER }),
    []
  )
  const setBoundedWindow = useCallback(
    (start: number, end: number) => {
      setWindow(boundMonitorWindow(chartData.length, start, end))
    },
    [chartData.length]
  )
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (chartData.length < 3) return
      event.preventDefault()
      const currentWidth = endIndex - startIndex + 1
      const minimumWidth = Math.min(5, chartData.length)
      const nextWidth = Math.max(
        minimumWidth,
        Math.min(
          chartData.length,
          Math.round(currentWidth * (event.deltaY > 0 ? 1.2 : 0.8))
        )
      )
      const bounds = event.currentTarget.getBoundingClientRect()
      const center = Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width)
      )
      const anchor = startIndex + center * (currentWidth - 1)
      setBoundedWindow(
        anchor - center * (nextWidth - 1),
        anchor + (1 - center) * (nextWidth - 1)
      )
    },
    [chartData.length, endIndex, setBoundedWindow, startIndex]
  )
  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!drag.current || chartData.length < 2) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const width = drag.current.end - drag.current.start + 1
      const shift = Math.round(
        ((drag.current.x - event.clientX) / Math.max(1, bounds.width)) * width
      )
      setBoundedWindow(drag.current.start + shift, drag.current.end + shift)
    },
    [chartData.length, setBoundedWindow]
  )

  const selectedCooldowns = selectMonitorCooldownIntervals(
    props.cooldownIntervals,
    filters
  )

  let activeCooldownLabel = t('Cooldown')
  if (activeCooldown?.manual_pause) {
    activeCooldownLabel = t('Manual pause')
  } else if (activeCooldown?.half_open_probe) {
    activeCooldownLabel = t('Half-open probe')
  }

  const renderCooldownAreas = () =>
    selectedCooldowns.map((item) => {
      const x1 = nearestBucket(visibleData, item.started_at)
      const x2 = nearestBucket(visibleData, item.ended_at)
      if (!x1 || !x2) return null
      let fill = '#ef4444'
      if (item.manual_pause) {
        fill = '#f59e0b'
      } else if (item.half_open_probe) {
        fill = '#8b5cf6'
      }
      return (
        <ReferenceArea
          key={`${item.channel}:${item.started_at}:${item.ended_at}:${item.reason}`}
          x1={x1}
          x2={x2}
          fill={fill}
          fillOpacity={0.07}
          strokeOpacity={0}
          onMouseEnter={() => setActiveCooldown(item)}
          onMouseLeave={() => setActiveCooldown(null)}
        />
      )
    })

  return (
    <div className='min-w-0 space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground mr-1 text-xs'>
          {t('Loaded range')}
        </span>
        {(['1h', '6h', '24h', '7d'] as ACUMonitorRange[]).map((value) => (
          <Button
            key={value}
            size='sm'
            variant={props.range === value ? 'default' : 'outline'}
            onClick={() => {
              props.onRangeChange(value)
              resetZoom()
            }}
          >
            {value}
          </Button>
        ))}
        <div className='min-w-4 flex-1' />
        <Button size='sm' variant='outline' onClick={resetZoom}>
          <RotateCcw className='mr-1.5 size-3.5' />
          {t('Reset zoom')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Drag the overview handles or use the mouse wheel to inspect any interval inside the loaded range.'
        )}
      </p>
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {(
          [
            ['model', models, 'Canonical Model'],
            ['provider', providers, 'Provider'],
            ['channel', channels, 'Channel'],
            [
              'profile',
              profileOptions.map((profile) => profile.executionProfileId),
              'Execution Profile',
            ],
          ] as const
        ).map(([key, values, label]) => (
          <select
            key={key}
            aria-label={label}
            className='bg-background h-9 min-w-0 rounded border px-2 text-xs'
            value={filters[key]}
            onChange={(event) => {
              const value = event.target.value
              setFilters((current) => ({
                ...current,
                [key]: value,
                ...(key === 'provider' ? { channel: '', profile: '' } : {}),
                ...(key === 'channel' || key === 'model'
                  ? { profile: '' }
                  : {}),
              }))
              resetZoom()
            }}
          >
            <option value=''>
              {t('All')} {t(label)}
            </option>
            {values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ))}
      </div>
      <div className='bg-muted/30 grid grid-cols-2 gap-px overflow-hidden rounded border md:grid-cols-6'>
        {[
          [t('Visible range'), visibleRangeLabel],
          [t('Requests'), summary.requests],
          [t('Success Rate'), `${(summary.successRate * 100).toFixed(1)}%`],
          ['p50 / p95', `${latency(summary.p50)} / ${latency(summary.p95)}`],
          [t('Watchdog'), summary.watchdog],
          [t('Recovery'), summary.recovery],
        ].map(([label, value]) => (
          <div key={String(label)} className='bg-background min-w-0 p-2.5'>
            <div className='text-muted-foreground text-[11px]'>{label}</div>
            <div className='mt-1 break-words text-xs font-medium'>{value}</div>
          </div>
        ))}
      </div>
      {activeCooldown && (
        <div className='bg-muted/40 flex flex-wrap gap-x-4 gap-y-1 rounded border px-3 py-2 text-xs'>
          <span>
            {timeLabel(activeCooldown.started_at)} -{' '}
            {timeLabel(activeCooldown.ended_at)}
          </span>
          <span>{activeCooldown.reason}</span>
          <span>{activeCooldown.error_class || 'n/a'}</span>
          <span>{activeCooldownLabel}</span>
          {activeCooldown.probe_result && (
            <span>{activeCooldown.probe_result}</span>
          )}
        </div>
      )}
      <div
        className='min-w-0 select-none touch-pan-y space-y-3'
        onWheel={onWheel}
        onMouseDown={(event) => {
          drag.current = { x: event.clientX, start: startIndex, end: endIndex }
        }}
        onMouseMove={onMouseMove}
        onMouseUp={() => {
          drag.current = null
        }}
        onMouseLeave={() => {
          drag.current = null
        }}
        onDoubleClick={resetZoom}
      >
        <div className='h-72 min-w-0 rounded border p-3'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={visibleData}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='bucket'
                minTickGap={28}
                tickFormatter={timeLabel}
              />
              <YAxis
                tickFormatter={(value) => latency(value)}
                width={58}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<HistoryTooltip />} />
              {renderCooldownAreas()}
              {seriesIds.map((series, index) => (
                <Line
                  key={`p50:${series}`}
                  dataKey={`p50:${series}`}
                  name={`${series} p50`}
                  stroke={COLORS[index % COLORS.length]}
                  strokeDasharray='4 3'
                  strokeOpacity={0.55}
                  dot={false}
                  connectNulls={false}
                />
              ))}
              {seriesIds.map((series, index) => (
                <Line
                  key={`p95:${series}`}
                  dataKey={`p95:${series}`}
                  name={`${series} p95`}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className='h-64 min-w-0 rounded border p-3'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={visibleData}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='bucket'
                minTickGap={28}
                tickFormatter={timeLabel}
              />
              <YAxis allowDecimals={false} width={36} />
              <Tooltip content={<HistoryTooltip />} />
              <Line
                dataKey='requestCount'
                name={t('Request Count')}
                stroke='#2563eb'
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey='rateLimitedCount'
                name='429'
                stroke='#a16207'
                dot={false}
              />
              <Line
                dataKey='serverErrorCount'
                name='5xx / 524'
                stroke='#be123c'
                dot={false}
              />
              <Line
                dataKey='watchdogCount'
                name={t('Watchdog')}
                stroke='#c2410c'
                dot={false}
              />
              <Line
                dataKey='recoveryCount'
                name={t('Recovery')}
                stroke='#0f766e'
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className='h-14 min-w-0 rounded border px-2 pt-1'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={chartData}>
            <Line
              dataKey='requestCount'
              stroke='#64748b'
              dot={false}
              isAnimationActive={false}
            />
            <Brush
              dataKey='bucket'
              height={30}
              travellerWidth={10}
              startIndex={startIndex}
              endIndex={endIndex}
              tickFormatter={timeLabel}
              onChange={(selection) => {
                if (
                  selection.startIndex == null ||
                  selection.endIndex == null
                ) {
                  return
                }
                setWindow({
                  start: selection.startIndex,
                  end: selection.endIndex,
                })
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

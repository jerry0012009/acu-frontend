import type { EChartsOption } from 'echarts'
import { t } from 'i18next'

import type { ACUWorkTimelineItem } from '../api'

export const ACU_TIMELINE_INSIDE_ZOOM_ID = 'acu-timeline-inside-zoom'
export const ACU_TIMELINE_SLIDER_ZOOM_ID = 'acu-timeline-slider-zoom'

export function rollingTimelineRange(hours: number, nowMs = Date.now()) {
  const to = Math.floor(nowMs / 1000)
  return { from: to - hours * 3600, to }
}

const MODEL_COLORS: Record<string, string> = {
  'gpt-5.4-mini': '#0f766e',
  'gpt-5.6-luna': '#2563eb',
  'gpt-5.6-terra': '#c2410c',
  'gpt-5.6-sol': '#a21caf',
  'gpt-5.5': '#ca8a04',
}

export type TimelineChartDatum = {
  value: [number, number]
  timelineItem: ACUWorkTimelineItem
  chartOrder: number
  symbolSize?: number
  itemStyle?: Record<string, unknown>
}

type TimelineChartOptions = {
  items: ACUWorkTimelineItem[]
  dark: boolean
}

function modelColor(item: ACUWorkTimelineItem): string {
  return MODEL_COLORS[item.actualModel] ?? '#64748b'
}

function pointStroke(item: ACUWorkTimelineItem): string {
  if (item.billingStatus === 'unsettled') return '#f97316'
  if (item.status === 'failed') return '#e11d48'
  if (item.status === 'completed_with_recovery') return '#f97316'
  return modelColor(item)
}

function formatLatency(value: number): string {
  if (value <= 0) return '—'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

function formatMoney(value: number): string {
  return `¥${value.toFixed(value < 0.01 ? 6 : 3)}`
}

function formatOptionalMoney(value: number | undefined): string {
  return value == null ? '—' : formatMoney(value)
}

export function timelineUserCharge(
  item: ACUWorkTimelineItem
): number | undefined {
  return item.userChargeCny
}

export function timelineCashCost(
  item: ACUWorkTimelineItem
): number | undefined {
  return item.actualCashCostCny
}

export function thinkingEffort(item: ACUWorkTimelineItem): string {
  return (
    item.resolvedReasoningEffort ||
    item.presetReasoningEffort ||
    item.clientRequestedReasoningEffort ||
    'default'
  )
}

export function formatTimelineTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')} UTC${sign}${hours}:${minutes}`
}

export function isCompletedStatus(status: string): boolean {
  return ['success', 'completed', 'completed_with_recovery'].includes(status)
}

export function isTimelineError(item: ACUWorkTimelineItem): boolean {
  return (
    item.billingStatus === 'unsettled' ||
    item.status === 'completed_with_recovery' ||
    (!isCompletedStatus(item.status) && item.status !== 'cancelled')
  )
}

export function filterTimelineItems(
  items: ACUWorkTimelineItem[],
  search: string,
  mode: 'all' | 'errors'
): ACUWorkTimelineItem[] {
  const query = search.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (mode === 'errors' && !isTimelineError(item)) return false
    if (!query) return true
    return [
      item.taskId,
      item.logicalRequestId,
      item.actualModel,
      item.requestedModel,
      item.channel,
      item.provider,
    ].some((value) => value.toLocaleLowerCase().includes(query))
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function judgeLabel(item: ACUWorkTimelineItem): string {
  if (item.judgeResultSource === 'upstream_live') return 'Judge Fresh'
  if (item.judgeResultSource === 'disk_cache') return 'Judge Cache'
  if (item.judgeResultSource === 'recent_evaluation') {
    return 'Judge failed · reused previous'
  }
  if (item.judgeResultSource === 'rules_strategy') return 'Rules fallback'
  if (item.judgeReused && !item.judgeCalled) return 'Judge Reused'
  return 'Judge unavailable'
}

function tooltipHtml(item: ACUWorkTimelineItem, chartOrder: number): string {
  const backup = item.judgeBackupUsed ? ' · Backup' : ''
  return [
    `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(item.actualModel || item.requestedModel)}</div>`,
    `<div>${escapeHtml(t('Request'))} #${chartOrder} · ${escapeHtml(t('Task step'))} ${item.sequence}</div>`,
    `<div>${escapeHtml(t('Time'))} ${escapeHtml(formatTimelineTimestamp(item.timestamp))}</div>`,
    `<div>${escapeHtml(t('Thinking effort'))} ${escapeHtml(thinkingEffort(item))}</div>`,
    `<div>${escapeHtml(t('Difficulty'))} ${item.difficultyRecorded ? item.difficulty.toFixed(1) : '—'}</div>`,
    `<div>${escapeHtml(t(judgeLabel(item)))}${backup}</div>`,
    `<div>${escapeHtml(item.provider)} · ${escapeHtml(item.channel)}</div>`,
    `<div>${escapeHtml(t('End-to-end'))} ${formatLatency(item.endToEndLatencyMs)} · ${escapeHtml(t('First model event'))} ${formatLatency(item.firstModelEventLatencyMs)}</div>`,
    `<div>${escapeHtml(t('Judge'))} ${formatLatency(item.judgeLatencyMs)} · ${escapeHtml(t('Provider'))} ${formatLatency(item.providerLatencyMs)}</div>`,
    `<div>${escapeHtml(t('User charge'))} ${formatOptionalMoney(timelineUserCharge(item))} · ${escapeHtml(t('Cash cost'))} ${formatOptionalMoney(timelineCashCost(item))}</div>`,
    item.billingStatus === 'unsettled'
      ? `<div style="color:#f97316;margin-top:4px">${escapeHtml(t('Billing unsettled · insufficient quota'))}</div>`
      : '',
    item.errorClass
      ? `<div style="color:#e11d48;margin-top:4px">${escapeHtml(item.errorClass)}</div>`
      : '',
  ].join('')
}

function timelineDatumFromTooltip(
  params: unknown
): TimelineChartDatum | undefined {
  const data = (params as { data?: Partial<TimelineChartDatum> })?.data
  return data?.timelineItem && data.chartOrder != null
    ? (data as TimelineChartDatum)
    : undefined
}

function difficultyDatum(
  item: ACUWorkTimelineItem,
  chartOrder: number,
  dark: boolean
): TimelineChartDatum {
  let fill = dark ? '#0f172a' : '#ffffff'
  if (item.judgeCalled) fill = modelColor(item)
  return {
    value: [chartOrder, item.difficultyRecorded ? item.difficulty : Number.NaN],
    timelineItem: item,
    chartOrder,
    symbolSize: item.judgeBackupUsed ? 13 : 10,
    itemStyle: {
      color: fill,
      borderColor: pointStroke(item),
      borderWidth: item.judgeBackupUsed ? 3 : 2,
    },
  }
}

function costDatum(
  item: ACUWorkTimelineItem,
  chartOrder: number
): TimelineChartDatum {
  return {
    value: [chartOrder, timelineCashCost(item) ?? Number.NaN],
    timelineItem: item,
    chartOrder,
    itemStyle: { color: modelColor(item), opacity: 0.82 },
  }
}

function clampOrder(value: number, itemCount: number): number {
  return Math.min(itemCount, Math.max(1, value))
}

export function timelineOrderRangeFromZoom(
  event: unknown,
  itemCount: number
): { start: number; end: number } | undefined {
  if (itemCount < 1) return
  const payload = event as {
    start?: number
    end?: number
    startValue?: number
    endValue?: number
    batch?: Array<{
      start?: number
      end?: number
      startValue?: number
      endValue?: number
    }>
  }
  const zoom = payload.batch?.[0] ?? payload
  if (Number.isFinite(zoom.startValue) && Number.isFinite(zoom.endValue)) {
    const start = clampOrder(Math.floor(Number(zoom.startValue)), itemCount)
    const end = clampOrder(Math.ceil(Number(zoom.endValue)), itemCount)
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }
  if (!Number.isFinite(zoom.start) || !Number.isFinite(zoom.end)) return
  const start = clampOrder(
    Math.floor(1 + ((itemCount - 1) * Number(zoom.start)) / 100),
    itemCount
  )
  const end = clampOrder(
    Math.ceil(1 + ((itemCount - 1) * Number(zoom.end)) / 100),
    itemCount
  )
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export function timelineItemFromChartEvent(
  event: unknown
): ACUWorkTimelineItem | undefined {
  const data = (event as { data?: Partial<TimelineChartDatum> })?.data
  return data?.timelineItem?.logicalRequestId ? data.timelineItem : undefined
}

export function buildACUWorkTimelineChartOption({
  items,
  dark,
}: TimelineChartOptions): EChartsOption {
  const text = dark ? '#cbd5e1' : '#475569'
  const grid = dark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.18)'
  const slider = dark ? '#1e293b' : '#f1f5f9'
  const handle = dark ? '#93c5fd' : '#2563eb'
  const orderedItems = items.map((item, index) => ({
    item,
    chartOrder: index + 1,
  }))
  const axisMax = items.length === 1 ? 1.01 : Math.max(1, items.length)
  const minimumOrderSpan = items.length > 5 ? 4 : undefined

  const segments = [...new Set(items.map((item) => item.segmentId))]
  const difficultySeries = segments.map((segmentId) => ({
    id: `difficulty-${segmentId}`,
    name: segmentId,
    type: 'line' as const,
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: orderedItems
      .filter(({ item }) => item.segmentId === segmentId)
      .map(({ item, chartOrder }) => difficultyDatum(item, chartOrder, dark)),
    showSymbol: true,
    connectNulls: false,
    symbol: 'circle',
    lineStyle: { color: '#64748b', width: 1.5, opacity: 0.68 },
    emphasis: { focus: 'self' as const, scale: 1.3 },
    animation: false,
  }))

  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: [
      { left: 62, right: 22, top: 18, height: '48%' },
      { left: 62, right: 22, top: '63%', bottom: 78 },
    ],
    axisPointer: {
      link: [{ xAxisIndex: [0, 1] }],
      lineStyle: { color: '#64748b', type: 'dashed' },
    },
    xAxis: [
      {
        type: 'value',
        gridIndex: 0,
        min: 1,
        max: axisMax,
        minInterval: 1,
        name: t('Request order'),
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 1,
        max: axisMax,
        minInterval: 1,
        name: t('Request order'),
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: {
          color: text,
          fontSize: 10,
          hideOverlap: true,
          formatter: (value: number) =>
            Number.isInteger(value) ? String(value) : '',
        },
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        min: 0,
        max: 100,
        name: t('Difficulty'),
        nameLocation: 'middle',
        nameGap: 42,
        nameTextStyle: { color: text, fontSize: 11 },
        axisLabel: { color: text, fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: grid, type: 'dashed' } },
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        name: t('Cash cost'),
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: text, fontSize: 11 },
        axisLabel: {
          color: text,
          fontSize: 10,
          formatter: (value: number) => formatMoney(value),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: grid, type: 'dashed' } },
      },
    ],
    dataZoom: [
      {
        id: ACU_TIMELINE_INSIDE_ZOOM_ID,
        type: 'inside',
        xAxisIndex: [0, 1],
        filterMode: 'filter',
        start: 0,
        end: 100,
        minValueSpan: minimumOrderSpan,
        zoomOnMouseWheel: false,
        moveOnMouseMove: false,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
      },
      {
        id: ACU_TIMELINE_SLIDER_ZOOM_ID,
        type: 'slider',
        xAxisIndex: [0, 1],
        filterMode: 'filter',
        start: 0,
        end: 100,
        minValueSpan: minimumOrderSpan,
        bottom: 14,
        height: 30,
        showDetail: true,
        labelFormatter: (value: number) => `#${Math.round(value)}`,
        realtime: true,
        brushSelect: true,
        backgroundColor: slider,
        fillerColor: dark
          ? 'rgba(37, 99, 235, 0.24)'
          : 'rgba(147, 197, 253, 0.38)',
        borderColor: grid,
        handleStyle: { color: handle, borderColor: handle },
        moveHandleStyle: { color: handle, opacity: 0.7 },
        dataBackground: {
          lineStyle: { color: '#64748b', opacity: 0.5 },
          areaStyle: { color: '#94a3b8', opacity: 0.16 },
        },
        selectedDataBackground: {
          lineStyle: { color: handle, opacity: 0.8 },
          areaStyle: { color: handle, opacity: 0.18 },
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: dark
        ? 'rgba(15, 23, 42, 0.96)'
        : 'rgba(255, 255, 255, 0.98)',
      borderColor: grid,
      textStyle: { color: dark ? '#e2e8f0' : '#0f172a', fontSize: 12 },
      formatter: (params: unknown) => {
        const datum = timelineDatumFromTooltip(params)
        return datum ? tooltipHtml(datum.timelineItem, datum.chartOrder) : ''
      },
    },
    series: [
      ...difficultySeries,
      {
        id: 'judge-backup-rings',
        type: 'scatter',
        xAxisIndex: 0,
        yAxisIndex: 0,
        silent: true,
        symbol: 'circle',
        symbolSize: 19,
        data: orderedItems
          .filter(({ item }) => item.judgeBackupUsed && item.difficultyRecorded)
          .map(({ item, chartOrder }) => ({
            value: [chartOrder, item.difficulty],
            chartOrder,
            timelineItem: item,
            itemStyle: {
              color: 'transparent',
              borderColor: modelColor(item),
              borderWidth: 1.5,
              opacity: 0.5,
            },
          })),
        animation: false,
      },
      {
        id: 'cost-series',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: orderedItems.map(({ item, chartOrder }) =>
          costDatum(item, chartOrder)
        ),
        barMinWidth: 3,
        barMaxWidth: 22,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        emphasis: { focus: 'self' },
        animation: false,
      },
    ],
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ]
}

export function summarizeTimelineItems(items: ACUWorkTimelineItem[]) {
  const judged = items.filter((item) => item.judgeCalled)
  const firstAttemptSamples = judged.filter(
    (item) => item.judgeFirstAttemptRecorded
  )
  const fallbackSamples = judged.filter((item) => item.judgeFallbackRecorded)
  const completed = items.filter((item) => isCompletedStatus(item.status))
  const userChargeSamples = items.filter(
    (item) =>
      item.billingStatus === 'finalized' && timelineUserCharge(item) != null
  )
  const actualCashCostSamples = items.filter(
    (item) => timelineCashCost(item) != null
  )
  const latencies = items
    .map((item) => item.firstModelEventLatencyMs)
    .filter((value) => value > 0)
  return {
    apiSteps: items.length,
    judgeCalledRequests: judged.length,
    judgeFirstAttemptSuccessSamples: firstAttemptSamples.length,
    judgeFirstAttemptSuccessRate: firstAttemptSamples.length
      ? firstAttemptSamples.filter((item) => item.judgeFirstAttemptSucceeded)
          .length / firstAttemptSamples.length
      : 0,
    judgeRulesFallbackSamples: fallbackSamples.length,
    judgeRulesFallbackRate: fallbackSamples.length
      ? fallbackSamples.filter(
          (item) =>
            item.judgeStatus === 'rules_fallback' ||
            item.judgeResultSource === 'rules_strategy'
        ).length / fallbackSamples.length
      : 0,
    completionRate: items.length ? completed.length / items.length : 0,
    cacheHitRate: items.reduce((sum, item) => sum + item.inputTokens, 0)
      ? items.reduce((sum, item) => sum + item.cachedInputTokens, 0) /
        items.reduce((sum, item) => sum + item.inputTokens, 0)
      : 0,
    userChargeSamples: userChargeSamples.length,
    actualCashCostSamples: actualCashCostSamples.length,
    totalUserChargeCny: items.reduce(
      (sum, item) =>
        sum +
        (item.billingStatus === 'finalized'
          ? (timelineUserCharge(item) ?? 0)
          : 0),
      0
    ),
    unsettledRequests: items.filter(
      (item) => item.billingStatus === 'unsettled'
    ).length,
    totalActualCashCostCny: items.reduce(
      (sum, item) => sum + (timelineCashCost(item) ?? 0),
      0
    ),
    actualTotalCostCny: items.reduce(
      (sum, item) => {
        if (item.billingStatus !== 'finalized') return sum
        return (
          sum +
          (timelineUserCharge(item) ??
            timelineCashCost(item) ??
            0)
        )
      },
      0
    ),
    p50FirstModelEventLatencyMs: percentile(latencies, 0.5),
    p95FirstModelEventLatencyMs: percentile(latencies, 0.95),
  }
}

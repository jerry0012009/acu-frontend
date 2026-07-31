import type {
  Datum,
  ICartesianAxisSpec,
  ICommonChartSpec,
} from '@visactor/vchart'

import type { ACUWorkTimelineItem } from '../api'

export const ACU_TIMELINE_ZOOM_ID = 'acu-timeline-data-zoom'

const MODEL_COLORS: Record<string, string> = {
  'gpt-5.4-mini': '#0f766e',
  'gpt-5.6-luna': '#2563eb',
  'gpt-5.6-terra': '#c2410c',
  'gpt-5.6-sol': '#a21caf',
  'gpt-5.5': '#ca8a04',
}

type TimelineChartOptions = {
  items: ACUWorkTimelineItem[]
  hours: number
  dark: boolean
}

function modelColor(datum: Record<string, unknown>): string {
  return MODEL_COLORS[String(datum.actualModel ?? '')] ?? '#64748b'
}

function pointStroke(datum: Record<string, unknown>): string {
  if (datum.status === 'failed') return '#e11d48'
  if (datum.status === 'completed_with_recovery') return '#f97316'
  return modelColor(datum)
}

function judgeMode(datum: Record<string, unknown>): string {
  if (datum.judgeCalled) return 'New'
  if (datum.judgeReused) return 'Reused'
  return 'Unavailable'
}

function pointFill(datum: Record<string, unknown>, dark: boolean): string {
  if (datum.judgeCalled) return modelColor(datum)
  return dark ? '#0f172a' : '#ffffff'
}

function formatTime(value: number): string {
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLatency(value: unknown): string {
  const parsed = Number(value) || 0
  return parsed < 1000
    ? `${Math.round(parsed)} ms`
    : `${(parsed / 1000).toFixed(1)} s`
}

function formatMoney(value: unknown): string {
  const parsed = Number(value) || 0
  return `¥${parsed.toFixed(parsed < 0.01 ? 6 : 3)}`
}

function tooltipDatum(datum?: Datum): Record<string, unknown> {
  return (datum ?? {}) as Record<string, unknown>
}

function numericLabel(value: string | string[]): number {
  return Number(Array.isArray(value) ? value[0] : value)
}

function tooltipContent() {
  return [
    {
      key: 'Difficulty',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        return `${Number(datum.difficulty ?? 0).toFixed(1)} · Step ${datum.sequence ?? ''}`
      },
    },
    {
      key: 'Judge',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        const mode = judgeMode(datum)
        return `${mode}${datum.judgeBackupUsed ? ' · Backup' : ''}`
      },
    },
    {
      key: 'Supply',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        return `${datum.provider ?? ''} · ${datum.channel ?? ''}`
      },
    },
    {
      key: 'End-to-end / First event',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        return `${formatLatency(datum.endToEndLatencyMs)} / ${formatLatency(datum.firstModelEventLatencyMs)}`
      },
    },
    {
      key: 'Judge / Provider',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        return `${formatLatency(datum.judgeLatencyMs)} / ${formatLatency(datum.providerLatencyMs)}`
      },
    },
    {
      key: 'Cost',
      value: (raw?: Datum) => {
        const datum = tooltipDatum(raw)
        return `${formatMoney(datum.actualCostCny)} · Judge ${formatMoney(datum.judgeCostCny)} · Provider ${formatMoney(datum.providerCostCny)} · Failed ${formatMoney(datum.failedAttemptCostCny)}`
      },
    },
  ]
}

export function buildACUWorkTimelineChartSpec({
  items,
  hours,
  dark,
}: TimelineChartOptions): ICommonChartSpec {
  const text = dark ? '#cbd5e1' : '#475569'
  const grid = dark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.18)'
  const surface = dark ? 'rgba(30, 41, 59, 0.76)' : 'rgba(241, 245, 249, 0.92)'
  let minimumWindowSeconds = 5 * 60
  if (hours >= 24) {
    minimumWindowSeconds = 60 * 60
  } else if (hours >= 6) {
    minimumWindowSeconds = 15 * 60
  }
  const backupItems = items.filter((item) => item.judgeBackupUsed)
  const axes: ICartesianAxisSpec[] = [
    {
      id: 'difficulty-x-axis',
      orient: 'bottom',
      regionId: 'difficulty-region',
      type: 'linear',
      zero: false,
      nice: false,
      visible: false,
    },
    {
      id: 'cost-x-axis',
      orient: 'bottom',
      regionId: 'cost-region',
      type: 'linear',
      zero: false,
      nice: false,
      label: {
        formatMethod: (value) => formatTime(numericLabel(value)),
        style: { fill: text, fontSize: 10 },
        autoHide: true,
      },
      tick: { visible: false },
    },
    {
      id: 'difficulty-y-axis',
      orient: 'left',
      regionId: 'difficulty-region',
      min: 0,
      max: 100,
      title: { visible: true, text: 'Difficulty' },
      label: { style: { fill: text, fontSize: 10 } },
      grid: {
        visible: true,
        style: { stroke: grid, lineDash: [3, 3] },
      },
    },
    {
      id: 'cost-y-axis',
      orient: 'left',
      regionId: 'cost-region',
      min: 0,
      title: { visible: true, text: 'Cost' },
      label: {
        formatMethod: (value) => formatMoney(numericLabel(value)),
        style: { fill: text, fontSize: 10 },
      },
      grid: {
        visible: true,
        style: { stroke: grid, lineDash: [3, 3] },
      },
    },
  ]

  return {
    type: 'common',
    background: 'transparent',
    padding: { top: 14, right: 16, bottom: 58, left: 8 },
    layout: {
      type: 'grid',
      col: 2,
      row: 5,
      colWidth: [{ index: 0, size: 58 }],
      rowHeight: [
        { index: 0, size: (height) => height * 0.52 },
        { index: 1, size: 20 },
        { index: 3, size: 28 },
        { index: 4, size: 46 },
      ],
      elements: [
        { modelId: 'difficulty-region', col: 1, row: 0 },
        { modelId: 'difficulty-x-axis', col: 1, row: 1 },
        { modelId: 'difficulty-y-axis', col: 0, row: 0 },
        { modelId: 'cost-region', col: 1, row: 2 },
        { modelId: 'cost-x-axis', col: 1, row: 3 },
        { modelId: 'cost-y-axis', col: 0, row: 2 },
        { modelId: ACU_TIMELINE_ZOOM_ID, col: 1, row: 4 },
      ],
    },
    data: [
      { id: 'acu-timeline-items', values: items },
      { id: 'acu-timeline-backups', values: backupItems },
    ],
    region: [
      {
        id: 'difficulty-region',
        padding: { right: 18, top: 8, bottom: 4 },
      },
      {
        id: 'cost-region',
        padding: { right: 18, top: 8, bottom: 4 },
      },
    ],
    series: [
      {
        id: 'difficulty-series',
        type: 'line',
        regionId: 'difficulty-region',
        dataId: 'acu-timeline-items',
        xField: 'timestamp',
        yField: 'difficulty',
        seriesField: 'segmentId',
        invalidType: 'break',
        line: {
          interactive: false,
          style: {
            stroke: '#64748b',
            lineWidth: 1.5,
            strokeOpacity: 0.68,
          },
        },
        point: {
          visible: true,
          interactive: true,
          style: {
            size: (datum: Record<string, unknown>) =>
              datum.judgeBackupUsed ? 13 : 10,
            fill: (datum: Record<string, unknown>) => pointFill(datum, dark),
            stroke: pointStroke,
            lineWidth: (datum: Record<string, unknown>) =>
              datum.judgeBackupUsed ? 3 : 2,
            cursor: 'pointer',
          },
        },
      },
      {
        id: 'judge-backup-rings',
        type: 'scatter',
        regionId: 'difficulty-region',
        dataId: 'acu-timeline-backups',
        xField: 'timestamp',
        yField: 'difficulty',
        point: {
          interactive: false,
          style: {
            size: 19,
            fillOpacity: 0,
            stroke: modelColor,
            strokeOpacity: 0.5,
            lineWidth: 1.5,
          },
        },
      },
      {
        id: 'cost-series',
        type: 'bar',
        regionId: 'cost-region',
        dataId: 'acu-timeline-items',
        xField: 'timestamp',
        yField: 'actualCostCny',
        barMinWidth: 3,
        barMaxWidth: 22,
        bar: {
          interactive: true,
          style: {
            fill: modelColor,
            fillOpacity: 0.82,
            cornerRadius: [3, 3, 0, 0],
            cursor: 'pointer',
          },
        },
      },
    ],
    axes,
    dataZoom: [
      {
        id: ACU_TIMELINE_ZOOM_ID,
        orient: 'bottom',
        regionIndex: [0, 1],
        field: 'timestamp',
        valueField: 'timestamp',
        filterMode: 'filter',
        start: 0,
        end: 1,
        minValueSpan: minimumWindowSeconds,
        height: 34,
        showDetail: true,
        showBackgroundChart: true,
        brushSelect: true,
        realTime: true,
        roamZoom: { enable: true, focus: true, rate: 1.2 },
        roamDrag: { enable: true, rate: 1 },
        roamScroll: { enable: true, rate: 1 },
        background: { style: { fill: surface } },
        selectedBackground: {
          style: { fill: dark ? '#1d4ed8' : '#bfdbfe', fillOpacity: 0.28 },
        },
        startText: {
          formatMethod: (value: number | string) => formatTime(Number(value)),
        },
        endText: {
          formatMethod: (value: number | string) => formatTime(Number(value)),
        },
      },
    ],
    crosshair: {
      xField: { visible: true, line: { style: { stroke: '#64748b' } } },
      yField: { visible: false },
    },
    tooltip: {
      mark: {
        title: {
          value: (raw?: Datum) => {
            const datum = tooltipDatum(raw)
            return `${datum.actualModel ?? datum.requestedModel ?? ''} · ${new Date(Number(datum.timestamp) * 1000).toLocaleString()}`
          },
        },
        content: tooltipContent(),
      },
    },
    legends: { visible: false },
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
  const judged = items.filter((item) => item.judgeCalled || item.judgeReused)
  const completed = items.filter((item) =>
    ['completed', 'completed_with_recovery'].includes(item.status)
  )
  const latencies = items
    .map((item) => item.firstModelEventLatencyMs)
    .filter((value) => value > 0)
  return {
    apiSteps: items.length,
    judgeCalls: items.filter((item) => item.judgeCalled).length,
    judgeReuseRate: judged.length
      ? items.filter((item) => item.judgeReused).length / judged.length
      : 0,
    completionRate: items.length ? completed.length / items.length : 0,
    actualTotalCostCny: items.reduce(
      (sum, item) => sum + item.actualCostCny,
      0
    ),
    p50FirstModelEventLatencyMs: percentile(latencies, 0.5),
    p95FirstModelEventLatencyMs: percentile(latencies, 0.95),
  }
}

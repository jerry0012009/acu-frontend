import type { EChartsOption } from 'echarts'
import { t } from 'i18next'

import type { ACUWorkTimelineItem } from '../api'
import {
  buildACUWorkTimelineChartOption,
  formatTimelineTimestamp,
  thinkingEffort,
  type TimelineChartDatum,
} from './acu-work-timeline-model'

export const QUALITY_TIMELINE_COLORS = {
  executed: '#0f766e',
  sameBudget: '#2563eb',
  mostExpensive: '#b45309',
  officialCost: '#64748b',
} as const

export function qualityTimelineColors(
  dark: boolean
): Record<keyof typeof QUALITY_TIMELINE_COLORS, string> {
  if (!dark) return QUALITY_TIMELINE_COLORS
  return {
    executed: '#2dd4bf',
    sameBudget: '#60a5fa',
    mostExpensive: '#fbbf24',
    officialCost: '#cbd5e1',
  }
}

export function qualityTimelineItems(
  items: ACUWorkTimelineItem[]
): ACUWorkTimelineItem[] {
  return items.filter((item) => item.pointType === 'execution')
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '\u2014'
  return `\u00a5${value.toFixed(value < 0.01 ? 6 : 3)}`
}

export function timelineCostDifference(item: ACUWorkTimelineItem): string {
  const charge = item.qualityComparison?.modelChargeCny
  const official = item.qualityComparison?.officialModelCostCny
  if (charge == null || official == null || official <= 0) return '\u2014'
  const difference = charge - official
  const change = (Math.abs(difference) / official) * 100
  if (Math.abs(difference) < 1e-10) return t('Same as official direct')
  const values = {
    amount: money(Math.abs(difference)),
    percent: change.toFixed(1),
  }
  return difference > 0
    ? t('Above official direct by {{amount}} ({{percent}}%)', values)
    : t('Below official direct by {{amount}} ({{percent}}%)', values)
}

export function qualityTimelineTooltip(
  item: ACUWorkTimelineItem,
  order: number,
  dark = false
): string {
  const comparison = item.qualityComparison
  const colors = qualityTimelineColors(dark)
  const rows = [
    {
      name: t('ACU execution'),
      quality: comparison?.estimatedQuality,
      model: `${item.actualModel} \u00b7 ${thinkingEffort(item)}`,
      color: colors.executed,
    },
    {
      name: t('Same-budget reference'),
      quality: comparison?.sameBudget?.estimatedQuality,
      model: comparison?.sameBudget?.displayName,
      color: colors.sameBudget,
    },
    {
      name: t('Highest official price'),
      quality: comparison?.mostExpensive?.estimatedQuality,
      model: comparison?.mostExpensive?.displayName,
      color: colors.mostExpensive,
    },
  ]
  return [
    '<div style="width:260px;max-width:100%;white-space:normal;overflow-wrap:anywhere">',
    `<div style="font-weight:600">${escapeHtml(t('Request'))} #${order}</div>`,
    `<div style="font-size:10px;opacity:.7;margin:3px 0 10px">${escapeHtml(formatTimelineTimestamp(item.timestamp))}</div>`,
    ...rows.map((row, index) => {
      const quality = row.quality
      let gap = ''
      if (
        index > 0 &&
        quality != null &&
        comparison?.estimatedQuality != null
      ) {
        const delta = quality - comparison.estimatedQuality
        gap = ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`
      }
      return [
        '<div style="margin:8px 0">',
        `<div style="display:flex;justify-content:space-between;gap:12px"><span><span style="display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:${row.color}"></span>${escapeHtml(row.name)}</span><strong>${quality?.toFixed(1) ?? '\u2014'}${gap}</strong></div>`,
        `<div style="font-size:10px;opacity:.7;margin-left:13px">${escapeHtml(row.model || t('No comparable model'))}</div>`,
        '</div>',
      ].join('')
    }),
    '<div style="border-top:1px solid #94a3b840;margin-top:10px;padding-top:8px">',
    `<div style="display:flex;justify-content:space-between;gap:12px"><span>${escapeHtml(t('Model execution charge'))}</span><strong>${money(comparison?.modelChargeCny)}</strong></div>`,
    `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:4px"><span>${escapeHtml(t('Official direct equivalent'))}</span><span>${money(comparison?.officialModelCostCny)}</span></div>`,
    `<div style="font-size:11px;margin-top:7px">${escapeHtml(timelineCostDifference(item))}</div>`,
    '</div></div>',
  ].join('')
}

export function buildACUQualityTimelineChartOption(props: {
  items: ACUWorkTimelineItem[]
  dark: boolean
}): EChartsOption {
  const items = qualityTimelineItems(props.items)
  const colors = qualityTimelineColors(props.dark)
  const option = buildACUWorkTimelineChartOption({ items, dark: props.dark })
  const grids = option.grid as Array<Record<string, unknown>>
  for (const grid of grids) {
    grid.left = 84
  }
  const axes = option.yAxis as Array<Record<string, unknown>>
  axes[0] = { ...axes[0], name: t('Estimated quality') }
  axes[1] = { ...axes[1], name: t('Model charge'), nameGap: 68 }
  const groupKey = (item: ACUWorkTimelineItem): string =>
    `${item.userId ?? 'self'}:${item.sessionId || item.taskId || item.logicalRequestId}:${item.protocol ?? 'unknown'}`
  const groups = new Map<
    string,
    Array<{ item: ACUWorkTimelineItem; index: number }>
  >()
  items.forEach((item, index) => {
    const key = groupKey(item)
    const group = groups.get(key) ?? []
    group.push({ item, index })
    groups.set(key, group)
  })
  const specifications = [
    {
      id: 'executed',
      name: t('ACU execution'),
      color: colors.executed,
      value: (item: ACUWorkTimelineItem) =>
        item.qualityComparison?.estimatedQuality,
    },
    {
      id: 'same-budget',
      name: t('Same-budget reference'),
      color: colors.sameBudget,
      value: (item: ACUWorkTimelineItem) =>
        item.qualityComparison?.sameBudget?.estimatedQuality,
    },
    {
      id: 'most-expensive',
      name: t('Highest official price'),
      color: colors.mostExpensive,
      value: (item: ACUWorkTimelineItem) =>
        item.qualityComparison?.mostExpensive?.estimatedQuality,
    },
  ]
  const datum = (
    item: ACUWorkTimelineItem,
    index: number,
    value: number | undefined
  ): TimelineChartDatum => ({
    value: [index + 1, value ?? Number.NaN],
    chartOrder: index + 1,
    timelineItem: item,
  })
  const series: NonNullable<EChartsOption['series']> = [...groups].flatMap(
    ([group, entries]) =>
      specifications.flatMap((specification) => {
        const data: TimelineChartDatum[] = []
        let previousIndex = -1
        for (const { item, index } of entries) {
          if (previousIndex >= 0 && index > previousIndex + 1) {
            // Break the line when another session occupied intervening requests.
            const gap = datum(item, index, undefined)
            gap.value[0] -= 0.5
            data.push(gap)
          }
          data.push(datum(item, index, specification.value(item)))
          previousIndex = index
        }
        const pointCount = data.filter((point) =>
          Number.isFinite(point.value[1])
        ).length
        if (pointCount === 0) return []
        return [
          {
            id: `quality-${specification.id}-${group}`,
            name: specification.name,
            type: 'line' as const,
            xAxisIndex: 0,
            yAxisIndex: 0,
            data,
            connectNulls: false,
            smooth: false,
            showSymbol: items.length <= 80 || pointCount === 1,
            symbol: 'circle',
            symbolSize: specification.id === 'executed' ? 6 : 4,
            z: specification.id === 'executed' ? 4 : 2,
            lineStyle: {
              color: specification.color,
              width: specification.id === 'executed' ? 2.5 : 1.5,
              type:
                specification.id === 'executed'
                  ? ('solid' as const)
                  : ('dashed' as const),
            },
            itemStyle: { color: specification.color },
            emphasis: { focus: 'series' as const },
            animation: false,
          },
        ]
      })
  )
  series.push(
    {
      id: 'quality-model-charge',
      name: t('Model execution charge'),
      type: 'bar',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: items.map((item, index) =>
        datum(item, index, item.qualityComparison?.modelChargeCny)
      ),
      barMinWidth: 3,
      barMaxWidth: 18,
      itemStyle: {
        color: colors.executed,
        opacity: 0.65,
        borderRadius: [2, 2, 0, 0],
      },
    },
    {
      id: 'quality-official-cost',
      name: t('Official direct equivalent'),
      type: 'line',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: items.map((item, index) =>
        datum(item, index, item.qualityComparison?.officialModelCostCny)
      ),
      connectNulls: false,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol:
        items.length <= 80 ||
        items.filter(
          (item) => item.qualityComparison?.officialModelCostCny != null
        ).length === 1,
      itemStyle: { color: colors.officialCost },
      lineStyle: {
        color: colors.officialCost,
        width: 1.5,
        type: 'dashed',
      },
    }
  )
  return {
    ...option,
    yAxis: axes,
    series,
    tooltip: {
      ...option.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line' },
      confine: true,
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [params]
        const data = entries
          .map((entry) => (entry as { data?: TimelineChartDatum }).data)
          .find(
            (entry) =>
              entry?.timelineItem &&
              entry.chartOrder != null &&
              entry.value[0] === entry.chartOrder
          )
        return data
          ? qualityTimelineTooltip(
              data.timelineItem,
              data.chartOrder,
              props.dark
            )
          : ''
      },
    },
  }
}

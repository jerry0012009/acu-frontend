import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { EChartsOption } from 'echarts'
import i18next from 'i18next'

import en from '@/i18n/locales/en.json'

import type { ACUWorkTimelineItem } from '../../api'
import type { ACUWorkTimelineDisplayItem } from '../../lib/explicit-difficulty'
import {
  buildACUQualityTimelineChartOption,
  qualityTimelineItems,
  qualityTimelineTooltip,
  timelineCostDifference,
} from '../acu-work-timeline-quality-model'

await i18next.init({ lng: 'en', resources: { en } })

function execution(
  overrides: Partial<ACUWorkTimelineDisplayItem> = {}
): ACUWorkTimelineDisplayItem {
  return {
    pointId: 'req:execution',
    pointType: 'execution',
    logicalRequestId: 'req',
    actualModel: 'model',
    sessionId: 'session',
    taskId: 'task',
    segmentId: 'segment',
    timestamp: 1791160000,
    protocol: 'responses',
    billingStatus: 'finalized',
    qualityComparison: {
      estimatedQuality: 72,
      modelChargeCny: 0.02,
      officialModelCostCny: 0.01,
      sameBudget: {
        modelId: 'budget',
        displayName: 'Budget',
        estimatedQuality: 78,
        officialCostCny: 0.02,
      },
      mostExpensive: {
        modelId: 'flagship',
        displayName: 'Flagship',
        estimatedQuality: 90,
        officialCostCny: 0.1,
      },
    },
    ...overrides,
  } as ACUWorkTimelineItem
}

function chartSeries(option: EChartsOption) {
  return option.series as Array<{
    id: string
    connectNulls?: boolean
    lineStyle?: { type: string }
    showSymbol?: boolean
    data: Array<{ value: [number, number]; timelineItem: ACUWorkTimelineItem }>
  }>
}

test('quality view uses only executions and excludes Judge charges from its cost bars', () => {
  const judge = execution({
    pointId: 'req:judge',
    pointType: 'judge',
    userChargeCny: 500,
  })
  const request = execution()
  assert.deepEqual(qualityTimelineItems([judge, request]), [request])
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items: [judge, request], dark: false })
  )
  assert.deepEqual(
    series
      .find((entry) => entry.id === 'quality-model-charge')
      ?.data.map((entry) => entry.value),
    [[1, 0.02]]
  )
  assert.deepEqual(
    series
      .find((entry) => entry.id === 'quality-official-cost')
      ?.data.map((entry) => entry.value),
    [[1, 0.01]]
  )
})

test('quality view draws three correctly scaled quality series with dashed references', () => {
  const option = buildACUQualityTimelineChartOption({
    items: [execution()],
    dark: false,
  })
  const series = chartSeries(option)
  assert.deepEqual(
    series.slice(0, 3).map((entry) => entry.data[0].value[1]),
    [72, 78, 90]
  )
  assert.deepEqual(
    series.slice(0, 3).map((entry) => entry.lineStyle?.type),
    ['solid', 'dashed', 'dashed']
  )
  const axes = option.yAxis as Array<{ min: number; max: number }>
  assert.equal(axes[0].min, 0)
  assert.equal(axes[0].max, 100)
})

test('quality view overlays inferred execution points and keeps reference lines', () => {
  const inferred = execution({
    qualityComparison: {
      estimatedQuality: 68,
      modelChargeCny: 0.02,
      officialModelCostCny: 0.01,
      sameBudget: {
        modelId: 'budget',
        displayName: 'Budget',
        estimatedQuality: 70,
        officialCostCny: 0.02,
      },
      mostExpensive: {
        modelId: 'flagship',
        displayName: 'Flagship',
        estimatedQuality: 90,
        officialCostCny: 0.1,
      },
    },
    displayQualityInferred: true,
    displayQuality: 68,
    displayQualityComparison: {
      estimatedQuality: 68,
      modelChargeCny: 0.02,
      officialModelCostCny: 0.01,
      sameBudget: {
        modelId: 'budget',
        displayName: 'Budget',
        estimatedQuality: 70,
        officialCostCny: 0.02,
      },
      mostExpensive: {
        modelId: 'flagship',
        displayName: 'Flagship',
        estimatedQuality: 90,
        officialCostCny: 0.1,
      },
    },
  })
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items: [inferred], dark: false })
  )
  assert.equal(
    series.find((entry) => entry.id === 'quality-inferred-points')?.data[0]
      ?.value[1],
    68
  )
  assert.equal(
    series.find((entry) => entry.id === 'quality-same-budget-reference')
      ?.data[0]?.value[1],
    70
  )
})

test('missing quality remains a gap while a recorded zero remains a real point', () => {
  const missing = execution({ qualityComparison: undefined })
  const zero = execution({
    pointId: 'zero:execution',
    qualityComparison: { estimatedQuality: 0 },
  })
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items: [missing, zero], dark: true })
  )
  assert.ok(Number.isNaN(series[0].data[0].value[1]))
  assert.equal(series[0].data[1].value[1], 0)
  assert.equal(series[0].connectNulls, false)
})

test('quality lines do not bridge different sessions or protocols', () => {
  const a = execution()
  const b = execution({ pointId: 'b:execution', sessionId: 'other' })
  const c = execution({ pointId: 'c:execution', protocol: 'messages' })
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items: [a, b, c], dark: false })
  )
  const executed = series.filter((entry) =>
    entry.id.startsWith('quality-executed-')
  )
  assert.equal(executed.length, 3)
  assert.equal(
    executed.every(
      (entry) =>
        entry.data.filter((point) => Number.isFinite(point.value[1])).length ===
        1
    ),
    true
  )
})

test('a sparse reference stays visible when the timeline exceeds eighty requests', () => {
  const reference = execution().qualityComparison?.sameBudget
  const items = Array.from({ length: 81 }, (_, index) =>
    execution({
      pointId: `request-${index}:execution`,
      qualityComparison: {
        estimatedQuality: 70,
        sameBudget: index === 0 ? reference : undefined,
      },
    })
  )
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items, dark: false })
  )
  const budget = series.find((entry) =>
    entry.id.startsWith('quality-same-budget-')
  )
  assert.equal(budget?.showSymbol, false)
  assert.equal(
    budget?.data.filter((point) => Number.isFinite(point.value[1])).length,
    1
  )
})

test('an interleaved session creates a gap without connecting through another session', () => {
  const items = [execution(), execution({ sessionId: 'other' }), execution()]
  const series = chartSeries(
    buildACUQualityTimelineChartOption({ items, dark: false })
  )
  const main = series.find(
    (entry) => entry.id === 'quality-executed-self:session:responses'
  )
  assert.deepEqual(
    main?.data.map((point) => point.value[0]),
    [1, 2.5, 3]
  )
  assert.ok(Number.isNaN(main?.data[1].value[1]))
  assert.equal(main?.connectNulls, false)
})

test('quality tooltip shows reference models, quality gaps, costs and escapes model names', () => {
  const html = qualityTimelineTooltip(
    execution({ actualModel: '<script>model</script>' }),
    7
  )
  assert.match(html, /#7/)
  assert.match(html, /72\.0/)
  assert.match(html, /78\.0 \(\+6\.0\)/)
  assert.match(html, /90\.0 \(\+18\.0\)/)
  assert.match(html, /Budget/)
  assert.match(html, /Flagship/)
  assert.match(html, /100\.0%/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test('cost comparison preserves savings, extra cost and zero-price boundary', () => {
  assert.match(timelineCostDifference(execution()), /Above official direct/)
  assert.match(
    timelineCostDifference(
      execution({
        qualityComparison: {
          modelChargeCny: 0.005,
          officialModelCostCny: 0.01,
        },
      })
    ),
    /Below official direct/
  )
  assert.equal(
    timelineCostDifference(
      execution({
        qualityComparison: { modelChargeCny: 0.01, officialModelCostCny: 0.01 },
      })
    ),
    'Same as official direct'
  )
  assert.equal(
    timelineCostDifference(
      execution({
        qualityComparison: { modelChargeCny: 0.01, officialModelCostCny: 0 },
      })
    ),
    '\u2014'
  )
})

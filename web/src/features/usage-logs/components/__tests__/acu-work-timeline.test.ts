import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import type { ACUWorkTimelineItem } from '../../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  ACU_TIMELINE_SLIDER_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  filterTimelineItems,
  formatTimelineTimestamp,
  judgeLabel,
  isCompletedStatus,
  summarizeTimelineItems,
  timelineCashCost,
  timelineItemFromChartEvent,
  timelineOrderRangeFromZoom,
  timelineUserCharge,
  thinkingEffort,
} from '../acu-work-timeline-model.ts'

function item(overrides: Partial<ACUWorkTimelineItem>): ACUWorkTimelineItem {
  return {
    timestamp: Date.parse('2026-07-30T10:00:00Z') / 1000,
    sequence: 1,
    logicalRequestId: 'logical-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    segmentId: 'segment-1',
    judgeCalled: true,
    judgeReused: false,
    judgeModel: 'mimo-v2.5-pro',
    judgeBackupUsed: false,
    difficulty: 50,
    difficultyRecorded: true,
    requestedModel: 'acu-auto',
    actualModel: 'gpt-5.6-luna',
    provider: 'lucen',
    channel: 'cx014',
    status: 'completed',
    firstModelEventLatencyMs: 1000,
    endToEndLatencyMs: 3000,
    latencySource: 'reported',
    judgeLatencyMs: 500,
    providerLatencyMs: 2500,
    userChargeCny: 0.01,
    actualCashCostCny: 0.01,
    actualCostCny: 0.01,
    judgeCostCny: 0.001,
    providerCostCny: 0.009,
    failedAttemptCostCny: 0,
    errorClass: '',
    cooldownUntil: undefined,
    workPhase: 'implementation',
    workPhaseQualityTargetOffset: 0,
    judgeTrigger: 'new_task',
    judgeStatus: 'live',
    judgeResultSource: 'upstream_live',
    judgeFirstAttemptSucceeded: true,
    judgeFirstAttemptRecorded: true,
    judgeFallbackRecorded: true,
    judgeProfileAttemptCount: 1,
    judgeSameModelFailoverUsed: false,
    selectedCandidateId: 'gpt-5.6-luna',
    selectedDisplayName: 'GPT-5.6 Luna',
    resolvedReasoningEffort: 'high',
    reasoningMappingStatus: 'exact',
    inputTokens: 1000,
    cachedInputTokens: 250,
    outputTokens: 100,
    reasoningTokens: 50,
    cacheHitRatio: 0.25,
    profileAttemptCount: 1,
    topCandidates: [],
    providerAttempts: [],
    ...overrides,
  }
}

test('missing difficulty stays absent instead of producing a y=0 point', () => {
  const missing = item({ difficulty: 0, difficultyRecorded: false })
  const option = buildACUWorkTimelineChartOption({
    items: [missing],
    dark: false,
  })
  const series = option.series as Array<{
    id?: string
    connectNulls?: boolean
    data?: Array<{ value: [number, number] }>
  }>
  const difficulty = series.find((entry) => entry.id === 'difficulty-segment-1')
  assert.equal(difficulty?.connectNulls, false)
  assert.ok(Number.isNaN(difficulty?.data?.[0]?.value[1]))
})

test('a failed live Judge that reused a recent evaluation is not labeled new', () => {
  assert.equal(
    judgeLabel(
      item({ judgeCalled: true, judgeResultSource: 'recent_evaluation' })
    ),
    'Judge failed · reused previous'
  )
})

test('uses ECharts financial-style zoom across both chart grids', () => {
  const option = buildACUWorkTimelineChartOption({
    items: [item({})],
    dark: false,
  })
  assert.equal(Array.isArray(option.grid) ? option.grid.length : 0, 2)
  const axes = option.xAxis as Array<{ min?: number; max?: number }>
  assert.equal(axes.length, 2)
  assert.equal(
    axes.every((axis) => axis.min === 1),
    true
  )
  assert.equal(
    axes.every((axis) => axis.max === 1.01),
    true
  )

  const zooms = option.dataZoom as Array<{
    id?: string
    type?: string
    xAxisIndex?: number[]
    minValueSpan?: number
    zoomOnMouseWheel?: boolean
    moveOnMouseMove?: boolean
    brushSelect?: boolean
  }>
  assert.deepEqual(
    zooms.map((zoom) => zoom.id),
    [ACU_TIMELINE_INSIDE_ZOOM_ID, ACU_TIMELINE_SLIDER_ZOOM_ID]
  )
  assert.deepEqual(zooms[0].xAxisIndex, [0, 1])
  assert.deepEqual(zooms[1].xAxisIndex, [0, 1])
  assert.equal(zooms[0].minValueSpan, undefined)
  assert.equal(zooms[0].zoomOnMouseWheel, false)
  assert.equal(zooms[0].moveOnMouseMove, false)
  assert.equal(zooms[1].brushSelect, true)
})

test('uses one-based request order for points and bars regardless of timestamps or task sequences', () => {
  const items = [
    item({
      timestamp: Date.parse('2026-07-30T10:00:00Z') / 1000,
      sequence: 1,
      taskId: 'task-1',
      logicalRequestId: 'logical-1',
    }),
    item({
      timestamp: Date.parse('2026-07-30T12:00:00Z') / 1000,
      sequence: 1,
      taskId: 'task-2',
      logicalRequestId: 'logical-2',
    }),
    item({
      timestamp: Date.parse('2026-07-30T16:00:00Z') / 1000,
      sequence: 2,
      taskId: 'task-2',
      logicalRequestId: 'logical-3',
    }),
  ]
  const option = buildACUWorkTimelineChartOption({ items, dark: false })
  const series = option.series as Array<{
    id?: string
    data?: Array<{ value: [number, number]; chartOrder?: number }>
  }>
  const difficulty = series.find((entry) => entry.id === 'difficulty-segment-1')
  const cost = series.find((entry) => entry.id === 'cost-series')
  const rings = series.find((entry) => entry.id === 'judge-backup-rings')
  assert.deepEqual(
    difficulty?.data?.map((datum) => datum.value[0]),
    [1, 2, 3]
  )
  assert.deepEqual(
    cost?.data?.map((datum) => datum.value[0]),
    [1, 2, 3]
  )
  assert.deepEqual(
    rings?.data?.map((datum) => datum.value[0]),
    []
  )
  assert.deepEqual(
    difficulty?.data?.map((datum) => datum.chartOrder),
    [1, 2, 3]
  )
  assert.equal(
    timelineItemFromChartEvent({ data: cost?.data?.[1] })?.logicalRequestId,
    'logical-2'
  )
})

test('uses the same chart order for Judge backup rings', () => {
  const items = [
    item({ judgeBackupUsed: true, sequence: 1 }),
    item({
      logicalRequestId: 'logical-2',
      timestamp: Date.parse('2026-07-30T11:00:00Z') / 1000,
      judgeBackupUsed: true,
      sequence: 1,
    }),
  ]
  const option = buildACUWorkTimelineChartOption({ items, dark: false })
  const rings = (
    option.series as Array<{
      id?: string
      data?: Array<{ value: [number, number]; chartOrder?: number }>
    }>
  ).find((entry) => entry.id === 'judge-backup-rings')
  assert.deepEqual(
    rings?.data?.map((datum) => datum.value[0]),
    [1, 2]
  )
  assert.deepEqual(
    rings?.data?.map((datum) => datum.chartOrder),
    [1, 2]
  )
})

test('tooltip exposes request order, task step, exact time, and thinking effort', () => {
  const timelineItem = item({
    timestamp: Date.parse('2026-08-04T04:18:37Z') / 1000,
    sequence: 8,
    resolvedReasoningEffort: 'medium',
  })
  const option = buildACUWorkTimelineChartOption({
    items: [timelineItem],
    dark: false,
  })
  const formatter = (
    option.tooltip as { formatter?: (params: unknown) => string }
  ).formatter
  const html = formatter?.({
    data: {
      value: [1, 50],
      timelineItem,
      chartOrder: 1,
    },
  })
  assert.ok(html?.includes('#1'))
  assert.ok(html?.includes('8'))
  assert.ok(html?.includes(formatTimelineTimestamp(timelineItem.timestamp)))
  assert.ok(html?.includes('medium'))
})

test('thinking effort falls back from resolved to preset, client, and default', () => {
  assert.equal(
    thinkingEffort(item({ resolvedReasoningEffort: 'high' })),
    'high'
  )
  assert.equal(
    thinkingEffort(
      item({
        resolvedReasoningEffort: undefined,
        presetReasoningEffort: 'medium',
      })
    ),
    'medium'
  )
  assert.equal(
    thinkingEffort(
      item({
        resolvedReasoningEffort: undefined,
        presetReasoningEffort: undefined,
        clientRequestedReasoningEffort: 'low',
      })
    ),
    'low'
  )
  assert.equal(
    thinkingEffort(
      item({
        resolvedReasoningEffort: undefined,
        presetReasoningEffort: undefined,
        clientRequestedReasoningEffort: undefined,
      })
    ),
    'default'
  )
})

test('keeps backup rings silent and points and bars traceable', () => {
  const timelineItem = item({ judgeBackupUsed: true })
  const option = buildACUWorkTimelineChartOption({
    items: [timelineItem],
    dark: true,
  })
  const series = option.series as Array<{
    id?: string
    type?: string
    silent?: boolean
    data?: unknown[]
  }>
  assert.equal(
    series.find((entry) => entry.id === 'judge-backup-rings')?.silent,
    true
  )
  assert.equal(
    series.some((entry) => entry.type === 'line'),
    true
  )
  assert.equal(
    series.some((entry) => entry.type === 'bar'),
    true
  )
  assert.equal(
    timelineItemFromChartEvent({
      data: { value: [0, 0], timelineItem },
    })?.logicalRequestId,
    'logical-1'
  )
  assert.equal(
    timelineItemFromChartEvent({ data: { value: [0, 0] } }),
    undefined
  )
})

test('derives visible request order range from native ECharts zoom events', () => {
  assert.deepEqual(timelineOrderRangeFromZoom({ start: 25, end: 75 }, 10), {
    start: 3,
    end: 8,
  })
  assert.deepEqual(
    timelineOrderRangeFromZoom(
      { batch: [{ startValue: 1.2, endValue: 3.1 }] },
      4
    ),
    { start: 1, end: 4 }
  )
})

test('full request-order zoom restores the complete one-based range', () => {
  assert.deepEqual(timelineOrderRangeFromZoom({ start: 0, end: 100 }, 90), {
    start: 1,
    end: 90,
  })
})

test('visible summary is derived only from items inside the engine viewport', () => {
  const summary = summarizeTimelineItems([
    item({ firstModelEventLatencyMs: 1000 }),
    item({
      logicalRequestId: 'logical-2',
      judgeCalled: false,
      judgeReused: true,
      status: 'completed_with_recovery',
      firstModelEventLatencyMs: 3000,
      userChargeCny: 0.02,
      actualCashCostCny: 0.02,
      actualCostCny: 0.02,
    }),
  ])
  assert.deepEqual(summary, {
    apiSteps: 2,
    judgeCalledRequests: 1,
    judgeFirstAttemptSuccessSamples: 1,
    judgeFirstAttemptSuccessRate: 1,
    judgeRulesFallbackSamples: 1,
    judgeRulesFallbackRate: 0,
    completionRate: 1,
    cacheHitRate: 0.25,
    userChargeSamples: 2,
    actualCashCostSamples: 2,
    totalUserChargeCny: 0.03,
    totalActualCashCostCny: 0.03,
    actualTotalCostCny: 0.03,
    p50FirstModelEventLatencyMs: 1000,
    p95FirstModelEventLatencyMs: 3000,
  })
})

test('summary excludes legacy Judge records without explicit metric samples', () => {
  const summary = summarizeTimelineItems([
    item({
      judgeFirstAttemptSucceeded: false,
      judgeFirstAttemptRecorded: false,
      judgeFallbackRecorded: false,
    }),
  ])
  assert.equal(summary.judgeCalledRequests, 1)
  assert.equal(summary.judgeFirstAttemptSuccessSamples, 0)
  assert.equal(summary.judgeRulesFallbackSamples, 0)
  assert.equal(summary.judgeFirstAttemptSuccessRate, 0)
  assert.equal(summary.judgeRulesFallbackRate, 0)
})

test('separates user charge from actual cash cost without inventing missing values', () => {
  const current = item({
    actualCostCny: 0.12,
    userChargeCny: 0.12,
    actualCashCostCny: 0.08,
  })
  assert.equal(timelineUserCharge(current), 0.12)
  assert.equal(timelineCashCost(current), 0.08)
  const legacy = item({
    userChargeCny: undefined,
    actualCashCostCny: undefined,
    actualCostCny: 0.04,
  })
  assert.equal(timelineUserCharge(legacy), undefined)
  assert.equal(timelineCashCost(legacy), undefined)
})

test('filters route steps across task request model and channel and keeps recovered issues', () => {
  const recovered = item({
    logicalRequestId: 'request-recovered',
    taskId: 'task-inspection',
    actualModel: 'gpt-5.6-sol',
    channel: 'lucen-cx008',
    status: 'completed_with_recovery',
  })
  const healthy = item({
    logicalRequestId: 'request-healthy',
    taskId: 'task-general',
    actualModel: 'gpt-5.6-luna',
    channel: 'lucen-cx014',
  })
  assert.deepEqual(
    filterTimelineItems([recovered, healthy], 'inspection', 'all'),
    [recovered]
  )
  assert.deepEqual(filterTimelineItems([recovered, healthy], 'cx008', 'all'), [
    recovered,
  ])
  assert.deepEqual(filterTimelineItems([recovered, healthy], '', 'errors'), [
    recovered,
  ])
  assert.equal(isCompletedStatus('success'), true)
  assert.equal(isCompletedStatus('completed_with_recovery'), true)
  assert.equal(isCompletedStatus('failed'), false)
})

test('session trace inspector does not lock timeline wheel interaction', () => {
  const source = readFileSync(
    new URL('../acu-work-timeline.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /<Dialog\s+modal=\{false\}/)
  assert.match(source, /<DialogContent\s+showBackdrop=\{false\}/)
})

test('timeline renders the DTO Work Phase rather than the segment phase', () => {
  const source = readFileSync(
    new URL('../acu-work-timeline.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /item\.workPhase \|\| t\('general'\)/)
  assert.match(source, /item\.workPhaseQualityTargetOffset/)
})

test('timeline defaults the trend open and only offers supported time ranges', () => {
  const source = readFileSync(
    new URL('../acu-work-timeline.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /useState\(true\)/)
  assert.match(source, /\[1, 6, 24\]\.map/)
  assert.doesNotMatch(source, /\b168\b/)
  assert.match(source, /aria-expanded=\{trendOpen\}/)
  assert.match(source, /role='columnheader'/)
  assert.match(source, /lg:hidden/)
  assert.match(source, /Issues only/)
})

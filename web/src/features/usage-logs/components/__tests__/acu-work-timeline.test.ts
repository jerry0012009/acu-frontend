import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'

import type { ACUWorkTimelineItem } from '../../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  ACU_TIMELINE_SLIDER_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  filterTimelineItems,
  filterTimelineBySupply,
  formatTimelineTimestamp,
  judgeLabel,
  isCompletedStatus,
  isTimelineError,
  summarizeTimelineItems,
  timelineItemFromChartEvent,
  timelineOrderRangeFromZoom,
  timelineItemProtocol,
  rollingTimelineRange,
  timelinePhaseAdjustment,
  timelineUserCharge,
  timelineWorkPhase,
  thinkingEffort,
} from '../acu-work-timeline-model.ts'

test('rolling timeline range advances on each calculation while custom bounds stay fixed', () => {
  assert.deepEqual(rollingTimelineRange(1, 10_000_000), {
    from: 6400,
    to: 10000,
  })
  assert.deepEqual(rollingTimelineRange(1, 10_060_000), {
    from: 6460,
    to: 10060,
  })
  const custom = { from: 1000, to: 2000 }
  assert.deepEqual(custom, { from: 1000, to: 2000 })
})

function item(overrides: Partial<ACUWorkTimelineItem>): ACUWorkTimelineItem {
  return {
    pointId: 'logical-1:execution',
    pointType: 'execution',
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
    protocol: 'messages',
    status: 'completed',
    billingStatus: 'finalized',
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
    failedJudgeAttemptCostCny: 0,
    providerUserChargeCny: 0.009,
    judgeUserChargeCny: 0.001,
    judgeProfileSelection: { candidateCount: 1 },
    judgeAttempts: [],
    errorClass: '',
    cooldownUntil: undefined,
    workPhase: 'implementation',
    workPhaseQualityTargetOffset: 0,
    routingQualityTarget: 72,
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

test('difficulty points use an interactive scatter layer for Judge and Execution', () => {
  const option = buildACUWorkTimelineChartOption({
    items: [
      item({ pointId: 'logical-judge:judge', pointType: 'judge' }),
      item({
        pointId: 'logical-execution:execution',
        logicalRequestId: 'logical-execution',
      }),
    ],
    dark: false,
  })
  const series = option.series as Array<{
    id?: string
    type?: string
    showSymbol?: boolean
    silent?: boolean
    z?: number
    data?: Array<{ chartOrder?: number; timelineItem?: ACUWorkTimelineItem }>
  }>
  const line = series.find((entry) => entry.id === 'difficulty-segment-1')
  const points = series.find((entry) => entry.id === 'difficulty-points')
  const rings = series.find((entry) => entry.id === 'judge-backup-rings')
  assert.equal(line?.showSymbol, false)
  assert.equal(line?.silent, true)
  assert.equal(points?.type, 'scatter')
  assert.equal(points?.silent, false)
  assert.equal(points?.z, 3)
  assert.deepEqual(
    points?.data?.map((datum) => datum.timelineItem?.pointType),
    ['judge', 'execution']
  )
  const executionDatum = points?.data?.[1]
  assert.equal(executionDatum?.chartOrder, 2)
  assert.equal(
    timelineItemFromChartEvent({ data: executionDatum })?.pointId,
    'logical-execution:execution'
  )
  assert.equal(rings?.silent, true)
  assert.equal((rings?.z ?? 0) < (points?.z ?? 0), true)
})

test('a failed live Judge that reused a recent evaluation is not labeled new', () => {
  assert.equal(
    judgeLabel(
      item({ judgeCalled: true, judgeResultSource: 'recent_evaluation' })
    ),
    'Judge failed · reused previous'
  )
})

test('issues-only includes requests whose billing is unsettled', () => {
  const unsettled = item({ billingStatus: 'unsettled' })
  assert.equal(isTimelineError(unsettled), true)
  assert.deepEqual(filterTimelineItems([unsettled], '', 'errors'), [unsettled])
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
    item({
      pointId: 'logical-1:judge',
      pointType: 'judge',
      judgeAttempts: [
        {
          attemptIndex: 1,
          attemptRole: 'backup',
          model: 'gpt-5.6-sol',
          provider: 'lucen',
          status: 'success',
          inputTokens: 1,
          cachedInputTokens: 0,
          outputTokens: 1,
          latencyMs: 1,
          effectiveCostCny: 0,
          costStatus: 'verified',
          usageStatus: 'reported',
        },
      ],
      sequence: 1,
    }),
    item({
      pointId: 'logical-2:judge',
      pointType: 'judge',
      logicalRequestId: 'logical-2',
      timestamp: Date.parse('2026-07-30T11:00:00Z') / 1000,
      judgeAttempts: [
        {
          attemptIndex: 1,
          attemptRole: 'backup',
          model: 'gpt-5.6-sol',
          provider: 'lucen',
          status: 'success',
          inputTokens: 1,
          cachedInputTokens: 0,
          outputTokens: 1,
          latencyMs: 1,
          effectiveCostCny: 0,
          costStatus: 'verified',
          usageStatus: 'reported',
        },
      ],
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
  assert.ok(html?.includes('Implementation'))
  assert.ok(html?.includes('0'))
  assert.ok(html?.includes('72.0'))
  assert.ok(html?.includes(publicChannelAlias('lucen', 'cx014')))
  assert.doesNotMatch(html ?? '', /lucen|cx014/)
})

test('execution tooltip tolerates null judge attempts from the API', () => {
  const timelineItem = item({ judgeAttempts: null as never })
  const option = buildACUWorkTimelineChartOption({
    items: [timelineItem],
    dark: false,
  })
  const formatter = (
    option.tooltip as { formatter?: (params: unknown) => string }
  ).formatter
  assert.doesNotThrow(() =>
    formatter?.({
      data: { value: [1, 50], timelineItem, chartOrder: 1 },
    })
  )
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
    executionSteps: 2,
    judgeEvaluations: 1,
    judgeCalledRequests: 1,
    judgeFirstAttemptSuccessSamples: 1,
    judgeFirstAttemptSuccessRate: 1,
    judgeRulesFallbackSamples: 1,
    judgeRulesFallbackRate: 0,
    completionRate: 1,
    cacheHitRate: 0.25,
    userChargeSamples: 2,
    totalUserChargeCny: 0.03,
    unsettledRequests: 0,
    actualTotalCostCny: 0.03,
    p50FirstModelEventLatencyMs: 1000,
    p95FirstModelEventLatencyMs: 3000,
  })
})

test('compatibility user-cost total excludes unsettled estimated charges', () => {
  const summary = summarizeTimelineItems([
    item({
      userChargeCny: 0.01,
      actualCashCostCny: 0.008,
      actualCostCny: 0.01,
      billingStatus: 'finalized',
    }),
    item({
      logicalRequestId: 'logical-unsettled',
      userChargeCny: 0.02,
      actualCashCostCny: 0.015,
      actualCostCny: 0.02,
      billingStatus: 'unsettled',
    }),
    item({
      logicalRequestId: 'logical-legacy',
      userChargeCny: undefined,
      actualCashCostCny: 0.003,
      actualCostCny: 0.003,
      billingStatus: 'finalized',
    }),
  ])
  assert.ok(Math.abs(summary.actualTotalCostCny - 0.01) < 1e-12)
  assert.ok(Math.abs(summary.totalUserChargeCny - 0.01) < 1e-12)
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
  const legacy = item({
    userChargeCny: undefined,
    actualCashCostCny: undefined,
    actualCostCny: 0.04,
  })
  assert.equal(timelineUserCharge(legacy), undefined)
})

test('formats Work Phase and adjustment without changing Difficulty', () => {
  assert.equal(
    timelineWorkPhase(item({ workPhase: 'inspection' })),
    'Inspection'
  )
  assert.equal(timelinePhaseAdjustment(-8), '-8')
  assert.equal(timelineWorkPhase(item({ workPhase: 'planning' })), 'Planning')
  assert.equal(timelinePhaseAdjustment(8), '+8')
  assert.equal(
    timelineWorkPhase(item({ workPhase: 'implementation' })),
    'Implementation'
  )
  assert.equal(timelinePhaseAdjustment(3), '+3')
  assert.equal(timelinePhaseAdjustment(0), '0')
  assert.equal(
    timelineWorkPhase(item({ workPhase: 'verification' })),
    'Verification'
  )
  assert.equal(timelineWorkPhase(item({ workPhase: 'general' })), 'General')
  const originalDifficulty = item({
    difficulty: 43,
    workPhase: 'inspection',
    workPhaseQualityTargetOffset: -8,
  })
  assert.equal(originalDifficulty.difficulty, 43)
})

test('filters route steps across task request model and channel and keeps recovered issues', () => {
  const recovered = item({
    logicalRequestId: 'request-recovered',
    taskId: 'task-inspection',
    workPhase: 'inspection',
    workPhaseQualityTargetOffset: -8,
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

test('searches Work Phase and keeps legacy missing phase records safe', () => {
  const inspection = item({
    workPhase: 'inspection',
    workPhaseQualityTargetOffset: -8,
  })
  const planning = item({
    pointId: 'logical-planning:execution',
    logicalRequestId: 'logical-planning',
    workPhase: 'planning',
    workPhaseQualityTargetOffset: 8,
  })
  const legacy = item({
    pointId: 'logical-legacy:execution',
    logicalRequestId: 'logical-legacy',
    workPhase: undefined as unknown as string,
    workPhaseQualityTargetOffset: undefined as unknown as number,
  })
  assert.deepEqual(
    filterTimelineItems([inspection, planning, legacy], 'inspection', 'all'),
    [inspection]
  )
  assert.equal(timelineWorkPhase(legacy), 'General')
  assert.equal(timelinePhaseAdjustment(undefined), '0')
})

test('filters Timeline by native protocol, channel, event type, and result', () => {
  const execution = item({
    provider: 'closeai',
    channel: 'closeai-anthropic-primary',
    protocol: 'messages',
    providerAttempts: [
      {
        attemptIndex: 1,
        provider: 'closeai',
        channel: 'closeai-anthropic-primary',
        executionProfileId: 'closeai:luna:messages',
        status: 'success',
        latencyMs: 100,
      },
    ],
  })
  const judge = item({
    pointId: 'logical-1:judge',
    pointType: 'judge',
    judgeProtocol: 'responses',
  })
  assert.equal(timelineItemProtocol(execution), 'messages')
  assert.equal(timelineItemProtocol(judge), 'responses')
  assert.deepEqual(
    filterTimelineBySupply(
      [judge, execution],
      'messages',
      'closeai-anthropic-primary',
      'execution',
      'success'
    ),
    [execution]
  )
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
  assert.match(source, /timelineWorkPhase\(item\)/)
  assert.match(source, /item\.workPhaseQualityTargetOffset/)
  assert.match(source, /timelinePhaseAdjustment/)
  assert.doesNotMatch(source, /timelineCashCost/)
  assert.doesNotMatch(source, /estimatedCallCost/)
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

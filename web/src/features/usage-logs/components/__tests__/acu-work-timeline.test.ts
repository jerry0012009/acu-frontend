import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import type { ACUWorkTimelineItem } from '../../api'
import {
  ACU_TIMELINE_INSIDE_ZOOM_ID,
  ACU_TIMELINE_SLIDER_ZOOM_ID,
  buildACUWorkTimelineChartOption,
  summarizeTimelineItems,
  timelineItemFromChartEvent,
  timelineRangeFromZoom,
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
    requestedModel: 'acu-auto',
    actualModel: 'gpt-5.6-luna',
    provider: 'lucen',
    channel: 'cx014',
    status: 'completed',
    firstModelEventLatencyMs: 1000,
    endToEndLatencyMs: 3000,
    judgeLatencyMs: 500,
    providerLatencyMs: 2500,
    actualCostCny: 0.01,
    judgeCostCny: 0.001,
    providerCostCny: 0.009,
    failedAttemptCostCny: 0,
    errorClass: '',
    cooldownUntil: undefined,
    ...overrides,
  }
}

test('uses ECharts financial-style zoom across both chart grids', () => {
  const from = Date.parse('2026-07-29T10:00:00Z') / 1000
  const to = from + 24 * 60 * 60
  const option = buildACUWorkTimelineChartOption({
    items: [item({})],
    hours: 24,
    from,
    to,
    dark: false,
  })
  assert.equal(Array.isArray(option.grid) ? option.grid.length : 0, 2)
  const axes = option.xAxis as Array<{ min?: number; max?: number }>
  assert.equal(axes.length, 2)
  assert.equal(
    axes.every((axis) => axis.min === from * 1000),
    true
  )
  assert.equal(
    axes.every((axis) => axis.max === to * 1000),
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
  assert.equal(zooms[0].minValueSpan, 60 * 60 * 1000)
  assert.equal(zooms[0].zoomOnMouseWheel, true)
  assert.equal(zooms[0].moveOnMouseMove, true)
  assert.equal(zooms[1].brushSelect, true)
})

test('keeps backup rings silent and points and bars traceable', () => {
  const timelineItem = item({ judgeBackupUsed: true })
  const option = buildACUWorkTimelineChartOption({
    items: [timelineItem],
    hours: 1,
    from: timelineItem.timestamp - 3600,
    to: timelineItem.timestamp,
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

test('derives visible range from native ECharts zoom events', () => {
  assert.deepEqual(timelineRangeFromZoom({ start: 25, end: 75 }, 1000, 2000), {
    start: 1250,
    end: 1750,
  })
  assert.deepEqual(
    timelineRangeFromZoom(
      { batch: [{ startValue: 1_400_000, endValue: 1_800_000 }] },
      1000,
      2000
    ),
    { start: 1400, end: 1800 }
  )
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
      actualCostCny: 0.02,
    }),
  ])
  assert.deepEqual(summary, {
    apiSteps: 2,
    judgeCalls: 1,
    judgeReuseRate: 0.5,
    completionRate: 1,
    actualTotalCostCny: 0.03,
    p50FirstModelEventLatencyMs: 1000,
    p95FirstModelEventLatencyMs: 3000,
  })
})

test('session trace inspector does not lock timeline wheel interaction', () => {
  const source = readFileSync(
    new URL('../acu-work-timeline.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /<Dialog\s+modal=\{false\}/)
  assert.match(source, /<DialogContent\s+showBackdrop=\{false\}/)
})

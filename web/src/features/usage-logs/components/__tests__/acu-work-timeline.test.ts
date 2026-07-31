import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ACUWorkTimelineItem } from '../../api'
import {
  ACU_TIMELINE_ZOOM_ID,
  buildACUWorkTimelineChartSpec,
  summarizeTimelineItems,
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

test('uses one mature VChart composition with shared native zoom and pan', () => {
  const spec = buildACUWorkTimelineChartSpec({
    items: [item({})],
    hours: 24,
    dark: false,
  })
  assert.equal(spec.type, 'common')
  assert.equal(spec.layout?.type, 'grid')
  assert.deepEqual(
    spec.layout?.elements?.filter((element) =>
      'modelId' in element
        ? ['difficulty-region', 'cost-region', ACU_TIMELINE_ZOOM_ID].includes(
            String(element.modelId)
          )
        : false
    ),
    [
      { modelId: 'difficulty-region', col: 1, row: 0 },
      { modelId: 'cost-region', col: 1, row: 2 },
      { modelId: ACU_TIMELINE_ZOOM_ID, col: 1, row: 4 },
    ]
  )
  assert.deepEqual(
    spec.region?.map((region) => region.id),
    ['difficulty-region', 'cost-region']
  )
  const timeAxes = spec.axes?.filter((axis) =>
    ['difficulty-x-axis', 'cost-x-axis'].includes(String(axis.id))
  ) as Array<{ zero?: boolean; nice?: boolean }> | undefined
  assert.equal(timeAxes?.length, 2)
  assert.equal(
    timeAxes?.every((axis) => !axis.zero && !axis.nice),
    true
  )
  const zoom = Array.isArray(spec.dataZoom) ? spec.dataZoom[0] : spec.dataZoom
  assert.equal(zoom?.id, ACU_TIMELINE_ZOOM_ID)
  assert.equal(zoom?.minValueSpan, 60 * 60)
  assert.deepEqual(zoom?.regionIndex, [0, 1])
  assert.equal(zoom?.filterMode, 'filter')
  assert.deepEqual(zoom?.roamZoom, { enable: true, focus: true, rate: 1.2 })
  assert.deepEqual(zoom?.roamDrag, { enable: true, rate: 1 })
  assert.deepEqual(zoom?.roamScroll, { enable: true, rate: 1 })
  assert.equal(zoom?.brushSelect, true)
  assert.equal(zoom?.updateDataAfterChange, undefined)
})

test('makes only task points and cost bars interactive', () => {
  const spec = buildACUWorkTimelineChartSpec({
    items: [item({ judgeBackupUsed: true })],
    hours: 1,
    dark: true,
  })
  const difficulty = spec.series?.find(
    (series) => series.id === 'difficulty-series'
  )
  const backup = spec.series?.find(
    (series) => series.id === 'judge-backup-rings'
  )
  const cost = spec.series?.find((series) => series.id === 'cost-series')
  assert.equal(
    (difficulty as { line?: { interactive?: boolean } })?.line?.interactive,
    false
  )
  assert.equal(
    (difficulty as { point?: { interactive?: boolean } })?.point?.interactive,
    true
  )
  assert.equal(
    (backup as { point?: { interactive?: boolean } })?.point?.interactive,
    false
  )
  assert.equal(
    (cost as { bar?: { interactive?: boolean } })?.bar?.interactive,
    true
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

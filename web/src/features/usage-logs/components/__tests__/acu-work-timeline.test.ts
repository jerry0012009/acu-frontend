import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ACUWorkTimelineItem } from '../../api'
import {
  boundTimelineViewport,
  buildTimelineBuckets,
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

test('builds continuous 24h buckets so the viewport can zoom to one hour', () => {
  const to = Date.parse('2026-07-30T12:00:00Z') / 1000
  const from = to - 24 * 60 * 60
  const buckets = buildTimelineBuckets(from, to, 24, [item({})])
  assert.equal(buckets.length, 97)
  const oneHour = boundTimelineViewport(buckets.length, 40, 44, 4)
  assert.deepEqual(oneHour, { start: 40, end: 44 })
})

test('bounds zoom and pan without changing the loaded range', () => {
  assert.deepEqual(boundTimelineViewport(97, 80, 100, 4), {
    start: 76,
    end: 96,
  })
  assert.deepEqual(boundTimelineViewport(97, 0, Number.MAX_SAFE_INTEGER, 4), {
    start: 0,
    end: 96,
  })
})

test('visible summary is derived only from items inside the viewport', () => {
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

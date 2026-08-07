import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ACUChannelCooldownInterval,
  ACUChannelHistoryRow,
} from '../../api'
import {
  boundMonitorWindow,
  buildMonitorChartData,
  selectMonitorCooldownIntervals,
  selectMonitorHistoryRows,
  summarizeMonitorRows,
} from '../acu-channel-history-model.ts'

function row(overrides: Partial<ACUChannelHistoryRow>): ACUChannelHistoryRow {
  return {
    bucket: '2026-07-30T10:00:00Z',
    scope_type: 'channel',
    scope_id: 'channel-a',
    execution_profile_id: null,
    canonical_model: null,
    provider: 'lucen',
    channel: 'channel-a',
    request_count: 4,
    success_count: 3,
    error_count: 1,
    rate_limited_count: 0,
    server_error_count: 1,
    watchdog_count: 1,
    recovery_count: 1,
    p50_first_model_event_ms: 1000,
    p95_first_model_event_ms: 3000,
    ...overrides,
  }
}

const rows = [
  row({ scope_id: 'channel-a', channel: 'channel-a' }),
  row({ scope_id: 'channel-b', channel: 'channel-b' }),
  row({
    scope_type: 'channel_model',
    scope_id: 'channel-a:gpt-5.6-luna',
    canonical_model: 'gpt-5.6-luna',
  }),
  row({
    scope_type: 'profile',
    scope_id: 'profile-a',
    execution_profile_id: 'profile-a',
    canonical_model: 'gpt-5.6-luna',
  }),
  row({
    scope_type: 'profile',
    scope_id: 'profile-b',
    execution_profile_id: 'profile-b',
    canonical_model: 'gpt-5.6-luna',
  }),
]

test('defaults to Channel aggregation and never joins Profile rows into that series', () => {
  const selected = selectMonitorHistoryRows(rows, {
    model: '',
    provider: '',
    channel: '',
    profile: '',
  })
  assert.deepEqual(
    selected.map((item) => item.scope_id),
    ['channel-a', 'channel-b']
  )
  const points = buildMonitorChartData(selected)
  assert.equal(points.length, 1)
  assert.equal(points[0]['p50:channel-a'], 1000)
  assert.equal(points[0]['p50:channel-b'], 1000)
  assert.equal(points[0]['p50:profile-a'], undefined)
})

test('selects Channel+Model and exact Execution Profile history independently', () => {
  const modelRows = selectMonitorHistoryRows(rows, {
    model: 'gpt-5.6-luna',
    provider: '',
    channel: '',
    profile: '',
  })
  assert.deepEqual(
    modelRows.map((item) => item.scope_id),
    ['channel-a:gpt-5.6-luna']
  )
  const profileRows = selectMonitorHistoryRows(rows, {
    model: 'gpt-5.6-luna',
    provider: '',
    channel: '',
    profile: 'profile-b',
  })
  assert.deepEqual(
    profileRows.map((item) => item.scope_id),
    ['profile-b']
  )
})

test('keeps Brush zoom, drag pan, reset, and visible summary deterministic', () => {
  assert.deepEqual(boundMonitorWindow(10, 2, 6), { start: 2, end: 6 })
  assert.deepEqual(boundMonitorWindow(10, 7, 11), { start: 5, end: 9 })
  assert.deepEqual(boundMonitorWindow(10, 0, Number.MAX_SAFE_INTEGER), {
    start: 0,
    end: 9,
  })
  assert.deepEqual(summarizeMonitorRows([rows[0]]), {
    requests: 4,
    successRate: 0.75,
    p50: 1000,
    p95: 3000,
    watchdog: 1,
    recovery: 1,
  })
})

test('fills a loaded 24h range with continuous time buckets for K-line style zoom', () => {
  const now = Date.parse('2026-07-30T12:00:00Z')
  const points = buildMonitorChartData(
    [
      row({ bucket: '2026-07-30T10:00:00.000Z' }),
      row({ bucket: '2026-07-30T11:00:00.000Z' }),
    ],
    '24h',
    now
  )
  assert.equal(points.length, 97)
  assert.equal(points[0].bucket, '2026-07-29T12:00:00.000Z')
  assert.equal(points.at(-1)?.bucket, '2026-07-30T12:00:00.000Z')
  assert.equal(
    points.find((point) => point.bucket === '2026-07-30T10:15:00.000Z')?.details
      .length,
    0
  )
  assert.equal(
    points.find((point) => point.bucket === '2026-07-30T10:00:00.000Z')
      ?.requestCount,
    4
  )
})

test('filters cooldown, manual pause, and half-open intervals with the visible object', () => {
  const intervals: ACUChannelCooldownInterval[] = [
    {
      channel: 'channel-a',
      provider: 'lucen',
      execution_profile_id: 'profile-a',
      started_at: '2026-07-30T10:00:00Z',
      ended_at: '2026-07-30T10:30:00Z',
      reason: 'manual_pause',
      error_class: 'manual_pause',
      manual_pause: true,
      half_open_probe: false,
      probe_result: null,
    },
    {
      channel: 'channel-b',
      provider: 'blackai',
      execution_profile_id: null,
      started_at: '2026-07-30T10:00:00Z',
      ended_at: '2026-07-30T10:02:00Z',
      reason: 'half_open_probe',
      error_class: 'provider_edge_timeout',
      manual_pause: false,
      half_open_probe: true,
      probe_result: 'success',
    },
  ]
  const selected = selectMonitorCooldownIntervals(intervals, {
    model: '',
    provider: 'lucen',
    channel: 'channel-a',
    profile: '',
  })
  assert.equal(selected.length, 1)
  assert.equal(selected[0].manual_pause, true)
})

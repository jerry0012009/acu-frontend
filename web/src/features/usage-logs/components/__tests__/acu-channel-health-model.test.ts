import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ACUChannelHistoryRow,
  ACUChannelMonitorProfile,
  ACUProbeHistoryRow,
} from '../../api'
import {
  classifyHistoryBucket,
  classifyProbeBucket,
  groupACUChannels,
} from '../acu-channel-health-model.ts'

function profile(
  overrides: Partial<ACUChannelMonitorProfile> = {}
): ACUChannelMonitorProfile {
  return {
    executionProfileId: 'cx006:gpt-5.6-luna:responses',
    canonicalModel: 'gpt-5.6-luna',
    protocol: ['responses'],
    provider: 'lucen',
    channel: 'cx006',
    enabled: true,
    routingEligible: true,
    channelState: 'healthy',
    channelStateRaw: 'healthy',
    profileRank: 1,
    profileUtility: 0.85,
    ...overrides,
  } as ACUChannelMonitorProfile
}

function bucket(
  overrides: Partial<ACUChannelHistoryRow> = {}
): ACUChannelHistoryRow {
  return {
    bucket: '2026-08-05T12:00:00Z',
    scope_type: 'channel',
    scope_id: 'cx006',
    execution_profile_id: null,
    canonical_model: null,
    provider: 'lucen',
    channel: 'cx006',
    request_count: 4,
    success_count: 3,
    error_count: 1,
    rate_limited_count: 0,
    server_error_count: 0,
    watchdog_count: 0,
    recovery_count: 0,
    p50_first_model_event_ms: 100,
    p95_first_model_event_ms: 200,
    ...overrides,
  }
}

test('groups Profiles by exact Router Channel without name inference', () => {
  const groups = groupACUChannels(
    [profile(), profile({ channel: 'cx008', executionProfileId: 'cx008:sol' })],
    []
  )
  assert.deepEqual(
    groups.map((group) => group.channel),
    ['cx006', 'cx008']
  )
  assert.equal(groups[0].profiles.length, 1)
})

test('computes production availability from channel request history only', () => {
  const groups = groupACUChannels(
    [profile()],
    [
      bucket(),
      bucket({
        bucket: '2026-08-05T12:15:00Z',
        request_count: 6,
        success_count: 6,
        error_count: 0,
      }),
      bucket({ scope_type: 'profile', scope_id: profile().executionProfileId }),
    ],
    '24h',
    '2026-08-05T12:15:00Z'
  )
  assert.equal(groups[0].requestCount, 10)
  assert.equal(groups[0].successCount, 9)
  assert.equal(groups[0].availability, 0.9)
})

test('keeps production and probe evidence isolated by channel', () => {
  const channelA = profile()
  const channelB = profile({
    channel: 'cx008',
    executionProfileId: 'cx008:gpt-5.6-sol:responses',
  })
  const groups = groupACUChannels(
    [channelA, channelB],
    [
      bucket({ scope_id: 'cx006', channel: 'cx006', request_count: 4 }),
      bucket({
        scope_id: 'cx008',
        channel: 'cx008',
        request_count: 7,
        success_count: 7,
        error_count: 0,
      }),
    ],
    '24h',
    '2026-08-05T12:15:00Z',
    [
      {
        execution_profile_id: channelA.executionProfileId,
        status: 'success',
        started_at: '2026-08-05T12:01:00Z',
        probeMode: 'full_pool',
      },
      {
        execution_profile_id: channelB.executionProfileId,
        status: 'failed',
        started_at: '2026-08-05T12:02:00Z',
        probeMode: 'recovery',
      },
    ] as ACUProbeHistoryRow[]
  )

  const groupA = groups.find((group) => group.channel === 'cx006')
  const groupB = groups.find((group) => group.channel === 'cx008')
  assert.ok(groupA)
  assert.ok(groupB)
  assert.equal(groupA.requestCount, 4)
  assert.equal(groupA.probeCount, 1)
  assert.equal(groupB.requestCount, 7)
  assert.equal(groupB.probeCount, 1)
})

test('classifies empty, successful, mixed, and failed production buckets', () => {
  assert.equal(
    classifyHistoryBucket(
      bucket({ request_count: 0, success_count: 0, error_count: 0 })
    ),
    'empty'
  )
  assert.equal(
    classifyHistoryBucket(bucket({ success_count: 4, error_count: 0 })),
    'success'
  )
  assert.equal(classifyHistoryBucket(bucket()), 'mixed')
  assert.equal(
    classifyHistoryBucket(bucket({ success_count: 0, error_count: 4 })),
    'failed'
  )
})

test('uses each Profile latest Probe for coverage while retaining all Probe evidence', () => {
  const probes = [
    {
      execution_profile_id: profile().executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:01:00Z',
      probeMode: 'full_pool',
    },
    {
      execution_profile_id: profile().executionProfileId,
      status: 'failed',
      started_at: '2026-08-05T12:02:00Z',
      probeMode: 'recovery',
    },
  ] as ACUProbeHistoryRow[]
  const group = groupACUChannels(
    [profile()],
    [],
    '24h',
    '2026-08-05T12:15:00Z',
    probes
  )[0]

  assert.equal(group.probeBuckets.length, 60)
  assert.equal(group.probeCount, 2)
  assert.equal(group.probeBuckets.at(-2)?.fullPoolCount, 1)
  assert.equal(group.probeBuckets.at(-2)?.recoveryCount, 1)
  const probeBucket = group.probeBuckets.at(-2)
  assert.ok(probeBucket)
  assert.equal(classifyProbeBucket(probeBucket), 'mixed')
  assert.equal(group.probedProfileCount, 0)
  assert.equal(group.recoveryProbeSuccessCount, 0)

  const reversed = probes.map((probe, index) => ({
    ...probe,
    started_at: index === 0 ? '2026-08-05T12:02:00Z' : '2026-08-05T12:01:00Z',
  }))
  const reversedGroup = groupACUChannels(
    [profile()],
    [],
    '24h',
    '2026-08-05T12:15:00Z',
    reversed
  )[0]
  assert.equal(reversedGroup.probedProfileCount, 1)
})

test('uses all 96 range buckets for 24h availability but displays only 60', () => {
  assert.deepEqual(groupACUChannels([], []), [])
  const history = Array.from({ length: 96 }, (_, index) =>
    bucket({
      bucket: new Date(Date.UTC(2026, 7, 5, 0, index * 15)).toISOString(),
      request_count: 1,
      success_count: index < 60 ? 1 : 0,
      error_count: index < 60 ? 0 : 1,
    })
  )
  const groups = groupACUChannels(
    [profile()],
    history,
    '24h',
    history.at(-1)?.bucket
  )
  assert.equal(groups[0].buckets.length, 60)
  assert.equal(groups[0].buckets[0].bucket, history[36].bucket)
  assert.equal(groups[0].requestCount, 96)
  assert.equal(groups[0].successCount, 60)
  assert.equal(groups[0].availability, 60 / 96)
})

test('selects the eligible primary Profile with the most production requests', () => {
  const luna = profile({ requestCount: 10, profileRank: 1 })
  const sol = profile({
    executionProfileId: 'cx006:gpt-5.6-sol:responses',
    canonicalModel: 'gpt-5.6-sol',
    requestCount: 100,
    profileRank: 1,
  })
  const groups = groupACUChannels([luna, sol], [])

  assert.equal(
    groups[0].primaryProfile?.executionProfileId,
    sol.executionProfileId
  )
})

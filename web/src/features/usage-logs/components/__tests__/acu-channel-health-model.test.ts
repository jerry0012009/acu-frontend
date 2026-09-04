import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ACUChannelHistoryRow,
  ACUChannelMonitorProfile,
  ACUProbeHistoryRow,
} from '../../api'
import {
  classifyHistoryBucket,
  classifyModelProbeBucket,
  classifyProbeBucket,
  formatProbeResult,
  groupACUChannels,
  groupACUModels,
  anonymousACULineId,
  buildProbeBuckets,
  probeTimelineSpec,
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
        probeMode: 'historical',
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

test('uses supply semantics for Model Probe buckets while Profile buckets stay mixed', () => {
  assert.equal(
    classifyModelProbeBucket({ successCount: 0, totalCount: 0 }),
    'empty'
  )
  assert.equal(
    classifyModelProbeBucket({ successCount: 0, totalCount: 3 }),
    'failed'
  )
  assert.equal(
    classifyModelProbeBucket({ successCount: 1, totalCount: 3 }),
    'success'
  )
  assert.equal(
    classifyModelProbeBucket({ successCount: 3, totalCount: 3 }),
    'success'
  )
  assert.equal(classifyProbeBucket({ successCount: 1, totalCount: 3 }), 'mixed')
})

test('builds cadence-aligned Probe buckets for each supported history range', () => {
  const generatedAt = new Date('2026-08-19T18:00:00Z').getTime()
  for (const [range, expected] of [
    ['24h', { bucketMs: 2 * 60 * 60_000, bucketCount: 12 }],
    ['48h', { bucketMs: 2 * 60 * 60_000, bucketCount: 24 }],
    ['7d', { bucketMs: 6 * 60 * 60_000, bucketCount: 28 }],
  ] as const) {
    const spec = probeTimelineSpec(range)
    assert.deepEqual(spec, expected)
    assert.equal(
      buildProbeBuckets([], spec.bucketMs, generatedAt, spec.bucketCount)
        .length,
      expected.bucketCount
    )
  }
})

test('groups mixed Probe results in one two-hour bucket without changing classifiers', () => {
  const probes = [
    {
      execution_profile_id: profile().executionProfileId,
      status: 'success',
      started_at: '2026-08-19T16:10:00Z',
      probeMode: 'full_pool',
    },
    {
      execution_profile_id: profile().executionProfileId,
      status: 'failed',
      started_at: '2026-08-19T17:50:00Z',
      probeMode: 'historical',
    },
  ] as ACUProbeHistoryRow[]
  const buckets = buildProbeBuckets(
    probes,
    2 * 60 * 60_000,
    new Date('2026-08-19T18:00:00Z').getTime(),
    12
  )
  const observed = buckets.find((item) => item.totalCount > 0)
  assert.ok(observed)
  assert.equal(observed.successCount, 1)
  assert.equal(observed.totalCount, 2)
  assert.equal(classifyModelProbeBucket(observed), 'success')
  assert.equal(classifyProbeBucket(observed), 'mixed')
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
      probeMode: 'historical',
      http_status: 429,
      error_class: 'rate_limited',
      metadata_json: { errorMessage: 'rate limit exceeded' },
    },
  ] as unknown as ACUProbeHistoryRow[]
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
  assert.equal(group.probeBuckets.at(-2)?.historicalCount, 1)
  const probeBucket = group.probeBuckets.at(-2)
  assert.ok(probeBucket)
  assert.equal(classifyProbeBucket(probeBucket), 'mixed')
  assert.equal(group.probedProfileCount, 0)
  assert.equal(group.profiles[0]?.latestProbe?.http_status, 429)
  assert.match(
    group.profiles[0]?.latestProbe
      ? formatProbeResult(group.profiles[0].latestProbe)
      : '',
    /failed · HTTP 429 · rate_limited · rate limit exceeded/
  )

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

test('keeps the newest Probe attempt detail on each timeline bucket', () => {
  const probes = [
    {
      execution_profile_id: profile().executionProfileId,
      status: 'failed',
      started_at: '2026-08-05T12:01:00Z',
      probeMode: 'full_pool',
      http_status: 500,
      error_class: 'server_error',
    },
    {
      execution_profile_id: profile().executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:02:00Z',
      probeMode: 'targeted',
      http_status: 200,
      actual_model: 'gpt-5.6-luna',
      usage_trusted: true,
    },
  ] as unknown as ACUProbeHistoryRow[]
  const group = groupACUChannels(
    [profile()],
    [],
    '24h',
    '2026-08-05T12:15:00Z',
    probes
  )[0]
  const latestBucket = group.probeBuckets.at(-2)
  assert.equal(latestBucket?.latestProbe?.started_at, '2026-08-05T12:02:00Z')
})

test('builds independent 60-bucket Probe timelines for each Profile', () => {
  const luna = profile()
  const sol = profile({
    executionProfileId: 'cx006:gpt-5.6-sol:responses',
    canonicalModel: 'gpt-5.6-sol',
  })
  const probes = [
    {
      execution_profile_id: luna.executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:01:00Z',
      probeMode: 'full_pool',
    },
    {
      execution_profile_id: luna.executionProfileId,
      status: 'failed',
      started_at: '2026-08-05T12:02:00Z',
      probeMode: 'historical',
      http_status: 429,
      error_class: 'rate_limited',
    },
    {
      execution_profile_id: sol.executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:02:00Z',
      probeMode: 'targeted',
      actual_model: 'gpt-5.6-sol',
      usage_trusted: true,
    },
  ] as unknown as ACUProbeHistoryRow[]
  const group = groupACUChannels(
    [luna, sol],
    [],
    '24h',
    '2026-08-05T12:15:00Z',
    probes
  )[0]
  assert.ok(group)
  const lunaProfile = group.profiles.find(
    (item) => item.executionProfileId === luna.executionProfileId
  )
  const solProfile = group.profiles.find(
    (item) => item.executionProfileId === sol.executionProfileId
  )
  assert.equal(lunaProfile?.probeBuckets?.length, 60)
  assert.equal(solProfile?.probeBuckets?.length, 60)
  const lunaBucket = lunaProfile?.probeBuckets?.at(-2)
  const solBucket = solProfile?.probeBuckets?.at(-2)
  assert.ok(lunaBucket)
  assert.ok(solBucket)
  assert.equal(lunaBucket?.fullPoolCount, 1)
  assert.equal(lunaBucket?.historicalCount, 1)
  assert.equal(lunaBucket?.targetedCount, 0)
  assert.equal(lunaBucket?.successCount, 1)
  assert.equal(lunaBucket?.totalCount, 2)
  assert.equal(classifyProbeBucket(lunaBucket), 'mixed')
  assert.equal(solBucket?.fullPoolCount, 0)
  assert.equal(solBucket?.targetedCount, 1)
  assert.equal(solBucket?.historicalCount, 0)
  assert.equal(solBucket?.successCount, 1)
  assert.equal(solBucket?.totalCount, 1)
  assert.equal(classifyProbeBucket(solBucket), 'success')
  assert.equal(lunaProfile?.probeBuckets?.at(-2)?.latestProbe?.status, 'failed')
  assert.equal(
    solProfile?.probeBuckets?.at(-2)?.latestProbe?.actual_model,
    'gpt-5.6-sol'
  )
})

test('does not repeat Probe status and omits error detail for success', () => {
  const probe = {
    status: 'success',
    http_status: 200,
    actual_model: 'gpt-5.6-luna',
    usage_trusted: true,
    metadata_json: {
      responsePreview: 'success response body',
      errorMessage: 'should not be shown',
      primaryErrorCode: 'unexpected_error',
    },
  } as unknown as ACUProbeHistoryRow
  assert.equal(
    formatProbeResult(probe),
    'success · HTTP 200 · gpt-5.6-luna · usage verified'
  )
  assert.equal(
    formatProbeResult(probe, false),
    'HTTP 200 · gpt-5.6-luna · usage verified'
  )
})

test('shows the canonical model before a distinct upstream alias', () => {
  const probe = {
    status: 'success',
    http_status: 200,
    canonical_model_id: 'claude-fable-5-1',
    actual_model: 'claude-fable-5',
    usage_trusted: true,
  } as unknown as ACUProbeHistoryRow
  assert.equal(
    formatProbeResult(probe),
    'success · HTTP 200 · claude-fable-5-1 · upstream claude-fable-5 · usage verified'
  )
})

test('falls back to Probe status, HTTP status, and error class without metadata', () => {
  assert.equal(
    formatProbeResult({
      status: 'failed',
      http_status: 429,
      error_class: 'rate_limited',
    } as ACUProbeHistoryRow),
    'failed · HTTP 429 · rate_limited'
  )
})

test('prioritizes structured Probe errors before response preview', () => {
  assert.equal(
    formatProbeResult({
      status: 'failed',
      http_status: 200,
      error_class: 'protocol_incompatible',
      metadata_json: {
        primaryErrorCode: 'protocol_incompatible',
        responsePreview:
          'event: response.created data: {"type":"response.created"}',
      },
    } as unknown as ACUProbeHistoryRow),
    'failed · HTTP 200 · protocol_incompatible · event: response.created data: {"type":"response.created"}'
  )
})

test('keeps targeted Probe evidence separate from historical probes', () => {
  const probes = [
    {
      execution_profile_id: profile().executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:01:00Z',
      probeMode: 'full_pool',
    },
    {
      execution_profile_id: profile().executionProfileId,
      status: 'success',
      started_at: '2026-08-05T12:02:00Z',
      probeMode: 'targeted',
    },
    {
      execution_profile_id: profile().executionProfileId,
      status: 'failed',
      started_at: '2026-08-05T12:03:00Z',
      probeMode: 'historical',
    },
  ] as unknown as ACUProbeHistoryRow[]
  const group = groupACUChannels(
    [profile()],
    [],
    '24h',
    '2026-08-05T12:15:00Z',
    probes
  )[0]

  assert.equal(group.probeCount, 3)
  assert.equal(group.targetedProbeCount, 1)
  assert.equal(group.targetedProbeSuccessCount, 1)
  assert.equal(group.latestTargetedProbeAt, '2026-08-05T12:02:00.000Z')
  assert.equal(group.probeBuckets.at(-2)?.targetedCount, 1)
  assert.equal(group.probeBuckets.at(-2)?.historicalCount, 1)
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

test('groups model supply by canonical model and reuses profile ranking order', () => {
  const ranked = profile({
    executionProfileId: 'cx008:gpt-5.6-luna:responses',
    channel: 'cx008',
    profileRank: 2,
  })
  const best = profile({
    executionProfileId: 'cx006:gpt-5.6-luna:responses',
    profileRank: 1,
  })
  const unranked = profile({
    executionProfileId: 'cx009:gpt-5.6-luna:responses',
    channel: 'cx009',
    profileRank: null,
  })
  const otherModel = profile({
    executionProfileId: 'cx010:gpt-5.6-sol:responses',
    canonicalModel: 'gpt-5.6-sol',
    channel: 'cx010',
  })

  const groups = groupACUModels(
    [ranked, otherModel, unranked, best],
    [],
    '24h',
    '2026-08-05T12:15:00Z'
  )

  assert.deepEqual(
    groups
      .find((group) => group.modelId === 'gpt-5.6-luna')
      ?.profiles.map((item) => item.executionProfileId),
    [
      best.executionProfileId,
      ranked.executionProfileId,
      unranked.executionProfileId,
    ]
  )
  assert.equal(
    groups.find((group) => group.modelId === 'gpt-5.6-luna')?.buckets.length,
    60
  )
  assert.equal(
    groups.find((group) => group.modelId === 'gpt-5.6-luna')?.probeBuckets
      .length,
    24
  )
  assert.equal(
    groups.find((group) => group.modelId === 'gpt-5.6-luna')?.profiles[0]
      ?.probeBuckets?.length,
    24
  )
  assert.equal(
    groups.find((group) => group.modelId === 'gpt-5.6-sol')?.profiles.length,
    1
  )
})

test('keeps model production and Probe evidence isolated and uses stable anonymous line IDs', () => {
  const luna = profile()
  const sol = profile({
    executionProfileId: 'cx008:gpt-5.6-sol:responses',
    canonicalModel: 'gpt-5.6-sol',
    channel: 'cx008',
  })
  const groups = groupACUModels(
    [luna, sol],
    [
      bucket({
        scope_type: 'profile',
        scope_id: luna.executionProfileId,
        execution_profile_id: luna.executionProfileId,
        canonical_model: 'gpt-5.6-luna',
        request_count: 3,
        success_count: 2,
      }),
      bucket({
        scope_type: 'profile',
        scope_id: sol.executionProfileId,
        execution_profile_id: sol.executionProfileId,
        canonical_model: 'gpt-5.6-sol',
        request_count: 8,
        success_count: 8,
        error_count: 0,
      }),
    ],
    '24h',
    '2026-08-05T12:15:00Z',
    [
      {
        execution_profile_id: luna.executionProfileId,
        canonical_model_id: 'gpt-5.6-luna',
        status: 'success',
        started_at: '2026-08-05T12:01:00Z',
        probeMode: 'targeted',
      },
      {
        execution_profile_id: sol.executionProfileId,
        canonical_model_id: 'gpt-5.6-sol',
        status: 'failed',
        started_at: '2026-08-05T12:02:00Z',
        probeMode: 'historical',
      },
    ] as ACUProbeHistoryRow[]
  )
  const lunaGroup = groups.find((group) => group.modelId === 'gpt-5.6-luna')
  const solGroup = groups.find((group) => group.modelId === 'gpt-5.6-sol')
  assert.equal(lunaGroup?.requestCount, 3)
  assert.equal(solGroup?.requestCount, 8)
  assert.equal(lunaGroup?.probeBuckets.length, 24)
  assert.equal(solGroup?.probeBuckets.length, 24)
  assert.notEqual(
    anonymousACULineId(luna.executionProfileId),
    anonymousACULineId(sol.executionProfileId)
  )
  assert.equal(
    anonymousACULineId(luna.executionProfileId),
    anonymousACULineId(luna.executionProfileId)
  )
})

test('uses 28 six-hour Probe buckets for the seven-day Model history view', () => {
  const model = profile()
  const groups = groupACUModels(
    [model],
    [],
    '24h',
    '2026-08-19T18:00:00Z',
    [],
    '7d'
  )

  assert.equal(groups[0]?.buckets.length, 60)
  assert.equal(groups[0]?.probeBuckets.length, 28)
  assert.equal(groups[0]?.profiles[0]?.probeBuckets?.length, 28)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { TFunction } from 'i18next'

import en from '../../../../i18n/locales/en.json' with { type: 'json' }
import zh from '../../../../i18n/locales/zh.json' with { type: 'json' }
import type { ACUChannelMonitorProfile } from '../../api.ts'
import {
  filterProfilesByProtocol,
  monitorReason,
  monitorStateLabel,
  profileLatencyDisplay,
  protocolShortLabel,
  sortMonitorChannels,
  sortMonitorModels,
  sortMonitorProfiles,
  summarizeMonitorProfiles,
} from '../acu-monitor-presentation.ts'

function profile(
  overrides: Partial<ACUChannelMonitorProfile> = {}
): ACUChannelMonitorProfile {
  return {
    executionProfileId: 'channel-a:luna:responses',
    canonicalModel: 'gpt-5.6-luna',
    protocol: ['responses'],
    provider: 'provider-a',
    channel: 'channel-a',
    routingEligible: true,
    state: 'healthy',
    requestCount: 10,
    successCount: 9,
    recentSuccessRate: 0.9,
    profileCost: 0.02,
    p50FirstModelEventLatencyMs: 1000,
    ...overrides,
  } as ACUChannelMonitorProfile
}

async function translator(language: 'en' | 'zh') {
  const locale = language === 'zh' ? zh : en
  return ((key: string) =>
    locale.translation[key as keyof typeof locale.translation] ??
    key) as TFunction
}

test('filters protocol and recomputes available Messages supply', () => {
  const profiles = [
    profile(),
    profile({
      executionProfileId: 'channel-b:luna:messages',
      protocol: ['messages'],
      channel: 'channel-b',
      requestCount: 7,
    }),
    profile({
      executionProfileId: 'channel-b:terra:messages',
      canonicalModel: 'gpt-5.6-terra',
      protocol: ['messages'],
      channel: 'channel-b',
      routingEligible: false,
      state: 'open',
      requestCount: 2,
    }),
  ]
  const messages = filterProfilesByProtocol(profiles, 'messages')
  assert.equal(messages.length, 2)
  assert.deepEqual(summarizeMonitorProfiles(messages), {
    configured: 2,
    eligible: 1,
    recovering: 1,
    channels: 1,
    models: 1,
    providers: 1,
    requests: 9,
  })
  assert.equal(filterProfilesByProtocol(profiles, 'responses').length, 1)
})

test('sorts production usage and puts unknown prices last', () => {
  const lowUsage = profile({ executionProfileId: 'low', requestCount: 1 })
  const highUsage = profile({ executionProfileId: 'high', requestCount: 30 })
  assert.deepEqual(
    sortMonitorProfiles([lowUsage, highUsage], 'usage').map(
      (item) => item.executionProfileId
    ),
    ['high', 'low']
  )

  const cheap = profile({ executionProfileId: 'cheap', profileCost: 0.001 })
  const unknown = profile({ executionProfileId: 'unknown', profileCost: null })
  assert.deepEqual(
    sortMonitorProfiles([unknown, cheap], 'cost').map(
      (item) => item.executionProfileId
    ),
    ['cheap', 'unknown']
  )
})

test('sorts Overview channel and model groups with the selected monitor order', () => {
  const lowUsage = profile({
    executionProfileId: 'low:gpt-5.6-luna:responses',
    requestCount: 2,
    profileRank: 2,
  })
  const highUsage = profile({
    executionProfileId: 'high:gpt-5.6-luna:responses',
    requestCount: 40,
    profileRank: 1,
  })
  const channels = [
    {
      channel: 'channel-low',
      providers: ['provider-a'],
      profiles: [lowUsage],
      enabledProfileCount: 1,
      eligibleProfileCount: 1,
      modelCount: 1,
      state: 'healthy',
      primaryProfile: lowUsage,
      requestCount: 2,
      successCount: 2,
      availability: 1,
      buckets: [],
      probeBuckets: [],
      probeCount: 0,
      probedProfileCount: 0,
      latestFullPoolProbeAt: null,
      latestTargetedProbeAt: null,
      targetedProbeCount: 0,
      targetedProbeSuccessCount: 0,
      latestHealthEvent: null,
    },
    {
      channel: 'channel-high',
      providers: ['provider-a'],
      profiles: [highUsage],
      enabledProfileCount: 1,
      eligibleProfileCount: 1,
      modelCount: 1,
      state: 'healthy',
      primaryProfile: highUsage,
      requestCount: 40,
      successCount: 40,
      availability: 1,
      buckets: [],
      probeBuckets: [],
      probeCount: 0,
      probedProfileCount: 0,
      latestFullPoolProbeAt: null,
      latestTargetedProbeAt: null,
      targetedProbeCount: 0,
      targetedProbeSuccessCount: 0,
      latestHealthEvent: null,
    },
  ] as never
  const models = [
    {
      modelId: 'gpt-5.6-luna-low',
      profiles: [lowUsage],
      buckets: [],
      probeBuckets: [],
      requestCount: 2,
      successCount: 2,
      availability: 1,
      eligibleCount: 1,
      totalCount: 1,
    },
    {
      modelId: 'gpt-5.6-luna-high',
      profiles: [highUsage],
      buckets: [],
      probeBuckets: [],
      requestCount: 40,
      successCount: 40,
      availability: 1,
      eligibleCount: 1,
      totalCount: 1,
    },
  ] as never

  assert.deepEqual(
    sortMonitorChannels(channels, 'usage').map((item) => item.channel),
    ['channel-high', 'channel-low']
  )
  assert.deepEqual(
    sortMonitorModels(models, 'usage').map((item) => item.modelId),
    ['gpt-5.6-luna-high', 'gpt-5.6-luna-low']
  )
})

test('localizes states and human-readable failure evidence', async () => {
  const tZh = await translator('zh')
  const tEn = await translator('en')
  assert.equal(monitorStateLabel('open', tZh), '冷却中')
  assert.equal(monitorStateLabel('open', tEn), 'Cooldown')
  assert.equal(
    monitorReason('probe_failed: actual_model_missing', tZh).title,
    '未返回实际模型'
  )
  assert.match(
    monitorReason('actual_model_missing', tZh).description,
    /自动探针重新验证/
  )
  assert.equal(tZh('Model Supply Monitor'), '模型供给监控')
  assert.equal(tEn('Model Supply Monitor'), 'Model Supply Monitor')
  assert.equal(protocolShortLabel('responses', tEn), 'Responses')
  assert.equal(protocolShortLabel('messages', tZh), 'Messages')
})

test('formats Router latency evidence without confusing Probe with Production', async () => {
  const tEn = await translator('en')
  assert.deepEqual(
    profileLatencyDisplay(
      { profileLatencyMs: 1300, metricSource: 'first_event_p50' },
      tEn
    ),
    { value: '1.3 s', source: 'Production P50' }
  )
  assert.deepEqual(
    profileLatencyDisplay(
      {
        profileLatencyMs: 7800,
        metricSource: 'full_pool_probe_latency',
      },
      tEn
    ),
    { value: '7.8 s', source: 'Probe-led latency score' }
  )
  assert.deepEqual(
    profileLatencyDisplay(
      { profileLatencyMs: null, metricSource: 'all_unknown' },
      tEn
    ),
    { value: 'No samples' }
  )
  assert.deepEqual(
    profileLatencyDisplay(
      { profileLatencyMs: 900, metricSource: 'total_latency_p50' },
      tEn
    ),
    { value: '900 ms', source: 'Production total latency P50' }
  )
})

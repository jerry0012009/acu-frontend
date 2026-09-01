import type { TFunction } from 'i18next'

import type { ACUChannelMonitorProfile } from '../api'
import type {
  ACUChannelOverview,
  ACUModelOverview,
} from './acu-channel-health-model'

export type ACUMonitorProtocol =
  | 'all'
  | 'responses'
  | 'messages'
  | 'chat_completions'
export type ACUMonitorSort =
  | 'recommended'
  | 'usage'
  | 'cost'
  | 'reliability'
  | 'speed'
  | 'recent_issue'

export function protocolLabel(protocol: string, t: TFunction): string {
  if (protocol === 'responses') return t('OpenAI Responses (Codex)')
  if (protocol === 'messages') return t('Anthropic Messages (Claude protocol)')
  if (protocol === 'chat_completions') return t('OpenAI Chat Completions')
  return protocol
}

export function protocolShortLabel(protocol: string, t: TFunction): string {
  if (protocol === 'responses') return t('Responses')
  if (protocol === 'messages') return t('Messages')
  if (protocol === 'chat_completions') return t('Chat')
  return protocol
}

export function monitorStateLabel(state: string, t: TFunction): string {
  const keys: Record<string, string> = {
    healthy: 'Healthy',
    eligible: 'Route eligible',
    degraded: 'Degraded',
    open: 'Cooldown',
    half_open: 'Recovery validation',
    cooldown: 'Cooldown',
    disabled: 'Disabled',
    unavailable: 'Unavailable',
    fresh: 'Probe result is fresh',
    stale: 'Probe result is stale',
    success: 'Verification passed',
    failed: 'Verification failed',
    not_scored: 'Not scored',
    all_unknown: 'No production samples',
    none: 'No issues',
  }
  return t(keys[state] ?? state)
}

const ERROR_KEYS: Record<string, { title: string; description: string }> = {
  actual_model_missing: {
    title: 'Actual model was not returned',
    description:
      'The upstream responded without a verifiable actual model. This Profile is paused from routing until an automatic Probe verifies it again.',
  },
  actual_model_mismatch: {
    title: 'Actual model does not match configuration',
    description:
      'The upstream actual model differs from the configured model, so this Profile cannot currently take production traffic.',
  },
  usage_untrusted: {
    title: 'Usage could not be verified',
    description:
      'Trusted token usage was not returned, so accurate billing is unavailable and this Profile is excluded from production routing.',
  },
  protocol_incompatible: {
    title: 'Protocol response is incompatible',
    description:
      'The upstream response does not satisfy the current Anthropic Messages or OpenAI Responses protocol requirements.',
  },
  profile_cooldown: {
    title: 'Execution Profile is cooling down',
    description:
      'This Profile recently failed verification. The system will Probe it again after cooldown.',
  },
  channel_half_open_probe_only: {
    title: 'Channel is undergoing recovery validation',
    description:
      'Only Probe traffic is currently allowed. Production routing resumes automatically after validation succeeds.',
  },
  profile_disabled: {
    title: 'Execution Profile is disabled',
    description:
      'This Profile is not enabled and cannot take production traffic.',
  },
  none: { title: 'No issues', description: '' },
}

export function monitorReason(
  code: string | null | undefined,
  t: TFunction
): { code: string; title: string; description: string } {
  const raw = code?.trim() || 'none'
  const normalized =
    Object.keys(ERROR_KEYS).find((key) => raw.includes(key)) || raw
  const reason = ERROR_KEYS[normalized]
  return {
    code: normalized,
    title: reason ? t(reason.title) : normalized,
    description: reason ? t(reason.description) : '',
  }
}

export function filterProfilesByProtocol(
  profiles: ACUChannelMonitorProfile[],
  protocol: ACUMonitorProtocol
): ACUChannelMonitorProfile[] {
  if (protocol === 'all') return profiles
  return profiles.filter((profile) => profile.protocol.includes(protocol))
}

export function summarizeMonitorProfiles(profiles: ACUChannelMonitorProfile[]) {
  const eligible = profiles.filter((profile) => profile.routingEligible)
  const recovering = profiles.filter((profile) =>
    [
      profile.effectiveState,
      profile.state,
      profile.profileStateRaw,
      profile.channelStateRaw,
    ].some((state) => ['open', 'half_open', 'cooldown'].includes(state))
  )
  return {
    configured: profiles.length,
    eligible: eligible.length,
    recovering: recovering.length,
    channels: new Set(eligible.map((profile) => profile.channel)).size,
    models: new Set(eligible.map((profile) => profile.canonicalModel)).size,
    providers: new Set(eligible.map((profile) => profile.provider)).size,
    requests: profiles.reduce(
      (total, profile) => total + (profile.requestCount ?? 0),
      0
    ),
  }
}

function issueTime(profile: ACUChannelMonitorProfile): number {
  if (!profile.lastError) return 0
  return Math.max(
    new Date(profile.cooldownUntil || 0).getTime() || 0,
    new Date(profile.lastProbeAt || 0).getTime() || 0
  )
}

export function sortMonitorProfiles(
  profiles: ACUChannelMonitorProfile[],
  sort: ACUMonitorSort
): ACUChannelMonitorProfile[] {
  const rows = [...profiles]
  return rows.sort((left, right) => {
    if (sort === 'usage') {
      return (
        (right.requestCount ?? 0) - (left.requestCount ?? 0) ||
        (left.profileRank ?? Number.POSITIVE_INFINITY) -
          (right.profileRank ?? Number.POSITIVE_INFINITY) ||
        left.executionProfileId.localeCompare(right.executionProfileId)
      )
    }
    if (sort === 'cost') {
      return (
        (left.profileCost ?? Number.POSITIVE_INFINITY) -
          (right.profileCost ?? Number.POSITIVE_INFINITY) ||
        (left.profileRank ?? Number.POSITIVE_INFINITY) -
          (right.profileRank ?? Number.POSITIVE_INFINITY) ||
        left.executionProfileId.localeCompare(right.executionProfileId)
      )
    }
    if (sort === 'reliability') {
      return (
        (right.recentSuccessRate ?? -1) - (left.recentSuccessRate ?? -1) ||
        (left.profileRank ?? Number.POSITIVE_INFINITY) -
          (right.profileRank ?? Number.POSITIVE_INFINITY) ||
        left.executionProfileId.localeCompare(right.executionProfileId)
      )
    }
    if (sort === 'speed') {
      return (
        profileSpeedValue(left) - profileSpeedValue(right) ||
        (left.profileRank ?? Number.POSITIVE_INFINITY) -
          (right.profileRank ?? Number.POSITIVE_INFINITY) ||
        left.executionProfileId.localeCompare(right.executionProfileId)
      )
    }
    if (sort === 'recent_issue') {
      return (
        issueTime(right) - issueTime(left) ||
        left.executionProfileId.localeCompare(right.executionProfileId)
      )
    }
    return (
      Number(right.routingEligible) - Number(left.routingEligible) ||
      Number(left.state !== 'healthy') - Number(right.state !== 'healthy') ||
      Number((right.requestCount ?? 0) > 0) -
        Number((left.requestCount ?? 0) > 0) ||
      (right.recentSuccessRate ?? -1) - (left.recentSuccessRate ?? -1) ||
      new Date(right.lastSuccessAt || 0).getTime() -
        new Date(left.lastSuccessAt || 0).getTime() ||
      left.executionProfileId.localeCompare(right.executionProfileId)
    )
  })
}

type MonitorHealthEvent = ACUChannelMonitorProfile['healthEvents'][number]

function latestHealthEventTime(
  events: Array<MonitorHealthEvent | null | undefined>
): number {
  let latest = 0
  for (const event of events) {
    if (!event) continue
    const timestamp = new Date(event.at).getTime()
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp)
  }
  return latest
}

function profileCostValue(profile: ACUChannelMonitorProfile): number {
  return profile.profileCost != null &&
    Number.isFinite(profile.profileCost) &&
    profile.profileCost >= 0
    ? profile.profileCost
    : Number.POSITIVE_INFINITY
}

function profileSpeedValue(profile: ACUChannelMonitorProfile): number {
  if (
    profile.profileLatencyMs != null &&
    Number.isFinite(profile.profileLatencyMs) &&
    profile.profileLatencyMs > 0
  ) {
    return profile.profileLatencyMs
  }
  if (profile.p50FirstModelEventLatencyMs > 0) {
    return profile.p50FirstModelEventLatencyMs
  }
  return Number.POSITIVE_INFINITY
}

function overviewCostValue(profiles: ACUChannelMonitorProfile[]): number {
  return Math.min(...profiles.map(profileCostValue), Number.POSITIVE_INFINITY)
}

function overviewSpeedValue(profiles: ACUChannelMonitorProfile[]): number {
  return Math.min(
    ...profiles
      .filter((profile) => profile.routingEligible)
      .map(profileSpeedValue),
    Number.POSITIVE_INFINITY
  )
}

function overviewRankValue(profiles: ACUChannelMonitorProfile[]): number {
  return Math.min(
    ...profiles
      .filter((profile) => profile.routingEligible)
      .map((profile) => profile.profileRank ?? Number.POSITIVE_INFINITY),
    Number.POSITIVE_INFINITY
  )
}

function compareOverview(
  left: {
    requestCount: number
    availability: number | null
    profiles: ACUChannelMonitorProfile[]
    healthEvents?: Array<MonitorHealthEvent | null | undefined>
    eligibleCount: number
  },
  right: {
    requestCount: number
    availability: number | null
    profiles: ACUChannelMonitorProfile[]
    healthEvents?: Array<MonitorHealthEvent | null | undefined>
    eligibleCount: number
  },
  sort: ACUMonitorSort
): number {
  if (sort === 'usage') {
    return right.requestCount - left.requestCount
  }
  if (sort === 'cost') {
    return overviewCostValue(left.profiles) - overviewCostValue(right.profiles)
  }
  if (sort === 'reliability') {
    return (right.availability ?? -1) - (left.availability ?? -1)
  }
  if (sort === 'speed') {
    return (
      overviewSpeedValue(left.profiles) - overviewSpeedValue(right.profiles)
    )
  }
  if (sort === 'recent_issue') {
    return (
      latestHealthEventTime(right.healthEvents ?? []) -
      latestHealthEventTime(left.healthEvents ?? [])
    )
  }
  return (
    Number(right.eligibleCount > 0) - Number(left.eligibleCount > 0) ||
    Number(right.availability != null) - Number(left.availability != null) ||
    (right.availability ?? -1) - (left.availability ?? -1) ||
    overviewRankValue(left.profiles) - overviewRankValue(right.profiles)
  )
}

export function sortMonitorChannels(
  channels: ACUChannelOverview[],
  sort: ACUMonitorSort
): ACUChannelOverview[] {
  return [...channels].sort(
    (left, right) =>
      compareOverview(
        {
          ...left,
          eligibleCount: left.eligibleProfileCount,
          healthEvents: left.latestHealthEvent ? [left.latestHealthEvent] : [],
        },
        {
          ...right,
          eligibleCount: right.eligibleProfileCount,
          healthEvents: right.latestHealthEvent
            ? [right.latestHealthEvent]
            : [],
        },
        sort
      ) || left.channel.localeCompare(right.channel)
  )
}

export function sortMonitorModels(
  models: ACUModelOverview[],
  sort: ACUMonitorSort
): ACUModelOverview[] {
  return [...models].sort(
    (left, right) =>
      compareOverview(
        {
          ...left,
          healthEvents: left.profiles.flatMap(
            (profile) => profile.healthEvents ?? []
          ),
        },
        {
          ...right,
          healthEvents: right.profiles.flatMap(
            (profile) => profile.healthEvents ?? []
          ),
        },
        sort
      ) || left.modelId.localeCompare(right.modelId)
  )
}

const LATENCY_SOURCE_KEYS: Record<string, string> = {
  first_event_p50: 'Production P50',
  total_latency_p50: 'Production total latency P50',
  health_first_token: 'Recent first response observation',
  health_total_latency: 'Recent observation',
  full_pool_probe_latency: 'Probe-led latency score',
  unknown: 'Conservative estimate',
}

export function profileLatencyDisplay(
  profile: Pick<ACUChannelMonitorProfile, 'profileLatencyMs' | 'metricSource'>,
  t: TFunction
): { value: string; source?: string } {
  if (
    profile.metricSource === 'all_unknown' ||
    profile.profileLatencyMs == null ||
    !Number.isFinite(profile.profileLatencyMs) ||
    profile.profileLatencyMs <= 0
  ) {
    return { value: t('No samples') }
  }
  const value =
    profile.profileLatencyMs < 1000
      ? `${Math.round(profile.profileLatencyMs)} ms`
      : `${(profile.profileLatencyMs / 1000).toFixed(1)} s`
  const sourceKey = profile.metricSource
    ? LATENCY_SOURCE_KEYS[profile.metricSource]
    : undefined
  return {
    value,
    ...(sourceKey ? { source: t(sourceKey) } : {}),
  }
}

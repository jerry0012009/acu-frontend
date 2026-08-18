import type { TFunction } from 'i18next'

import type { ACUChannelMonitorProfile } from '../api'

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
      return (right.requestCount ?? 0) - (left.requestCount ?? 0)
    }
    if (sort === 'cost') {
      return (
        (left.profileCost ?? Number.POSITIVE_INFINITY) -
        (right.profileCost ?? Number.POSITIVE_INFINITY)
      )
    }
    if (sort === 'reliability') {
      return (right.recentSuccessRate ?? -1) - (left.recentSuccessRate ?? -1)
    }
    if (sort === 'speed') {
      return (
        (left.p50FirstModelEventLatencyMs || Number.POSITIVE_INFINITY) -
        (right.p50FirstModelEventLatencyMs || Number.POSITIVE_INFINITY)
      )
    }
    if (sort === 'recent_issue') return issueTime(right) - issueTime(left)
    return (
      Number(right.routingEligible) - Number(left.routingEligible) ||
      Number(left.state !== 'healthy') - Number(right.state !== 'healthy') ||
      Number((right.requestCount ?? 0) > 0) -
        Number((left.requestCount ?? 0) > 0) ||
      (right.recentSuccessRate ?? -1) - (left.recentSuccessRate ?? -1) ||
      new Date(right.lastSuccessAt || 0).getTime() -
        new Date(left.lastSuccessAt || 0).getTime()
    )
  })
}

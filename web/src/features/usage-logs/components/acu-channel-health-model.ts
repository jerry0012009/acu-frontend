import type {
  ACUChannelHistoryRow,
  ACUChannelMonitorProfile,
  ACUMonitorRange,
  ACUProbeBucket,
  ACUProbeHistoryRow,
} from '../api'

export type ACUChannelState =
  | 'healthy'
  | 'degraded'
  | 'cooldown'
  | 'unavailable'
  | 'disabled'

export type ACUHistoryBucketTone = 'empty' | 'success' | 'mixed' | 'failed'

export function classifyHistoryBucket(
  row: Pick<
    ACUChannelHistoryRow,
    'request_count' | 'success_count' | 'error_count'
  >
): ACUHistoryBucketTone {
  if (row.request_count === 0) return 'empty'
  if (row.success_count === 0) return 'failed'
  if (row.error_count > 0) return 'mixed'
  return 'success'
}

export type ACUChannelOverview = {
  channel: string
  providers: string[]
  profiles: ACUChannelMonitorProfile[]
  enabledProfileCount: number
  eligibleProfileCount: number
  modelCount: number
  state: ACUChannelState
  primaryProfile: ACUChannelMonitorProfile | null
  requestCount: number
  successCount: number
  availability: number | null
  buckets: ACUChannelHistoryRow[]
  probeBuckets: ACUProbeBucket[]
  probeCount: number
  probedProfileCount: number
  latestFullPoolProbeAt: string | null
  latestTargetedProbeAt: string | null
  targetedProbeCount: number
  targetedProbeSuccessCount: number
  recoveryProbeCount: number
  recoveryProbeSuccessCount: number
  latestHealthEvent: ACUChannelMonitorProfile['healthEvents'][number] | null
}

export type ACUModelOverview = {
  modelId: string
  profiles: ACUChannelMonitorProfile[]
  buckets: ACUChannelHistoryRow[]
  probeBuckets: ACUProbeBucket[]
  requestCount: number
  successCount: number
  availability: number | null
  eligibleCount: number
  totalCount: number
}

export function classifyProbeBucket(
  row: Pick<ACUProbeBucket, 'successCount' | 'totalCount'>
): ACUHistoryBucketTone {
  if (row.totalCount === 0) return 'empty'
  if (row.successCount === 0) return 'failed'
  if (row.successCount < row.totalCount) return 'mixed'
  return 'success'
}

function probeTimestamp(probe: ACUProbeHistoryRow): number {
  const time = new Date(probe.started_at).getTime()
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

function redactProbeCredentials(value: string): string {
  return value
    .replaceAll(
      /((?:["']?(?:authorization|x-api-key)(?:\s+header)?["']?\s*[:=]\s*))([^\r\n,;&}]*)/gi,
      '$1[redacted]'
    )
    .replaceAll(
      /((?:["']?cookie(?:\s+header)?["']?\s*[:=]\s*))([^\r\n,}]*)/gi,
      '$1[redacted]'
    )
}

export function formatProbeResult(
  probe?: ACUProbeHistoryRow,
  includeStatus = true
): string {
  if (!probe) return ''
  const metadata = probe.metadata_json ?? {}
  const preview =
    typeof metadata.responsePreview === 'string'
      ? metadata.responsePreview
      : undefined
  const errorMessage =
    typeof metadata.errorMessage === 'string'
      ? metadata.errorMessage
      : undefined
  const structuredError =
    probe.status === 'success'
      ? undefined
      : [
          typeof metadata.primaryErrorCode === 'string'
            ? metadata.primaryErrorCode
            : undefined,
          typeof metadata.errorCode === 'string'
            ? metadata.errorCode
            : undefined,
          probe.error_class ?? undefined,
        ].find((value): value is string => Boolean(value?.trim()))
  const responseDetail =
    probe.status === 'success' ? undefined : preview || errorMessage
  const detail = [structuredError, responseDetail]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) =>
      redactProbeCredentials(value).replaceAll(/\s+/g, ' ').trim()
    )
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ')
  const parts = includeStatus ? [probe.status] : []
  if (probe.http_status != null) parts.push(`HTTP ${probe.http_status}`)
  if (probe.status === 'success') {
    const model = probe.actual_model || probe.canonical_model_id
    if (model) parts.push(model)
    if (
      probe.usage_trusted ||
      metadata.hasUsage === true ||
      metadata.usageSource === 'provider_usage'
    ) {
      parts.push('usage verified')
    }
  }
  if (detail) {
    const compact = detail.length > 140 ? `${detail.slice(0, 137)}...` : detail
    if (!parts.some((part) => part.toLowerCase() === compact.toLowerCase())) {
      parts.push(compact)
    }
  }
  return redactProbeCredentials(parts.join(' · '))
}

export function probeBucketTitle(bucket: ACUProbeBucket): string {
  return [
    `${new Date(bucket.bucket).toLocaleString()} · full-pool ${bucket.fullPoolCount} · targeted ${bucket.targetedCount} · recovery ${bucket.recoveryCount} · ${bucket.successCount}/${bucket.totalCount}`,
    bucket.latestProbe
      ? `Latest: ${formatProbeResult(bucket.latestProbe)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function buildProbeBuckets(
  probes: ACUProbeHistoryRow[],
  bucketMs: number,
  lastBucketTime: number
): ACUProbeBucket[] {
  const probesByTime = new Map<number, ACUProbeBucket>()
  for (const probe of probes) {
    const probeTime = new Date(probe.started_at).getTime()
    if (!Number.isFinite(probeTime)) continue
    const bucketTime = Math.floor(probeTime / bucketMs) * bucketMs
    const current = probesByTime.get(bucketTime) ?? {
      bucket: new Date(bucketTime).toISOString(),
      fullPoolCount: 0,
      targetedCount: 0,
      recoveryCount: 0,
      successCount: 0,
      totalCount: 0,
    }
    current.totalCount += 1
    current.successCount += probe.status === 'success' ? 1 : 0
    if (probe.probeMode === 'full_pool') current.fullPoolCount += 1
    else if (probe.probeMode === 'targeted') current.targetedCount += 1
    else current.recoveryCount += 1
    if (
      !current.latestProbe ||
      probeTimestamp(probe) > probeTimestamp(current.latestProbe)
    ) {
      current.latestProbe = probe
    }
    probesByTime.set(bucketTime, current)
  }
  return Array.from({ length: 60 }, (_, index) => {
    const bucketTime = lastBucketTime - (59 - index) * bucketMs
    return (
      probesByTime.get(bucketTime) ?? {
        bucket: new Date(bucketTime).toISOString(),
        fullPoolCount: 0,
        targetedCount: 0,
        recoveryCount: 0,
        successCount: 0,
        totalCount: 0,
      }
    )
  })
}

function monitorBucketSpec(range: ACUMonitorRange) {
  return {
    '1h': 60_000,
    '6h': 5 * 60_000,
    '24h': 15 * 60_000,
    '7d': 60 * 60_000,
  }[range]
}

function historyBucket(bucket: string, modelId: string): ACUChannelHistoryRow {
  return {
    bucket,
    scope_type: 'channel_model',
    scope_id: modelId,
    execution_profile_id: null,
    canonical_model: modelId,
    provider: '',
    channel: '',
    request_count: 0,
    success_count: 0,
    error_count: 0,
    rate_limited_count: 0,
    server_error_count: 0,
    watchdog_count: 0,
    recovery_count: 0,
    p50_first_model_event_ms: null,
    p95_first_model_event_ms: null,
  }
}

function sortProfilesByRank(
  profiles: ACUChannelMonitorProfile[]
): ACUChannelMonitorProfile[] {
  return [...profiles].sort(
    (left, right) =>
      (left.profileRank ?? Number.POSITIVE_INFINITY) -
        (right.profileRank ?? Number.POSITIVE_INFINITY) ||
      (right.profileUtility ?? Number.NEGATIVE_INFINITY) -
        (left.profileUtility ?? Number.NEGATIVE_INFINITY) ||
      left.executionProfileId.localeCompare(right.executionProfileId)
  )
}

export function anonymousACULineId(executionProfileId: string): string {
  let hash = 2166136261
  for (const character of executionProfileId) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return String((hash >>> 0) % 10000).padStart(4, '0')
}

export function groupACUModels(
  profiles: ACUChannelMonitorProfile[],
  history: ACUChannelHistoryRow[],
  range: ACUMonitorRange = '24h',
  generatedAt = new Date().toISOString(),
  probeHistory: ACUProbeHistoryRow[] = []
): ACUModelOverview[] {
  const profilesByModel = new Map<string, ACUChannelMonitorProfile[]>()
  for (const profile of profiles) {
    const modelProfiles = profilesByModel.get(profile.canonicalModel) ?? []
    modelProfiles.push(profile)
    profilesByModel.set(profile.canonicalModel, modelProfiles)
  }
  const probesByProfile = new Map<string, ACUProbeHistoryRow[]>()
  const probesByModel = new Map<string, ACUProbeHistoryRow[]>()
  const profileModelById = new Map(
    profiles.map((profile) => [
      profile.executionProfileId,
      profile.canonicalModel,
    ])
  )
  for (const probe of probeHistory) {
    const modelId =
      profileModelById.get(probe.execution_profile_id) ??
      probe.canonical_model_id
    if (!modelId) continue
    const modelProbes = probesByModel.get(modelId) ?? []
    modelProbes.push(probe)
    probesByModel.set(modelId, modelProbes)
    const profileProbes = probesByProfile.get(probe.execution_profile_id) ?? []
    profileProbes.push(probe)
    probesByProfile.set(probe.execution_profile_id, profileProbes)
  }
  const bucketMs = monitorBucketSpec(range)
  const generatedTime = new Date(generatedAt).getTime()
  const lastBucketTime =
    Math.floor(
      (Number.isFinite(generatedTime) ? generatedTime : Date.now()) / bucketMs
    ) * bucketMs

  return [...profilesByModel.entries()]
    .map(([modelId, modelProfiles]) => {
      const modelHistory = history.filter(
        (row) =>
          row.scope_type === 'channel_model' && row.canonical_model === modelId
      )
      const sourceHistory =
        modelHistory.length > 0
          ? modelHistory
          : history.filter(
              (row) =>
                row.scope_type === 'profile' &&
                row.execution_profile_id != null &&
                profileModelById.get(row.execution_profile_id) === modelId
            )
      const historyByBucket = new Map<number, ACUChannelHistoryRow>()
      for (const row of sourceHistory) {
        const bucketTime = new Date(row.bucket).getTime()
        if (!Number.isFinite(bucketTime)) continue
        const current =
          historyByBucket.get(bucketTime) ?? historyBucket(row.bucket, modelId)
        current.request_count += row.request_count
        current.success_count += row.success_count
        current.error_count += row.error_count
        current.rate_limited_count += row.rate_limited_count
        current.server_error_count += row.server_error_count
        current.watchdog_count += row.watchdog_count
        current.recovery_count += row.recovery_count
        historyByBucket.set(bucketTime, current)
      }
      const buckets = Array.from({ length: 60 }, (_, index) => {
        const bucketTime = lastBucketTime - (59 - index) * bucketMs
        return (
          historyByBucket.get(bucketTime) ??
          historyBucket(new Date(bucketTime).toISOString(), modelId)
        )
      })
      const modelProbes = probesByModel.get(modelId) ?? []
      const latestProbeByProfile = new Map<string, ACUProbeHistoryRow>()
      for (const probe of modelProbes) {
        const current = latestProbeByProfile.get(probe.execution_profile_id)
        if (!current || probeTimestamp(probe) > probeTimestamp(current)) {
          latestProbeByProfile.set(probe.execution_profile_id, probe)
        }
      }
      const profilesWithProbes = sortProfilesByRank(
        modelProfiles.map((profile) => ({
          ...profile,
          latestProbe: latestProbeByProfile.get(profile.executionProfileId),
          probeBuckets: buildProbeBuckets(
            probesByProfile.get(profile.executionProfileId) ?? [],
            bucketMs,
            lastBucketTime
          ),
        }))
      )
      const requestCount = sourceHistory.reduce(
        (total, row) => total + row.request_count,
        0
      )
      const successCount = sourceHistory.reduce(
        (total, row) => total + row.success_count,
        0
      )
      return {
        modelId,
        profiles: profilesWithProbes,
        buckets,
        probeBuckets: buildProbeBuckets(modelProbes, bucketMs, lastBucketTime),
        requestCount,
        successCount,
        availability: requestCount > 0 ? successCount / requestCount : null,
        eligibleCount: modelProfiles.filter(
          (profile) => profile.routingEligible
        ).length,
        totalCount: modelProfiles.length,
      }
    })
    .sort((left, right) => left.modelId.localeCompare(right.modelId))
}

export function groupACUChannels(
  profiles: ACUChannelMonitorProfile[],
  history: ACUChannelHistoryRow[],
  range: ACUMonitorRange = '24h',
  generatedAt = new Date().toISOString(),
  probeHistory: ACUProbeHistoryRow[] = []
): ACUChannelOverview[] {
  const profilesByChannel = new Map<string, ACUChannelMonitorProfile[]>()
  const profileChannelById = new Map<string, string>()
  for (const profile of profiles) {
    const channelProfiles = profilesByChannel.get(profile.channel) ?? []
    channelProfiles.push(profile)
    profilesByChannel.set(profile.channel, channelProfiles)
    profileChannelById.set(profile.executionProfileId, profile.channel)
  }
  const historyByChannel = new Map<string, ACUChannelHistoryRow[]>()
  for (const row of history) {
    if (row.scope_type !== 'channel') continue
    const channelHistory = historyByChannel.get(row.scope_id) ?? []
    channelHistory.push(row)
    historyByChannel.set(row.scope_id, channelHistory)
  }
  const probesByChannel = new Map<string, ACUProbeHistoryRow[]>()
  for (const probe of probeHistory) {
    const channel = profileChannelById.get(probe.execution_profile_id)
    if (!channel) continue
    const channelProbes = probesByChannel.get(channel) ?? []
    channelProbes.push(probe)
    probesByChannel.set(channel, channelProbes)
  }
  return [...profilesByChannel.entries()]
    .map(([channel, channelProfiles]) => {
      const enabledProfiles = channelProfiles.filter(
        (profile) => profile.enabled
      )
      const eligibleProfiles = enabledProfiles.filter(
        (profile) => profile.routingEligible
      )
      let state: ACUChannelState = 'degraded'
      if (
        channelProfiles.some((profile) =>
          ['open', 'half_open'].includes(
            profile.channelStateRaw || profile.channelState
          )
        )
      ) {
        state = 'cooldown'
      } else if (enabledProfiles.length === 0) {
        state = 'disabled'
      } else if (eligibleProfiles.length === 0) {
        state = 'unavailable'
      } else if (eligibleProfiles.length === enabledProfiles.length) {
        state = 'healthy'
      }
      const primaryProfile = [...eligibleProfiles].sort(
        (left, right) =>
          (right.requestCount ?? 0) - (left.requestCount ?? 0) ||
          (left.profileRank ?? Number.POSITIVE_INFINITY) -
            (right.profileRank ?? Number.POSITIVE_INFINITY) ||
          left.executionProfileId.localeCompare(right.executionProfileId)
      )[0]
      const observedBuckets = historyByChannel.get(channel) ?? []
      const observedByTime = new Map(
        observedBuckets.map((row) => [new Date(row.bucket).getTime(), row])
      )
      const bucketMs = {
        '1h': 60_000,
        '6h': 5 * 60_000,
        '24h': 15 * 60_000,
        '7d': 60 * 60_000,
      }[range]
      const generatedTime = new Date(generatedAt).getTime()
      const lastBucketTime =
        Math.floor(
          (Number.isFinite(generatedTime) ? generatedTime : Date.now()) /
            bucketMs
        ) * bucketMs
      const buckets = Array.from({ length: 60 }, (_, index) => {
        const bucketTime = lastBucketTime - (59 - index) * bucketMs
        return (
          observedByTime.get(bucketTime) ?? {
            bucket: new Date(bucketTime).toISOString(),
            scope_type: 'channel' as const,
            scope_id: channel,
            execution_profile_id: null,
            canonical_model: null,
            provider: channelProfiles[0]?.provider ?? '',
            channel,
            request_count: 0,
            success_count: 0,
            error_count: 0,
            rate_limited_count: 0,
            server_error_count: 0,
            watchdog_count: 0,
            recovery_count: 0,
            p50_first_model_event_ms: null,
            p95_first_model_event_ms: null,
          }
        )
      })
      const channelProbes = probesByChannel.get(channel) ?? []
      const probeBuckets = buildProbeBuckets(
        channelProbes,
        bucketMs,
        lastBucketTime
      )
      const requestCount = observedBuckets.reduce(
        (total, row) => total + row.request_count,
        0
      )
      const successCount = observedBuckets.reduce(
        (total, row) => total + row.success_count,
        0
      )
      const latestProbeByProfile = new Map<string, ACUProbeHistoryRow>()
      const probesByProfile = new Map<string, ACUProbeHistoryRow[]>()
      for (const probe of channelProbes) {
        const profileProbes =
          probesByProfile.get(probe.execution_profile_id) ?? []
        profileProbes.push(probe)
        probesByProfile.set(probe.execution_profile_id, profileProbes)
        const current = latestProbeByProfile.get(probe.execution_profile_id)
        if (
          !current ||
          new Date(probe.started_at).getTime() >
            new Date(current.started_at).getTime()
        ) {
          latestProbeByProfile.set(probe.execution_profile_id, probe)
        }
      }
      const profilesWithLatestProbe = channelProfiles.map((profile) => ({
        ...profile,
        latestProbe: latestProbeByProfile.get(profile.executionProfileId),
        probeBuckets: buildProbeBuckets(
          probesByProfile.get(profile.executionProfileId) ?? [],
          bucketMs,
          lastBucketTime
        ),
      }))
      const successfulProbeProfiles = new Set(
        [...latestProbeByProfile.values()]
          .filter((probe) => probe.status === 'success')
          .map((probe) => probe.execution_profile_id)
      )
      const fullPoolTimes = channelProbes
        .filter((probe) => probe.probeMode === 'full_pool')
        .map((probe) => new Date(probe.started_at).getTime())
        .filter(Number.isFinite)
      const latestFullPoolTime = Math.max(
        ...fullPoolTimes,
        Number.NEGATIVE_INFINITY
      )
      const targetedProbes = channelProbes.filter(
        (probe) => probe.probeMode === 'targeted'
      )
      const targetedTimes = targetedProbes
        .map((probe) => new Date(probe.started_at).getTime())
        .filter(Number.isFinite)
      const latestTargetedTime = Math.max(
        ...targetedTimes,
        Number.NEGATIVE_INFINITY
      )
      const recoveryProbes = channelProbes.filter(
        (probe) => probe.probeMode === 'recovery'
      )
      const latestHealthEvent = channelProfiles
        .flatMap((profile) => profile.healthEvents ?? [])
        .sort(
          (left, right) =>
            new Date(right.at).getTime() - new Date(left.at).getTime()
        )[0]
      return {
        channel,
        providers: [
          ...new Set(channelProfiles.map((profile) => profile.provider)),
        ],
        profiles: [...profilesWithLatestProbe].sort((left, right) =>
          left.canonicalModel.localeCompare(right.canonicalModel)
        ),
        enabledProfileCount: enabledProfiles.length,
        eligibleProfileCount: eligibleProfiles.length,
        modelCount: new Set(
          channelProfiles.map((profile) => profile.canonicalModel)
        ).size,
        state,
        primaryProfile: primaryProfile ?? null,
        requestCount,
        successCount,
        availability: requestCount > 0 ? successCount / requestCount : null,
        buckets,
        probeBuckets,
        probeCount: channelProbes.length,
        probedProfileCount: enabledProfiles.filter((profile) =>
          successfulProbeProfiles.has(profile.executionProfileId)
        ).length,
        latestFullPoolProbeAt: Number.isFinite(latestFullPoolTime)
          ? new Date(latestFullPoolTime).toISOString()
          : null,
        targetedProbeCount: targetedProbes.length,
        targetedProbeSuccessCount: targetedProbes.filter(
          (probe) => probe.status === 'success'
        ).length,
        latestTargetedProbeAt: Number.isFinite(latestTargetedTime)
          ? new Date(latestTargetedTime).toISOString()
          : null,
        recoveryProbeCount: recoveryProbes.length,
        recoveryProbeSuccessCount: recoveryProbes.filter(
          (probe) => probe.status === 'success'
        ).length,
        latestHealthEvent: latestHealthEvent ?? null,
      }
    })
    .sort((left, right) => left.channel.localeCompare(right.channel))
}

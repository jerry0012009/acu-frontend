/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  ACUChannelHistoryRow,
  ACUChannelMonitorProfile,
  ACUMonitorRange,
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
  recoveryProbeCount: number
  recoveryProbeSuccessCount: number
  latestHealthEvent: ACUChannelMonitorProfile['healthEvents'][number] | null
}

export type ACUProbeBucket = {
  bucket: string
  fullPoolCount: number
  recoveryCount: number
  successCount: number
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

export function groupACUChannels(
  profiles: ACUChannelMonitorProfile[],
  history: ACUChannelHistoryRow[],
  range: ACUMonitorRange = '24h',
  generatedAt = new Date().toISOString(),
  probeHistory: ACUProbeHistoryRow[] = []
): ACUChannelOverview[] {
  const profilesByChannel = new Map<string, ACUChannelMonitorProfile[]>()
  for (const profile of profiles) {
    profilesByChannel.set(profile.channel, [
      ...(profilesByChannel.get(profile.channel) ?? []),
      profile,
    ])
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
      const primaryProfile = [...eligibleProfiles]
        .sort(
          (left, right) =>
            (right.requestCount ?? 0) - (left.requestCount ?? 0) ||
            (left.profileRank ?? Number.POSITIVE_INFINITY) -
              (right.profileRank ?? Number.POSITIVE_INFINITY) ||
            left.executionProfileId.localeCompare(right.executionProfileId)
        )[0]
      const observedBuckets = history.filter(
        (row) => row.scope_type === 'channel' && row.scope_id === channel
      )
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
      const profileIds = new Set(
        channelProfiles.map((profile) => profile.executionProfileId)
      )
      const channelProbes = probeHistory.filter((probe) =>
        profileIds.has(probe.execution_profile_id)
      )
      const probesByTime = new Map<number, ACUProbeBucket>()
      for (const probe of channelProbes) {
        const probeTime = new Date(probe.started_at).getTime()
        if (!Number.isFinite(probeTime)) continue
        const bucketTime = Math.floor(probeTime / bucketMs) * bucketMs
        const current = probesByTime.get(bucketTime) ?? {
          bucket: new Date(bucketTime).toISOString(),
          fullPoolCount: 0,
          recoveryCount: 0,
          successCount: 0,
          totalCount: 0,
        }
        current.totalCount += 1
        current.successCount += probe.status === 'success' ? 1 : 0
        if (probe.probeMode === 'full_pool') current.fullPoolCount += 1
        else current.recoveryCount += 1
        probesByTime.set(bucketTime, current)
      }
      const probeBuckets = Array.from({ length: 60 }, (_, index) => {
        const bucketTime = lastBucketTime - (59 - index) * bucketMs
        return (
          probesByTime.get(bucketTime) ?? {
            bucket: new Date(bucketTime).toISOString(),
            fullPoolCount: 0,
            recoveryCount: 0,
            successCount: 0,
            totalCount: 0,
          }
        )
      })
      const requestCount = observedBuckets.reduce(
        (total, row) => total + row.request_count,
        0
      )
      const successCount = observedBuckets.reduce(
        (total, row) => total + row.success_count,
        0
      )
      const latestProbeByProfile = new Map<string, ACUProbeHistoryRow>()
      for (const probe of channelProbes) {
        const current = latestProbeByProfile.get(probe.execution_profile_id)
        if (
          !current ||
          new Date(probe.started_at).getTime() >
            new Date(current.started_at).getTime()
        ) {
          latestProbeByProfile.set(probe.execution_profile_id, probe)
        }
      }
      const successfulProbeProfiles = new Set(
        [...latestProbeByProfile.values()]
          .filter((probe) => probe.status === 'success')
          .map((probe) => probe.execution_profile_id)
      )
      const fullPoolTimes = channelProbes
        .filter((probe) => probe.probeMode === 'full_pool')
        .map((probe) => new Date(probe.started_at).getTime())
        .filter(Number.isFinite)
      const latestFullPoolTime = Math.max(...fullPoolTimes, Number.NEGATIVE_INFINITY)
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
        profiles: [...channelProfiles].sort((left, right) =>
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
        recoveryProbeCount: recoveryProbes.length,
        recoveryProbeSuccessCount: recoveryProbes.filter(
          (probe) => probe.status === 'success'
        ).length,
        latestHealthEvent: latestHealthEvent ?? null,
      }
    })
    .sort((left, right) => left.channel.localeCompare(right.channel))
}

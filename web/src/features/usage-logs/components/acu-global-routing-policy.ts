import type { ACUChannelMonitorProfile, ACUGlobalRoutingPolicy } from '../api'

export function availableGlobalRoutingProfileIds(
  profiles: ACUChannelMonitorProfile[]
): string[] {
  return [
    ...new Set(
      profiles
        .filter(
          (profile) =>
            profile.enabled &&
            profile.administratorAllowed &&
            profile.autoRouteEnabled
        )
        .map((profile) => profile.executionProfileId)
    ),
  ].sort()
}

export function isProfileGloballyAllowed(
  policy: ACUGlobalRoutingPolicy,
  profileId: string
): boolean {
  return (
    policy.profilePolicy === 'all_routing_eligible' ||
    policy.allowedProfileIds.includes(profileId)
  )
}

export function canEnableProfileForGlobalRouting(
  policy: ACUGlobalRoutingPolicy,
  modelId: string
): boolean {
  return (
    policy.modelPolicy !== 'custom_allowlist' ||
    policy.allowedModelIds.includes(modelId)
  )
}

export function updateGlobalProfileRouting(
  policy: ACUGlobalRoutingPolicy,
  profiles: ACUChannelMonitorProfile[],
  profileId: string,
  enabled: boolean
): ACUGlobalRoutingPolicy {
  if (enabled) {
    if (policy.profilePolicy === 'all_routing_eligible') return policy
    return {
      ...policy,
      allowedProfileIds: [...new Set([...policy.allowedProfileIds, profileId])],
    }
  }
  if (policy.profilePolicy === 'custom_allowlist') {
    return {
      ...policy,
      allowedProfileIds: policy.allowedProfileIds.filter(
        (id) => id !== profileId
      ),
    }
  }
  return {
    ...policy,
    profilePolicy: 'custom_allowlist',
    allowedProfileIds: availableGlobalRoutingProfileIds(profiles).filter(
      (id) => id !== profileId
    ),
  }
}

import type { ACUChannelMonitorProfile, ACUGlobalRoutingPolicy } from '../api'

export type ACUModelAccess = 'disabled' | 'explicit' | 'auto'

export function modelAccessFor(
  policy: ACUGlobalRoutingPolicy,
  modelId: string,
  hasConfiguredProfile: boolean,
  autoRouteEnabled = true
): ACUModelAccess {
  const configured = policy.modelAccess?.[modelId]
  if (configured === 'disabled') return 'disabled'
  if (configured === 'explicit') return hasConfiguredProfile ? 'explicit' : 'disabled'
  if (configured === 'auto') {
    if (!hasConfiguredProfile) return 'disabled'
    return autoRouteEnabled ? 'auto' : 'explicit'
  }
  if (policy.modelPolicy === 'custom_allowlist') {
    if (policy.allowedModelIds.includes(modelId)) return 'auto'
    return hasConfiguredProfile ? 'explicit' : 'disabled'
  }
  if (policy.modelPolicy === 'explicit_only') {
    return hasConfiguredProfile ? 'explicit' : 'disabled'
  }
  if (!hasConfiguredProfile) return 'disabled'
  return autoRouteEnabled ? 'auto' : 'explicit'
}

export function updateGlobalModelAccess(
  policy: ACUGlobalRoutingPolicy,
  modelId: string,
  access: ACUModelAccess
): ACUGlobalRoutingPolicy {
  return {
    ...policy,
    modelAccess: { ...policy.modelAccess, [modelId]: access },
  }
}

export function availableGlobalRoutingProfileIds(
  profiles: ACUChannelMonitorProfile[]
): string[] {
  return [
    ...new Set(
      profiles
        .filter(
          (profile) =>
            profile.enabled !== false &&
            profile.administratorAllowed !== false
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

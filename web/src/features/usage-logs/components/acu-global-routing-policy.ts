import type { ACUGlobalRoutingPolicy } from '../api'

export type ACUModelAccess = 'disabled' | 'explicit' | 'auto'

export function modelAccessFor(
  policy: ACUGlobalRoutingPolicy,
  modelId: string,
  hasConfiguredProfile: boolean,
  autoRouteEnabled = true
): ACUModelAccess {
  const configured = policy.modelAccess?.[modelId]
  if (configured === 'disabled') return 'disabled'
  if (configured === 'explicit') {
    return hasConfiguredProfile ? 'explicit' : 'disabled'
  }
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

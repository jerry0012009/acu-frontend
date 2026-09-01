import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ACUChannelMonitorProfile,
  ACUGlobalRoutingPolicy,
} from '../../api'
import {
  availableGlobalRoutingProfileIds,
  isProfileGloballyAllowed,
  modelAccessFor,
  updateGlobalProfileRouting,
} from '../acu-global-routing-policy.ts'

function profile(
  executionProfileId: string,
  canonicalModel = 'gpt-5.6-luna',
  overrides: Partial<ACUChannelMonitorProfile> = {}
): ACUChannelMonitorProfile {
  return {
    executionProfileId,
    canonicalModel,
    enabled: true,
    administratorAllowed: true,
    autoRouteEnabled: true,
    ...overrides,
  } as ACUChannelMonitorProfile
}

function policy(
  overrides: Partial<ACUGlobalRoutingPolicy> = {}
): ACUGlobalRoutingPolicy {
  return {
    modelPolicy: 'all_routing_eligible',
    allowedModelIds: [],
    profilePolicy: 'custom_allowlist',
    allowedProfileIds: ['profile-a', 'profile-b'],
    ...overrides,
  }
}

test('uses the Router configuration Profile gate as the global allowlist inventory', () => {
  assert.deepEqual(
    availableGlobalRoutingProfileIds([
      profile('profile-a'),
      profile('profile-b', 'gpt-5.6-sol', { administratorAllowed: false }),
      profile('profile-c', 'gpt-5.6-terra', { autoRouteEnabled: false }),
      profile('profile-d', 'gpt-5.6-luna', { enabled: false }),
    ]),
    ['profile-a', 'profile-c']
  )
})

test('treats absent legacy availability flags as enabled', () => {
  assert.deepEqual(
    availableGlobalRoutingProfileIds([
      {
        executionProfileId: 'legacy-profile',
      } as ACUChannelMonitorProfile,
    ]),
    ['legacy-profile']
  )
})

test('normalizes impossible saved model states to the available access level', () => {
  assert.equal(
    modelAccessFor(
      policy({
        modelAccess: { 'mimo-v2.5': 'auto' },
      }),
      'mimo-v2.5',
      true,
      false
    ),
    'explicit'
  )
  assert.equal(
    modelAccessFor(
      policy({
        modelAccess: { 'mimo-v2.5': 'explicit' },
      }),
      'mimo-v2.5',
      false,
      false
    ),
    'disabled'
  )
})

test('removes and restores a Profile in custom global allowlist without duplicates', () => {
  const profiles = [profile('profile-a'), profile('profile-b')]
  const disabled = updateGlobalProfileRouting(
    policy(),
    profiles,
    'profile-a',
    false
  )
  assert.deepEqual(disabled.allowedProfileIds, ['profile-b'])
  assert.equal(isProfileGloballyAllowed(disabled, 'profile-a'), false)

  const enabled = updateGlobalProfileRouting(
    { ...disabled, allowedProfileIds: ['profile-b', 'profile-b'] },
    profiles,
    'profile-a',
    true
  )
  assert.deepEqual(enabled.allowedProfileIds, ['profile-b', 'profile-a'])
  assert.equal(isProfileGloballyAllowed(enabled, 'profile-a'), true)
})

test('turns all-routing-eligible into a Profile allowlist before disabling one Profile', () => {
  const profiles = [
    profile('profile-a'),
    profile('profile-b'),
    profile('not-configurable', 'gpt-5.6-sol', { enabled: false }),
  ]
  const updated = updateGlobalProfileRouting(
    policy({ profilePolicy: 'all_routing_eligible' }),
    profiles,
    'profile-a',
    false
  )

  assert.equal(updated.profilePolicy, 'custom_allowlist')
  assert.deepEqual(updated.allowedProfileIds, ['profile-b'])
})

test('Profile enablement is governed independently from the Auto model allowlist', () => {
  const restricted = policy({
    modelPolicy: 'custom_allowlist',
    allowedModelIds: ['gpt-5.6-luna'],
  })
  const updated = updateGlobalProfileRouting(
    restricted,
    [profile('explicit-only', 'mimo-v2.5', { autoRouteEnabled: false })],
    'explicit-only',
    true
  )
  assert.deepEqual(updated.allowedProfileIds, [
    'profile-a',
    'profile-b',
    'explicit-only',
  ])
})

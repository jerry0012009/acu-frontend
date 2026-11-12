import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  detectRuntimePlatform,
  onboardingPending,
  runtimeDownloadUrl,
  isRuntimeLogin,
  onboardingLanding,
  RUNTIME_RELEASE_URL,
} from '../runtime-onboarding'

test('desktop download selection excludes mobile, Linux and Windows ARM', () => {
  assert.equal(
    detectRuntimePlatform('Mozilla Windows NT 10.0; Win64; x64'),
    'windows'
  )
  assert.equal(detectRuntimePlatform('Macintosh; Intel Mac OS X'), 'mac-arm')
  for (const agent of [
    'Linux x86_64',
    'iPhone',
    'Android',
    'Windows NT 10.0; ARM64',
  ]) {
    assert.equal(detectRuntimePlatform(agent), 'other')
  }
  assert.equal(
    runtimeDownloadUrl('mac-intel'),
    '/api/acu-runtime/download/mac-intel'
  )
  assert.equal(
    runtimeDownloadUrl('mac-arm'),
    '/api/acu-runtime/download/mac-arm'
  )
  assert.equal(
    runtimeDownloadUrl('windows'),
    '/api/acu-runtime/download/windows'
  )
  assert.equal(
    RUNTIME_RELEASE_URL,
    'https://github.com/jerry0012009/acu-runtime/releases/latest'
  )
})

test('first-login guidance respects explicit destinations and Runtime sign-in windows', () => {
  const user = {
    id: 1,
    username: 'new',
    role: 1,
    setting: { acu_onboarding_pending: true },
  }
  assert.equal(onboardingLanding(user, null, false), '/#start')
  assert.equal(onboardingLanding(user, '/keys', false), '/keys')
  assert.equal(onboardingLanding(user, null, true), '/dashboard')
  assert.equal(
    onboardingLanding({ ...user, setting: {} }, null, false),
    '/dashboard'
  )
})

test('only explicitly marked new ordinary accounts receive onboarding', () => {
  const user = { id: 1, username: 'new', role: 1 }
  assert.equal(onboardingPending(user), false)
  assert.equal(onboardingPending({ ...user, setting: '{invalid' }), false)
  assert.equal(
    onboardingPending({ ...user, setting: { acu_onboarding_pending: true } }),
    true
  )
  assert.equal(
    onboardingPending({ ...user, setting: '{"acu_onboarding_pending":false}' }),
    false
  )
  assert.equal(
    onboardingPending({
      ...user,
      role: 10,
      setting: { acu_onboarding_pending: true },
    }),
    false
  )
  assert.equal(isRuntimeLogin({ querySelector: () => null }), false)
})

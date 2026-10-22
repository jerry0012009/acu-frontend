import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ACUChannelMonitorProfile,
  ACUTokenProfileRoutingScope,
} from '../../api'
import { previewModelPriceRange } from '../acu-monitor-presentation'

const profiles = [
  { executionProfileId: 'low', effectivePriceMultiplier: 0.03 },
  { executionProfileId: 'high', effectivePriceMultiplier: 0.2 },
  { executionProfileId: 'cheap', effectivePriceMultiplier: 0.029 },
  { executionProfileId: 'expensive', effectivePriceMultiplier: 0.201 },
  { executionProfileId: 'unknown', effectivePriceMultiplier: null },
  { executionProfileId: 'blocked', effectivePriceMultiplier: 0.1 },
] as ACUChannelMonitorProfile[]
const scope: ACUTokenProfileRoutingScope = {
  tokenId: 7,
  custom: true,
  globalProfileIds: [
    'low',
    'high',
    'cheap',
    'expensive',
    'unknown',
    'other-model',
  ],
  configuredProfileIds: ['cheap', 'expensive', 'unknown', 'other-model'],
  effectiveProfileIds: ['cheap', 'expensive', 'unknown', 'other-model'],
}

test('inclusive factor range excludes unknown prices and globally blocked profiles without touching other models', () => {
  const result = previewModelPriceRange(profiles, scope, 0.03, 0.2)
  assert.deepEqual(result.states, {
    low: true,
    high: true,
    cheap: false,
    expensive: false,
    unknown: false,
  })
  assert.equal(result.matched, 2)
  assert.equal(result.unknown, 1)
  assert.equal(result.changes.length, 5)
  assert.equal('blocked' in result.states, false)
  assert.equal('other-model' in result.states, false)
})

test('empty or unavailable selections report zero matches and do not invent prices', () => {
  assert.equal(previewModelPriceRange([], scope, 0, 1).matched, 0)
  assert.equal(previewModelPriceRange(profiles, scope, 0.3, 0.4).matched, 0)
  assert.equal(
    previewModelPriceRange(profiles, { ...scope, globalProfileIds: [] }, 0, 1)
      .changes.length,
    0
  )
})

test('already applied selection produces no changes and retains zero prices', () => {
  const result = previewModelPriceRange(
    [
      {
        executionProfileId: 'free',
        effectivePriceMultiplier: 0,
      } as ACUChannelMonitorProfile,
    ],
    { ...scope, globalProfileIds: ['free'], effectiveProfileIds: ['free'] },
    0,
    0
  )
  assert.deepEqual(result.states, { free: true })
  assert.equal(result.changes.length, 0)
  assert.equal(result.unknown, 0)
})

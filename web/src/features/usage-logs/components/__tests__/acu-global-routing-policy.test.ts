import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ACUGlobalRoutingPolicy } from '../../api'
import {
  modelAccessFor,
  updateGlobalModelAccess,
} from '../acu-global-routing-policy.ts'

function policy(
  overrides: Partial<ACUGlobalRoutingPolicy> = {}
): ACUGlobalRoutingPolicy {
  return {
    modelPolicy: 'all_routing_eligible',
    allowedModelIds: [],
    ...overrides,
  }
}

test('normalizes impossible saved model states to the available access level', () => {
  assert.equal(
    modelAccessFor(
      policy({ modelAccess: { 'mimo-v2.5': 'auto' } }),
      'mimo-v2.5',
      true,
      false
    ),
    'explicit'
  )
  assert.equal(
    modelAccessFor(
      policy({ modelAccess: { 'mimo-v2.5': 'explicit' } }),
      'mimo-v2.5',
      false,
      false
    ),
    'disabled'
  )
})

test('derives model access from the saved global model policy', () => {
  const restricted = policy({
    modelPolicy: 'custom_allowlist',
    allowedModelIds: ['gpt-5.6-luna'],
  })
  assert.equal(modelAccessFor(restricted, 'gpt-5.6-luna', true), 'auto')
  assert.equal(modelAccessFor(restricted, 'mimo-v2.5', true), 'explicit')
})

test('updates only the selected model access entry', () => {
  assert.deepEqual(
    updateGlobalModelAccess(
      policy({ modelAccess: { 'gpt-5.6-luna': 'auto' } }),
      'mimo-v2.5',
      'disabled'
    ).modelAccess,
    {
      'gpt-5.6-luna': 'auto',
      'mimo-v2.5': 'disabled',
    }
  )
})

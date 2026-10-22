import assert from 'node:assert/strict'
import test from 'node:test'

import type { ACUSelectionCorridor, PricingModel } from '../../types'
import {
  applyPricingPreview,
  selectedACUPricingPayable,
} from '../pricing-comparison'

const model: PricingModel = {
  id: 1,
  quota_type: 0,
  enable_groups: ['default'],
  model_name: 'deepseek-v4-flash',
  price_currency: 'CNY',
  price_semantics: 'estimated_user_payable_price',
  model_ratio: 0.1,
  completion_ratio: 2,
  cache_ratio: 0.1,
  payable: {
    input_cny_per_million: 0.2,
    output_cny_per_million: 0.4,
    status: 'estimated',
    pricing_policy_version: 'test',
  },
  payable_by_protocol: {
    responses: {
      input_cny_per_million: 0.2,
      output_cny_per_million: 0.4,
      status: 'estimated',
      pricing_policy_version: 'test',
    },
  },
}

const corridor = {
  generatedAt: '2026-10-22T12:00:00Z',
  supplyStrategy: 'balanced',
  pricing: {
    [model.model_name]: {
      executionProfileId: 'chat-route',
      payableInputPriceCnyPerMillion: 1.25,
      payableOutputPriceCnyPerMillion: 5,
      effectiveCostStatus: 'estimated',
      routes: [
        {
          executionProfileId: 'chat-route',
          displayName: 'Chat route',
          selected: true,
          payable: {
            inputCnyPerMillion: 1.25,
            outputCnyPerMillion: 5,
            status: 'estimated',
          },
        },
      ],
    },
  },
} as unknown as ACUSelectionCorridor

test('a live Chat quote replaces directory prices and legacy ratios consistently', () => {
  const [current] = applyPricingPreview(
    [model],
    corridor,
    'chat_completions',
    'ready'
  )
  assert.equal(selectedACUPricingPayable(current)?.input_cny_per_million, 1.25)
  assert.equal(current.model_ratio, 0.625)
  assert.equal(current.completion_ratio, 4)
  assert.equal(current.cache_ratio, undefined)
  assert.deepEqual(Object.keys(current.payable_by_protocol ?? {}), [
    'chat_completions',
  ])
  assert.equal(current.acu_quote?.routes.length, 1)
  assert.equal(current.acu_quote?.routes[0].payable.output_cny_per_million, 5)
})

test('a missing protocol quote never falls back to another protocol or directory price', () => {
  const [current] = applyPricingPreview(
    [model],
    { ...corridor, pricing: {} },
    'chat_completions',
    'ready'
  )
  assert.equal(current.payable, undefined)
  assert.equal(selectedACUPricingPayable(current), undefined)
  assert.equal(current.acu_currently_eligible, false)
  assert.equal(current.acu_quote?.routes.length, 0)
})

test('loading and error states discard old prices rather than displaying stale quotes', () => {
  for (const status of ['loading', 'error'] as const) {
    const [current] = applyPricingPreview(
      [model],
      corridor,
      'chat_completions',
      status
    )
    assert.equal(current.payable, undefined)
    assert.equal(current.acu_quote?.status, status)
    assert.equal(current.acu_quote?.routes.length, 0)
  }
})

test('preview does not change legacy non-ACU models', () => {
  const legacy = { model_name: 'legacy' } as PricingModel
  assert.equal(
    applyPricingPreview([legacy], corridor, 'chat_completions', 'ready')[0],
    legacy
  )
})

test('malformed selected route prices show an error rather than a free or stale price', () => {
  const malformed = structuredClone(corridor)
  malformed.pricing[model.model_name].routes[0].payable.inputCnyPerMillion =
    Number.NaN
  const [current] = applyPricingPreview(
    [model],
    malformed,
    'chat_completions',
    'ready'
  )
  assert.equal(current.payable, undefined)
  assert.equal(current.acu_quote?.status, 'error')
})

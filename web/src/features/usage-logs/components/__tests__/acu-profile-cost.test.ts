import assert from 'node:assert/strict'
import { test } from 'node:test'

import { estimateProfileCost } from '../acu-profile-cost'

const price = {
  inputPricePerMillion: 2,
  outputPricePerMillion: 10,
  cachedInputPricePerMillion: 0.2,
  cacheWritePricePerMillion: 2.5,
  currency: 'USD_CREDIT' as const,
  source: 'fixture',
  observedAt: '',
  status: 'verified' as const,
}
const usage = {
  inputTokens: '1000000',
  outputTokens: '100000',
  cachedInputTokens: '200000',
  cachedOutputTokens: '0',
}

test('Responses subtracts cached input and converts credits through the saved provider rate', () => {
  const result = estimateProfileCost(
    price,
    usage,
    'includes_cached',
    0.5,
    2,
    1.25
  )
  assert.equal(result.nominalCostUsd, 2.64)
  assert.equal(result.platformDebitCredits, 1.32)
  assert.equal(result.providerCostCny, 0.66)
  assert.equal(result.userChargeCny, 0.8250000000000001)
})
test('Messages adds cache reads and writes without subtracting uncached input', () => {
  const result = estimateProfileCost(
    price,
    { ...usage, cachedOutputTokens: '100000' },
    'excludes_cached',
    1,
    1,
    1
  )
  assert.equal(result.nominalCostUsd, 3.29)
})
test('missing billing evidence or invalid usage does not imply a free request', () => {
  assert.equal(
    estimateProfileCost(undefined, usage, 'includes_cached', 1, 1, 1)
      .nominalCostUsd,
    undefined
  )
  assert.equal(
    estimateProfileCost(
      price,
      { ...usage, inputTokens: '-1' },
      'includes_cached',
      1,
      1,
      1
    ).nominalCostUsd,
    undefined
  )
  assert.equal(
    estimateProfileCost(price, usage, 'includes_cached', 1, 0, 1).userChargeCny,
    undefined
  )
  assert.equal(
    estimateProfileCost(
      { ...price, cachedInputPricePerMillion: undefined },
      usage,
      'includes_cached',
      1,
      1,
      1
    ).nominalCostUsd,
    undefined
  )
})

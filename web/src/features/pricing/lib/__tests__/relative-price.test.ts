import assert from 'node:assert/strict'
import test from 'node:test'

import { relativePricingMultiplier } from '../pricing-comparison'

const official = { input_cny_per_million: 10, output_cny_per_million: 50 }
test('retail rates uniformly discounted to 3% produce 0.03x', () => {
  assert.equal(
    relativePricingMultiplier(
      { input_cny_per_million: 0.3, output_cny_per_million: 1.5 },
      official,
      100000,
      4000
    ),
    0.03
  )
})
test('different input/output discounts use the same token mix, not the cheapest component', () => {
  assert.equal(
    relativePricingMultiplier(
      { input_cny_per_million: 1, output_cny_per_million: 10 },
      official,
      1000,
      1000
    ),
    11 / 60
  )
})
test('both sides use long-context rates at the same threshold', () => {
  const payable = {
    input_cny_per_million: 1,
    output_cny_per_million: 2,
    context_tiers: {
      thresholdTokens: 100,
      standard: { inputPricePerMillion: 1, outputPricePerMillion: 2 },
      longContext: { inputPricePerMillion: 4, outputPricePerMillion: 8 },
    },
  }
  assert.equal(
    relativePricingMultiplier(
      payable,
      { input_cny_per_million: 10, output_cny_per_million: 20 },
      101,
      0
    ),
    0.4
  )
})
test('missing, zero, negative or invalid references never produce a misleading multiplier', () => {
  for (const reference of [
    undefined,
    { input_cny_per_million: 0, output_cny_per_million: 0 },
    { input_cny_per_million: -10, output_cny_per_million: 50 },
    { input_cny_per_million: Number.NaN, output_cny_per_million: 50 },
  ]) {
    assert.equal(
      relativePricingMultiplier(official, reference, 1000, 100),
      undefined
    )
  }
  assert.equal(relativePricingMultiplier(official, official, 0, 0), undefined)
})

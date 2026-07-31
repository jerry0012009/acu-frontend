import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PRICE_COLOR_STOPS,
  buildPriceRankColorMap,
  priceRankColor,
} from '../price-rank-color.ts'

test('maps cheap and expensive ranks to opposite ends of the price scale', () => {
  assert.equal(priceRankColor(0), PRICE_COLOR_STOPS[0])
  assert.equal(priceRankColor(1), PRICE_COLOR_STOPS.at(-1))
  assert.notEqual(priceRankColor(0.5), priceRankColor(0))
  assert.notEqual(priceRankColor(0.5), priceRankColor(1))
})

test('clamps ranks so changing model selection cannot create invalid colors', () => {
  assert.equal(priceRankColor(-1), priceRankColor(0))
  assert.equal(priceRankColor(2), priceRankColor(1))
  assert.match(priceRankColor(0.375), /^#[0-9a-f]{6}$/)
})

test('ranks the complete price set and gives tied costs the same color', () => {
  const colors = buildPriceRankColorMap([
    { id: 'cheap', cost: 0.01 },
    { id: 'middle-a', cost: 0.1 },
    { id: 'middle-b', cost: 0.1 },
    { id: 'expensive', cost: 1 },
  ])
  assert.equal(colors.get('cheap'), priceRankColor(0))
  assert.equal(colors.get('middle-a'), colors.get('middle-b'))
  assert.equal(colors.get('expensive'), priceRankColor(1))
})

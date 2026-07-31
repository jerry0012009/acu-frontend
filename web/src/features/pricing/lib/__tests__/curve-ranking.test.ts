import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareQualityAtDifficulty,
  qualityAtDifficulty,
  sortTooltipLinesByQuality,
} from '../curve-ranking.ts'

const curve = [
  { difficultyScore: 0, estimatedQuality: 0.95 },
  { difficultyScore: 50, estimatedQuality: 0.8 },
  { difficultyScore: 100, estimatedQuality: 0.4 },
]

test('interpolates model ability at the hovered difficulty', () => {
  assert.equal(qualityAtDifficulty(curve, 50), 0.8)
  assert.ok(Math.abs(qualityAtDifficulty(curve, 75) - 0.6) < 1e-12)
})

test('bounds hover difficulty to the available curve', () => {
  assert.equal(qualityAtDifficulty(curve, -10), 0.95)
  assert.equal(qualityAtDifficulty(curve, 120), 0.4)
  assert.equal(qualityAtDifficulty([], 50), 0)
})

test('changes ability ranking when curves cross at the hovered difficulty', () => {
  const resilient = [
    { difficultyScore: 0, estimatedQuality: 0.8 },
    { difficultyScore: 100, estimatedQuality: 0.7 },
  ]
  assert.ok(compareQualityAtDifficulty(curve, resilient, 0) < 0)
  assert.ok(compareQualityAtDifficulty(curve, resilient, 100) > 0)
})

test('orders hover labels by their vertical curve position', () => {
  const lines = [
    { key: 'middle', datum: { quality: 72 } },
    { key: 'top', datum: { quality: 91 } },
    { key: 'bottom', datum: { quality: 48 } },
  ]
  assert.deepEqual(
    sortTooltipLinesByQuality(lines).map((line) => line.key),
    ['top', 'middle', 'bottom']
  )
})

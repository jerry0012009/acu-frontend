import assert from 'node:assert/strict'
import test from 'node:test'

import { corridorPointAtDifficulty } from '../selection-corridor'

const point = (difficulty: number, selectedModelId: string) => ({
  difficulty,
  selectedModelId,
  selectedQuality: 80,
  selectedCostCny: 0.1,
  qualityLower: 70,
  qualityUpper: 90,
  candidates: [],
})

test('finds the nearest simulated difficulty point', () => {
  const corridor = {
    formulaVersion: 'test',
    generatedAt: '2026-07-31T00:00:00Z',
    inputTokens: 100,
    expectedOutputTokens: 10,
    assumptions: {},
    series: {
      economy: [point(0, 'mini'), point(10, 'luna')],
      balanced: [],
      quality: [],
    },
  }
  assert.equal(
    corridorPointAtDifficulty(corridor, 'economy', 8)?.selectedModelId,
    'luna'
  )
})

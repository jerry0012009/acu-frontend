import assert from 'node:assert/strict'
import test from 'node:test'

import {
  corridorIntervals,
  corridorPointAtDifficulty,
} from '../selection-corridor'

const point = (difficulty: number, selectedModelId: string) => ({
  difficulty,
  selectedModelId,
  selectedQuality: 80,
  selectedCostCny: 0.1,
  qualityLower: 70,
  qualityUpper: 90,
  candidates: [],
})

test('compresses adjacent selections into difficulty intervals', () => {
  assert.deepEqual(
    corridorIntervals([
      point(0, 'mini'),
      point(2, 'mini'),
      point(4, 'luna'),
      point(6, 'luna'),
      point(8, 'sol'),
    ]),
    [
      { modelId: 'mini', startDifficulty: 0, endDifficulty: 2 },
      { modelId: 'luna', startDifficulty: 4, endDifficulty: 6 },
      { modelId: 'sol', startDifficulty: 8, endDifficulty: 8 },
    ]
  )
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

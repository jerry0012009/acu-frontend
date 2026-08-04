import assert from 'node:assert/strict'
import test from 'node:test'

import {
  corridorPointAtDifficulty,
  syncCorridorPreviewPreference,
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

test('finds the nearest simulated difficulty point', () => {
  const corridor = {
    defaultPreference: 'balanced' as const,
    formulaVersion: 'test',
    generatedAt: '2026-07-31T00:00:00Z',
    inputTokens: 100,
    expectedOutputTokens: 10,
    assumptions: {},
    executionPresetSeries: [],
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

test('syncs Token preference once without overriding a manual selection', () => {
  const economy = syncCorridorPreviewPreference('balanced', undefined, '12', 'economy')
  assert.equal(economy.preference, 'economy')
  const manual = syncCorridorPreviewPreference('quality', economy.previewKey, '12', 'economy')
  assert.equal(manual.preference, 'quality')
  const quality = syncCorridorPreviewPreference('balanced', manual.previewKey, '13', 'quality')
  assert.equal(quality.preference, 'quality')
  const global = syncCorridorPreviewPreference('quality', quality.previewKey, 'global', 'balanced')
  assert.equal(global.preference, 'balanced')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRICING_PREVIEW_CONTROL_GRID_CLASS,
  corridorEligibleModelIds,
  corridorPointAtDifficulty,
  isCorridorModelTooltipDatum,
  resolveEffectiveCorridorPreference,
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

test('aggregates eligible models from corridor points and presets', () => {
  const corridor = {
    defaultPreference: 'economy' as const,
    formulaVersion: 'test',
    generatedAt: '2026-07-31T00:00:00Z',
    inputTokens: 100,
    expectedOutputTokens: 10,
    assumptions: {},
    executionPresetSeries: [
      {
        modelId: 'preset-model',
        candidateId: 'preset@high',
        displayName: 'Preset',
        executionPresetId: 'high',
        reasoningEffort: 'high',
        calibrationStatus: 'verified',
        expectedOutputTokenMultiplier: 1,
        estimatedOutputTokens: 10,
        points: [
          { difficulty: 0, estimatedQuality: 80, estimatedCallCost: 0.1 },
        ],
      },
    ],
    series: {
      economy: [
        {
          ...point(0, 'selected-model'),
          candidates: [
            {
              candidateId: 'candidate',
              modelId: 'candidate-model',
              quality: 1,
              costCny: 1,
              valueUtility: 1,
            },
          ],
        },
      ],
      balanced: [],
      quality: [],
    },
  }
  assert.deepEqual([...corridorEligibleModelIds(corridor)].sort(), [
    'candidate-model',
    'preset-model',
    'selected-model',
  ])
})

test('uses the selected Token preference and keeps global mode interactive', () => {
  const corridor = {
    defaultPreference: 'economy' as const,
    formulaVersion: 'test',
    generatedAt: '2026-07-31T00:00:00Z',
    inputTokens: 100,
    expectedOutputTokens: 10,
    assumptions: {},
    executionPresetSeries: [],
    series: { economy: [], balanced: [], quality: [] },
  }
  assert.equal(
    resolveEffectiveCorridorPreference(3, corridor, 'quality'),
    'economy'
  )
  assert.equal(
    resolveEffectiveCorridorPreference(
      4,
      { ...corridor, defaultPreference: 'quality' },
      'balanced'
    ),
    'quality'
  )
  assert.equal(
    resolveEffectiveCorridorPreference(undefined, corridor, 'balanced'),
    'balanced'
  )
  assert.equal(
    resolveEffectiveCorridorPreference(undefined, corridor, 'quality'),
    'quality'
  )
})

test('uses a three-column aligned desktop control grid', () => {
  assert.match(
    PRICING_PREVIEW_CONTROL_GRID_CLASS,
    /items-end.*xl:grid-cols-\[minmax\(240px,280px\)_112px_112px\]/
  )
})

test('keeps corridor band and centerline data out of model tooltips', () => {
  assert.equal(
    isCorridorModelTooltipDatum({
      modelName: 'Luna',
      quality: 88,
      cost: 0.01,
    }),
    true
  )
  assert.equal(
    isCorridorModelTooltipDatum({
      quality: 88,
      cost: 0.01,
    }),
    false
  )
  assert.equal(
    isCorridorModelTooltipDatum({
      modelName: 'Luna',
      quality: Number.NaN,
      cost: 0.01,
    }),
    false
  )
})

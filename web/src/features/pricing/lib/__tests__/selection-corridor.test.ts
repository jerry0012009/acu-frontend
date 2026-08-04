import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CORRIDOR_DISPLAY_SMOOTH_RADIUS,
  CORRIDOR_DISPLAY_SMOOTH_SIGMA,
  PRICING_PREVIEW_CONTROL_GRID_CLASS,
  buildSmoothedCorridorDisplayValues,
  corridorEligibleModelIds,
  corridorPointAtDifficulty,
  isCorridorModelTooltipDatum,
  resolveEffectiveCorridorPreference,
} from '../selection-corridor'

const point = (
  difficulty: number,
  selectedModelId: string,
  selectedQuality = 80,
  qualityLower = 70,
  qualityUpper = 90
) => ({
  difficulty,
  selectedModelId,
  selectedCandidateId: selectedModelId,
  selectedQuality,
  selectedCostCny: 0.1,
  qualityLower,
  qualityUpper,
  candidates: [],
})

test('returns an empty display corridor for empty input', () => {
  assert.deepEqual(buildSmoothedCorridorDisplayValues([]), [])
})

test('keeps a single display point stable without copying route fields', () => {
  const input = [point(50, 'luna', 72, 60, 80)]
  const result = buildSmoothedCorridorDisplayValues(input)

  assert.deepEqual(result, [
    {
      difficulty: 50,
      selectedQuality: 72,
      qualityLower: 60,
      qualityUpper: 80,
    },
  ])
  assert.equal(Object.hasOwn(result[0], 'selectedCandidateId'), false)
})

test('keeps a flat corridor unchanged, including normalized edges', () => {
  const input = Array.from({ length: 101 }, (_, difficulty) =>
    point(difficulty, 'luna', 70, 58, 81)
  )
  const result = buildSmoothedCorridorDisplayValues(input)

  for (const displayPoint of result) {
    assert.ok(Math.abs(displayPoint.selectedQuality - 70) < 1e-12)
    assert.ok(Math.abs(displayPoint.qualityLower - 58) < 1e-12)
    assert.ok(Math.abs(displayPoint.qualityUpper - 81) < 1e-12)
  }
})

test('sorts and preserves the complete 101-point difficulty sequence', () => {
  const input = Array.from({ length: 101 }, (_, difficulty) =>
    point(100 - difficulty, 'luna')
  )
  const result = buildSmoothedCorridorDisplayValues(input)

  assert.equal(result.length, 101)
  assert.deepEqual(
    result.map((displayPoint) => displayPoint.difficulty),
    Array.from({ length: 101 }, (_, difficulty) => difficulty)
  )
})

test('does not mutate input points or share mutable output objects', () => {
  const input = [point(1, 'sol', 75, 65, 84), point(0, 'luna', 70, 58, 80)]
  const snapshot = structuredClone(input)
  const result = buildSmoothedCorridorDisplayValues(input)

  assert.deepEqual(input, snapshot)
  result[0].selectedQuality = 1
  result[0].qualityLower = 0
  assert.deepEqual(input, snapshot)
})

test('spreads a candidate quality step across several difficulty points', () => {
  const input = Array.from({ length: 101 }, (_, difficulty) =>
    difficulty < 50
      ? point(difficulty, 'luna', 40, 30, 55)
      : point(difficulty, 'sol', 80, 72, 92)
  )
  const result = buildSmoothedCorridorDisplayValues(input)
  const transition = result.slice(44, 56).map((value) => value.selectedQuality)
  const changedSteps = transition
    .slice(1)
    .filter((value, index) => Math.abs(value - transition[index]) > 1e-9)

  assert.ok(result[45].selectedQuality > 40)
  assert.ok(result[54].selectedQuality < 80)
  assert.ok(changedSteps.length > 4)
  assert.ok(
    result
      .flatMap((value) => [
        value.selectedQuality,
        value.qualityLower,
        value.qualityUpper,
      ])
      .every(Number.isFinite)
  )
})

test('keeps every smoothed corridor value ordered and within 0 to 100', () => {
  const input = Array.from({ length: 101 }, (_, difficulty) =>
    difficulty < 50
      ? point(difficulty, 'low', -10, -30, 20)
      : point(difficulty, 'high', 110, 80, 140)
  )
  const result = buildSmoothedCorridorDisplayValues(input)

  for (const displayPoint of result) {
    assert.ok(displayPoint.qualityLower >= 0)
    assert.ok(displayPoint.qualityUpper <= 100)
    assert.ok(displayPoint.qualityLower <= displayPoint.selectedQuality)
    assert.ok(displayPoint.selectedQuality <= displayPoint.qualityUpper)
  }
})

test('renormalizes Gaussian weights at D0 and D100', () => {
  const input = Array.from({ length: 101 }, (_, difficulty) =>
    point(difficulty, 'luna', difficulty, difficulty, difficulty)
  )
  const result = buildSmoothedCorridorDisplayValues(input)
  const edgeExpected = Array.from(
    { length: CORRIDOR_DISPLAY_SMOOTH_RADIUS + 1 },
    (_, offset) => ({
      value: offset,
      weight: Math.exp(
        -(offset * offset) /
          (2 * CORRIDOR_DISPLAY_SMOOTH_SIGMA * CORRIDOR_DISPLAY_SMOOTH_SIGMA)
      ),
    })
  )
  const weightTotal = edgeExpected.reduce(
    (total, item) => total + item.weight,
    0
  )
  const expectedD0 =
    edgeExpected.reduce((total, item) => total + item.value * item.weight, 0) /
    weightTotal

  assert.ok(Math.abs(result[0].selectedQuality - expectedD0) < 1e-12)
  assert.ok(Math.abs(result[100].selectedQuality - (100 - expectedD0)) < 1e-12)
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

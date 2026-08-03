import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  executionPresetLabels,
  executionPresetPointAtDifficulty,
  executionPresetPricingCosts,
} from '../execution-preset-series'
import { buildPricingBarSeries } from '../pricing-comparison'
import type { PricingModel } from '../../types'

const lunaMax = {
  candidateId: 'gpt-5.6-luna@max',
  modelId: 'gpt-5.6-luna',
  displayName: 'GPT-5.6 Luna · Max',
  executionPresetId: 'gpt-5.6-luna:max',
  reasoningEffort: 'max',
  calibrationStatus: 'provisional',
  expectedOutputTokenMultiplier: 1.6,
  estimatedOutputTokens: 6_400,
  points: [
    { difficulty: 0, estimatedQuality: 90, estimatedCallCost: 0.2 },
    { difficulty: 50, estimatedQuality: 80, estimatedCallCost: 0.2 },
    { difficulty: 100, estimatedQuality: 70, estimatedCallCost: 0.2 },
  ],
}

test('keeps Luna and Luna Max candidate identities distinct', () => {
  assert.notEqual(lunaMax.candidateId, lunaMax.modelId)
  assert.equal(executionPresetPointAtDifficulty(lunaMax, 49)?.difficulty, 50)
  assert.deepEqual(executionPresetLabels(lunaMax), [
    'Preset',
    'Max reasoning',
    'Provisional',
  ])
})

const luna = {
  id: 1,
  model_name: 'gpt-5.6-luna',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: [],
  reference: {
    input_cny_per_million: 2,
    output_cny_per_million: 10,
    source_type: 'official',
    source_name: 'OpenAI',
    observed_at: '2026-08-03T00:00:00Z',
    original_currency: 'CNY',
  },
} satisfies PricingModel

test('uses Router payable cost and base Luna reference pricing with adjusted output only', () => {
  const comparison = executionPresetPricingCosts(
    lunaMax,
    luna,
    'comparison',
    100_000,
    50
  )
  assert.equal(comparison.payableCost, 0.2)
  assert.equal(comparison.referenceCost, 0.264)
  assert.equal(comparison.displayCost, 0.2)
  assert.deepEqual(
    buildPricingBarSeries('comparison').map((series) => series.xField),
    ['referenceCost', 'payableCost']
  )

  const referenceOnly = executionPresetPricingCosts(
    lunaMax,
    luna,
    'reference_only',
    100_000,
    50
  )
  assert.equal(referenceOnly.displayCost, 0.264)
  assert.notEqual(referenceOnly.displayCost, referenceOnly.payableCost)
})

test('does not hard-code the Luna Max output multiplier in Pricing code', () => {
  const sources = [
    '../execution-preset-series.ts',
    '../../components/acu-model-curves.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  assert.equal(sources.some((source) => /\b1\.6\b/.test(source)), false)
  assert.match(sources[1], /buildPriceRankColorMap\(candidateDisplayCosts\)/)
})

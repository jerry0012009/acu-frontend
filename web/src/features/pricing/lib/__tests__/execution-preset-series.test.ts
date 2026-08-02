import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executionPresetLabels,
  executionPresetPointAtDifficulty,
} from '../execution-preset-series'

const lunaMax = {
  candidateId: 'gpt-5.6-luna@max',
  modelId: 'gpt-5.6-luna',
  displayName: 'GPT-5.6 Luna · Max',
  executionPresetId: 'gpt-5.6-luna:max',
  reasoningEffort: 'max',
  calibrationStatus: 'provisional',
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

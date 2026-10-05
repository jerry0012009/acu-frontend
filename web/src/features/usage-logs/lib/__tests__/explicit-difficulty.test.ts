import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ACUWorkTimelineItem } from '../../api'
import {
  EXPLICIT_DIFFICULTY_MAX,
  EXPLICIT_DIFFICULTY_MIN,
  EXPLICIT_DIFFICULTY_OFFSET_LIMIT,
  EXPLICIT_DIFFICULTY_WINDOW_SIZE,
  EXPLICIT_QUALITY_TARGET,
  addExplicitDifficulty,
  addExplicitQuality,
  estimateExplicitDifficulty,
  isExplicitModel,
  isExplicitTimelineItem,
} from '../explicit-difficulty'

function item(
  overrides: Partial<ACUWorkTimelineItem> = {}
): ACUWorkTimelineItem {
  return {
    pointId: 'request-1:execution',
    pointType: 'execution',
    timestamp: 1_000,
    sequence: 1,
    logicalRequestId: 'request-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    segmentId: 'segment-1',
    judgeCalled: false,
    judgeReused: false,
    judgeModel: '',
    judgeBackupUsed: false,
    difficulty: 0,
    difficultyRecorded: false,
    requestedModel: 'gpt-5.6-terra',
    actualModel: 'gpt-5.6-terra',
    provider: 'provider',
    channel: 'channel',
    status: 'completed',
    billingStatus: 'finalized',
    firstModelEventLatencyMs: 1,
    endToEndLatencyMs: 1,
    latencySource: 'reported',
    judgeLatencyMs: 0,
    providerLatencyMs: 1,
    providerUserChargeCny: 0,
    judgeUserChargeCny: 0,
    judgeProfileSelection: { candidateCount: 0 },
    judgeAttempts: [],
    workPhase: 'general',
    workPhaseQualityTargetOffset: 0,
    judgeTrigger: '',
    judgeStatus: '',
    judgeResultSource: '',
    judgeFirstAttemptSucceeded: false,
    judgeProfileAttemptCount: 0,
    judgeSameModelFailoverUsed: false,
    selectedCandidateId: '',
    selectedDisplayName: '',
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheHitRatio: 0,
    profileAttemptCount: 0,
    topCandidates: [],
    providerAttempts: [],
    ...overrides,
  }
}

test('explicit difficulty is deterministic and stays within display bounds', () => {
  const current = item()
  const first = estimateExplicitDifficulty(current, 0)
  const second = estimateExplicitDifficulty(current, 0)

  assert.deepEqual(first, second)
  assert.ok(first)
  assert.ok(first.difficulty >= EXPLICIT_DIFFICULTY_MIN)
  assert.ok(first.difficulty <= EXPLICIT_DIFFICULTY_MAX)
  assert.ok(Math.abs(first.sessionOffset) <= EXPLICIT_DIFFICULTY_OFFSET_LIMIT)
  assert.ok(Math.abs(first.windowOffset) <= EXPLICIT_DIFFICULTY_OFFSET_LIMIT)
})

test('explicit difficulty keeps a window offset for sixteen requests', () => {
  const current = item()
  const first = estimateExplicitDifficulty(current, 0)
  const lastInWindow = estimateExplicitDifficulty(
    current,
    EXPLICIT_DIFFICULTY_WINDOW_SIZE - 1
  )
  const nextWindow = estimateExplicitDifficulty(
    current,
    EXPLICIT_DIFFICULTY_WINDOW_SIZE
  )

  assert.ok(first)
  assert.ok(lastInWindow)
  assert.ok(nextWindow)
  assert.equal(first.windowIndex, lastInWindow.windowIndex)
  assert.equal(nextWindow.windowIndex, first.windowIndex + 1)
  assert.equal(first.windowOffset, lastInWindow.windowOffset)
})

test('session offset is stable per session and phase changes affect the estimate', () => {
  const general = estimateExplicitDifficulty(item(), 0)
  const planning = estimateExplicitDifficulty(
    item({ workPhase: 'planning' }),
    0
  )
  const otherSession = estimateExplicitDifficulty(
    item({ sessionId: 'session-2' }),
    0
  )

  assert.ok(general)
  assert.ok(planning)
  assert.ok(otherSession)
  assert.equal(planning.sessionOffset, general.sessionOffset)
  assert.equal(planning.workPhaseOffset, 8)
  assert.equal(planning.difficulty - general.difficulty, 8)
  assert.notEqual(otherSession.sessionOffset, undefined)
})

test('explicit detection excludes automatic routing and public views never infer', () => {
  assert.equal(isExplicitModel('acu-auto'), false)
  assert.equal(isExplicitModel('acu-high'), false)
  assert.equal(isExplicitModel('gpt-5.6-terra'), true)
  assert.equal(isExplicitTimelineItem(item()), true)
  assert.equal(
    isExplicitTimelineItem(item({ requestedModel: 'acu-auto' })),
    false
  )

  const current = item()
  assert.deepEqual(addExplicitDifficulty([current], false), [current])
  assert.equal(
    addExplicitDifficulty([current], false)[0]?.displayDifficulty,
    undefined
  )
})

test('Claude family models use elevated capability-aligned bases', () => {
  const cases = [
    ['claude-haiku-4-5', 34],
    ['claude-sonnet-5', 74],
    ['claude-opus-4-8', 84],
    ['claude-opus-5', 88],
    ['claude-fable-5', 92],
    ['claude-fable-5-1', 94],
    ['opus-5', 88],
    ['fable-5', 92],
  ] as const

  for (const [requestedModel, expectedBase] of cases) {
    const estimate = estimateExplicitDifficulty(
      item({ requestedModel, actualModel: requestedModel }),
      0
    )
    assert.ok(estimate)
    assert.equal(estimate.modelBase, expectedBase)
  }
})

test('GPT-6 Luna uses a model baseline before reasoning-effort adjustments', () => {
  const estimate = estimateExplicitDifficulty(
    item({
      requestedModel: 'gpt-6-luna',
      actualModel: 'gpt-6-luna',
      resolvedReasoningEffort: 'high',
    }),
    0
  )
  assert.ok(estimate)
  assert.equal(estimate.modelBase, 50)
  assert.equal(
    estimate.difficulty - estimate.modelBase,
    estimate.sessionOffset + estimate.windowOffset + estimate.workPhaseOffset
  )
})

test('reasoning effort alone does not move an explicit model difficulty baseline', () => {
  const high = estimateExplicitDifficulty(
    item({
      requestedModel: 'gpt-6-luna',
      actualModel: 'gpt-6-luna',
      resolvedReasoningEffort: 'high',
    }),
    0
  )
  const max = estimateExplicitDifficulty(
    item({
      requestedModel: 'gpt-6-luna',
      actualModel: 'gpt-6-luna',
      resolvedReasoningEffort: 'max',
    }),
    0
  )
  assert.ok(high)
  assert.ok(max)
  assert.equal(high.difficulty, max.difficulty)
  assert.equal(high.modelBase, 50)
})

test('catalog quality curves determine the model baseline before fallback tables', () => {
  const catalog = {
    models: [
      {
        modelId: 'gpt-6-astra',
        vendor: 'test',
        modelCategory: 'text_agent' as const,
        capabilityTier: 'LUNA' as const,
        protocols: ['responses'],
        verificationStatus: 'verified' as const,
        autoRouteEnabled: true,
        curve: [
          { difficultyScore: 0, estimatedQuality: 0.99 },
          { difficultyScore: 50, estimatedQuality: EXPLICIT_QUALITY_TARGET },
          { difficultyScore: 100, estimatedQuality: 0.6 },
        ],
        routingCandidates: [],
      },
    ],
    profiles: [],
    defaultCandidatePreferenceScores: {},
  }
  const estimate = estimateExplicitDifficulty(
    item({ requestedModel: 'gpt-6-astra', actualModel: 'gpt-6-astra' }),
    0,
    catalog
  )
  assert.ok(estimate)
  assert.equal(estimate.modelBase, 50)
})

test('current catalog model IDs have explicit baselines', () => {
  const modelIds = [
    'claude-opus-5-5',
    'gpt-6-sol',
    'gpt-6.1-sol',
    'deepseek-v4-pro',
    'glm-5.3',
    'kimi-k2.7-code',
    'grok-4.6',
    'mimo-v2.6-pro',
    'qwen3.8-max',
  ]
  for (const modelId of modelIds) {
    const estimate = estimateExplicitDifficulty(
      item({ requestedModel: modelId, actualModel: modelId }),
      0
    )
    assert.ok(estimate, modelId)
    assert.notEqual(estimate.modelBase, 42, modelId)
  }
})

test('a recorded difficulty is preserved instead of being replaced by an estimate', () => {
  const recorded = item({ difficultyRecorded: true, difficulty: 23 })
  const result = addExplicitDifficulty([recorded], true)[0]
  assert.equal(result.difficulty, 23)
  assert.notEqual(result.displayDifficultyInferred, true)
})

test('explicit quality uses estimated difficulty and builds both cost references', () => {
  const current = item({
    protocol: 'responses',
    inputTokens: 1000,
    outputTokens: 1000,
    qualityComparison: {
      modelChargeCny: 0.02,
      officialModelCostCny: 0.01,
    },
  })
  const curve = (quality: number) => [
    { difficultyScore: 0, estimatedQuality: quality },
    { difficultyScore: 100, estimatedQuality: quality },
  ]
  const catalog = {
    catalogVersion: 'catalog-v1',
    models: [
      {
        modelId: 'gpt-5.6-terra',
        displayName: 'Terra',
        vendor: 'test',
        modelCategory: 'text_agent' as const,
        capabilityTier: 'TERRA' as const,
        protocols: ['responses'],
        verificationStatus: 'verified' as const,
        autoRouteEnabled: true,
        curve: curve(0.7),
        referencePricing: {
          inputUsdPerMillion: 1,
          outputUsdPerMillion: 1,
        },
        routingCandidates: [],
      },
      {
        modelId: 'budget',
        displayName: 'Budget',
        vendor: 'test',
        modelCategory: 'text_agent' as const,
        capabilityTier: 'LUNA' as const,
        protocols: ['responses'],
        verificationStatus: 'verified' as const,
        autoRouteEnabled: true,
        curve: curve(0.6),
        referencePricing: {
          inputUsdPerMillion: 0.5,
          outputUsdPerMillion: 0.5,
        },
        routingCandidates: [],
      },
      {
        modelId: 'gpt-6-astra',
        displayName: 'GPT-6 Astra',
        vendor: 'test',
        modelCategory: 'text_agent' as const,
        capabilityTier: 'SOL' as const,
        protocols: ['responses'],
        verificationStatus: 'verified' as const,
        autoRouteEnabled: true,
        curve: curve(0.9),
        referencePricing: {
          inputUsdPerMillion: 10,
          outputUsdPerMillion: 10,
        },
        routingCandidates: [],
      },
    ],
    profiles: [],
    defaultCandidatePreferenceScores: {},
  }
  const withDifficulty = addExplicitDifficulty([current], true)
  const result = addExplicitQuality(withDifficulty, catalog)[0]

  assert.equal(result?.displayQualityInferred, true)
  assert.equal(result?.displayQuality, 70)
  assert.equal(
    result?.displayQualityComparison?.qualitySource,
    'explicit_difficulty_model_curve'
  )
  assert.equal(
    result?.displayQualityComparison?.sameBudget?.modelId,
    'gpt-5.6-terra'
  )
  assert.equal(
    result?.displayQualityComparison?.mostExpensive?.modelId,
    'gpt-6-astra'
  )
})

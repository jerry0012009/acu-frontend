import type {
  ACURoutingCatalog,
  ACUWorkTimelineItem,
  ACUTimelineQualityComparison,
} from '../api'

export const EXPLICIT_DIFFICULTY_WINDOW_SIZE = 16
export const EXPLICIT_DIFFICULTY_OFFSET_LIMIT = 10
export const EXPLICIT_DIFFICULTY_MIN = 5
export const EXPLICIT_DIFFICULTY_MAX = 95

const MODEL_DEFAULT_DIFFICULTY: Record<string, number> = {
  'claude-fable-5-1': 94,
  'fable-5-1': 94,
  'claude-fable-5': 92,
  'fable-5': 92,
  'claude-opus-5': 88,
  'opus-5': 88,
  'claude-opus-4-8': 84,
  'claude-opus-4.8': 84,
  'opus-4-8': 84,
  'opus-4.8': 84,
  'claude-opus-4-7': 82,
  'claude-opus-4.7': 82,
  'claude-opus-4-6': 80,
  'claude-opus-4.6': 80,
  'claude-sonnet-5': 74,
  'sonnet-5': 74,
  'claude-sonnet-4-6': 66,
  'claude-sonnet-4.6': 66,
  'claude-haiku-4-5': 34,
  'claude-haiku-4.5': 34,
  'gpt-5.4-mini': 25,
  'gpt-5.5': 34,
  'gpt-5.6-luna': 42,
  'gpt-5.6-terra': 58,
  'gpt-5.6-sol': 74,
  'gpt-6-astra': 86,
}

const MODEL_TIER_DIFFICULTY = {
  low: 25,
  mid: 42,
  midHigh: 62,
  high: 80,
} as const

const WORK_PHASE_DIFFICULTY_OFFSET: Record<string, number> = {
  inspection: -8,
  general: 0,
  planning: 8,
  implementation: 3,
  verification: 0,
  recovery: 10,
}

export type ACUWorkTimelineDisplayItem = ACUWorkTimelineItem & {
  displayDifficulty?: number
  displayDifficultyInferred?: boolean
  displayDifficultyWindow?: number
  displayQuality?: number
  displayQualityInferred?: boolean
  displayQualityComparison?: ACUTimelineQualityComparison
}

export type ExplicitDifficultyEstimate = {
  difficulty: number
  modelBase: number
  sessionOffset: number
  windowOffset: number
  workPhaseOffset: number
  windowIndex: number
}

function normalize(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function deterministicOffset(seed: string): number {
  const span = EXPLICIT_DIFFICULTY_OFFSET_LIMIT * 2 + 1
  return (stableHash(seed) % span) - EXPLICIT_DIFFICULTY_OFFSET_LIMIT
}

function clampDifficulty(value: number): number {
  return Math.min(
    EXPLICIT_DIFFICULTY_MAX,
    Math.max(EXPLICIT_DIFFICULTY_MIN, Math.round(value))
  )
}

function modelIdentifiers(item: ACUWorkTimelineItem): string[] {
  return [
    item.requestedModel,
    item.actualModel,
    item.selectedDisplayName,
    item.selectedExecutionPresetId,
    item.presetReasoningEffort,
    item.resolvedReasoningEffort,
  ]
    .map(normalize)
    .filter(Boolean)
}

function hasModelIdentifier(identifier: string, modelId: string): boolean {
  return (
    identifier === modelId ||
    identifier.startsWith(`${modelId}-`) ||
    identifier.startsWith(`${modelId}@`) ||
    identifier.startsWith(`${modelId}:`) ||
    identifier.includes(`/${modelId}`)
  )
}

function modelDefaultDifficulty(item: ACUWorkTimelineItem): number {
  const identifiers = modelIdentifiers(item)
  for (const [modelId, difficulty] of Object.entries(
    MODEL_DEFAULT_DIFFICULTY
  )) {
    if (
      identifiers.some((identifier) => hasModelIdentifier(identifier, modelId))
    ) {
      return difficulty
    }
  }

  const tierSource = identifiers.join(' ').replaceAll(/[_-]+/g, ' ')
  if (/\bmid\s*high\b|\bmidhigh\b/.test(tierSource)) {
    return MODEL_TIER_DIFFICULTY.midHigh
  }
  if (/\bhigh\b|\bmax\b/.test(tierSource)) {
    return MODEL_TIER_DIFFICULTY.high
  }
  if (/\blow\b|\bmin\b/.test(tierSource)) {
    return MODEL_TIER_DIFFICULTY.low
  }
  return MODEL_TIER_DIFFICULTY.mid
}

function workPhaseDifficultyOffset(workPhase: string | undefined): number {
  return WORK_PHASE_DIFFICULTY_OFFSET[normalize(workPhase)] ?? 0
}

function interpolateCurveQuality(
  difficulty: number,
  curve: NonNullable<ACURoutingCatalog['models'][number]['curve']>
): number | undefined {
  const points = curve
    .filter(
      (point) =>
        Number.isFinite(point.difficultyScore) &&
        Number.isFinite(point.estimatedQuality)
    )
    .sort((left, right) => left.difficultyScore - right.difficultyScore)
  if (!points.length) return undefined
  if (difficulty <= points[0].difficultyScore) {
    return points[0].estimatedQuality * 100
  }
  const last = points.at(-1)
  if (!last) return undefined
  if (difficulty >= last.difficultyScore) return last.estimatedQuality * 100
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index]
    if (difficulty > right.difficultyScore) continue
    const left = points[index - 1]
    const span = right.difficultyScore - left.difficultyScore
    if (span <= 0) return undefined
    const fraction = (difficulty - left.difficultyScore) / span
    return (
      (left.estimatedQuality +
        fraction * (right.estimatedQuality - left.estimatedQuality)) *
      100
    )
  }
  return undefined
}

function catalogModelForItem(
  item: ACUWorkTimelineItem,
  catalog: ACURoutingCatalog
) {
  const identifiers = modelIdentifiers(item)
  return catalog.models.find((model) =>
    identifiers.some((identifier) =>
      hasModelIdentifier(identifier, model.modelId)
    )
  )
}

function officialModelCostUsd(
  item: ACUWorkTimelineItem,
  model: NonNullable<ACURoutingCatalog['models'][number]>
): number | undefined {
  const pricing = model.referencePricing
  if (
    !pricing ||
    pricing.inputUsdPerMillion == null ||
    pricing.outputUsdPerMillion == null
  ) {
    return undefined
  }
  const inputTokens = Math.max(0, item.inputTokens)
  const cachedTokens = Math.min(
    inputTokens,
    Math.max(0, item.cachedInputTokens)
  )
  const outputTokens = Math.max(0, item.outputTokens)
  const contextPrices =
    pricing.contextTiers &&
    (inputTokens > pricing.contextTiers.thresholdTokens
      ? pricing.contextTiers.longContext
      : pricing.contextTiers.standard)
  const inputPrice =
    contextPrices?.inputUsdPerMillion ?? pricing.inputUsdPerMillion
  const outputPrice =
    contextPrices?.outputUsdPerMillion ?? pricing.outputUsdPerMillion
  const cachedPrice =
    contextPrices?.cachedInputUsdPerMillion ??
    pricing.cachedInputUsdPerMillion ??
    inputPrice
  return (
    ((inputTokens - cachedTokens) * inputPrice +
      cachedTokens * cachedPrice +
      outputTokens * outputPrice) /
    1_000_000
  )
}

function timelineOrder(left: ACUWorkTimelineItem, right: ACUWorkTimelineItem) {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp
  }
  if (left.logicalRequestId !== right.logicalRequestId) {
    return left.logicalRequestId.localeCompare(right.logicalRequestId)
  }
  return left.pointId.localeCompare(right.pointId)
}

function sessionKey(item: ACUWorkTimelineItem): string {
  return `${item.userId ?? 'self'}:${item.sessionId || item.taskId || 'sessionless'}`
}

export function isExplicitModel(requestedModel: string | undefined): boolean {
  const normalized = normalize(requestedModel)
  return (
    normalized !== '' && normalized !== 'acu-auto' && normalized !== 'acu-high'
  )
}

export function isExplicitTimelineItem(item: ACUWorkTimelineItem): boolean {
  return item.pointType === 'execution' && isExplicitModel(item.requestedModel)
}

export function estimateExplicitDifficulty(
  item: ACUWorkTimelineItem,
  explicitOrdinal: number
): ExplicitDifficultyEstimate | undefined {
  if (!isExplicitTimelineItem(item) || !Number.isInteger(explicitOrdinal)) {
    return undefined
  }

  const safeOrdinal = Math.max(0, explicitOrdinal)
  const windowIndex = Math.floor(safeOrdinal / EXPLICIT_DIFFICULTY_WINDOW_SIZE)
  const key = sessionKey(item)
  const sessionOffset = deterministicOffset(`acu-explicit:v1:session:${key}`)
  const windowOffset = deterministicOffset(
    `acu-explicit:v1:window:${key}:${windowIndex}`
  )
  const workPhaseOffset = workPhaseDifficultyOffset(item.workPhase)
  const modelBase = modelDefaultDifficulty(item)
  const difficulty = clampDifficulty(
    modelBase + sessionOffset + windowOffset + workPhaseOffset
  )

  return {
    difficulty,
    modelBase,
    sessionOffset,
    windowOffset,
    workPhaseOffset,
    windowIndex,
  }
}

export function addExplicitDifficulty(
  items: ACUWorkTimelineItem[],
  isAdmin: boolean
): ACUWorkTimelineDisplayItem[] {
  if (!isAdmin || items.length === 0) return items

  const orderedItems = items
    .map((item) => ({ item }))
    .sort((left, right) => timelineOrder(left.item, right.item))
  const ordinalByPoint = new Map<string, number>()
  const nextOrdinalBySession = new Map<string, number>()

  for (const { item } of orderedItems) {
    if (!isExplicitTimelineItem(item)) continue
    const key = sessionKey(item)
    const ordinal = nextOrdinalBySession.get(key) ?? 0
    ordinalByPoint.set(item.pointId, ordinal)
    nextOrdinalBySession.set(key, ordinal + 1)
  }

  return items.map((item) => {
    if (item.difficultyRecorded && Number.isFinite(item.difficulty)) return item
    const ordinal = ordinalByPoint.get(item.pointId)
    if (ordinal == null) return item
    const estimate = estimateExplicitDifficulty(item, ordinal)
    if (!estimate) return item
    return {
      ...item,
      displayDifficulty: estimate.difficulty,
      displayDifficultyInferred: true,
      displayDifficultyWindow: estimate.windowIndex,
    }
  })
}

export function addExplicitQuality(
  items: ACUWorkTimelineDisplayItem[],
  catalog: ACURoutingCatalog | undefined
): ACUWorkTimelineDisplayItem[] {
  if (!catalog || items.length === 0) return items
  return items.map((item) => {
    if (
      !item.displayDifficultyInferred ||
      item.displayDifficulty == null ||
      !isExplicitTimelineItem(item) ||
      item.qualityComparison?.estimatedQuality != null
    ) {
      return item
    }
    const model = catalogModelForItem(item, catalog)
    if (!model?.curve) return item
    const difficulty = item.displayDifficulty
    if (difficulty == null) return item
    const estimatedQuality = interpolateCurveQuality(difficulty, model.curve)
    if (estimatedQuality == null || !Number.isFinite(estimatedQuality)) {
      return item
    }

    const comparison: ACUTimelineQualityComparison = {
      ...item.qualityComparison,
      estimatedQuality: Math.min(100, Math.max(0, estimatedQuality)),
      qualitySource: 'explicit_difficulty_model_curve',
      referenceCatalogVersion: catalog.catalogVersion,
    }
    const modelCharge = comparison.modelChargeCny
    const actualOfficialCostUsd = officialModelCostUsd(item, model)
    const actualOfficialCostCny = comparison.officialModelCostCny
    const fx =
      actualOfficialCostUsd != null &&
      actualOfficialCostUsd > 0 &&
      actualOfficialCostCny != null
        ? actualOfficialCostCny / actualOfficialCostUsd
        : undefined

    if (modelCharge != null && fx != null && fx > 0) {
      const references = catalog.models
        .filter(
          (candidate) =>
            candidate.protocols.includes(item.protocol ?? '') &&
            candidate.curve &&
            candidate.referencePricing
        )
        .map((candidate) => {
          const quality = interpolateCurveQuality(
            difficulty,
            candidate.curve ?? []
          )
          const costUsd = officialModelCostUsd(item, candidate)
          if (quality == null || costUsd == null) return undefined
          return {
            modelId: candidate.modelId,
            displayName: candidate.displayName ?? candidate.modelId,
            estimatedQuality: quality,
            officialCostCny: costUsd * fx,
          }
        })
        .filter(
          (
            value
          ): value is {
            modelId: string
            displayName: string
            estimatedQuality: number
            officialCostCny: number
          } => value != null && Number.isFinite(value.officialCostCny)
        )
      const affordable = references
        .filter((reference) => reference.officialCostCny <= modelCharge + 1e-10)
        .sort(
          (left, right) =>
            right.estimatedQuality - left.estimatedQuality ||
            left.officialCostCny - right.officialCostCny
        )[0]
      const mostExpensive = [...references].sort(
        (left, right) =>
          right.officialCostCny - left.officialCostCny ||
          right.estimatedQuality - left.estimatedQuality
      )[0]
      if (affordable) comparison.sameBudget = affordable
      if (mostExpensive) comparison.mostExpensive = mostExpensive
    }

    return {
      ...item,
      displayQuality: comparison.estimatedQuality,
      displayQualityInferred: true,
      displayQualityComparison: comparison,
    }
  })
}

export function timelineDisplayDifficulty(
  item: ACUWorkTimelineDisplayItem
): number | undefined {
  if (
    item.displayDifficultyInferred &&
    item.displayDifficulty != null &&
    Number.isFinite(item.displayDifficulty)
  ) {
    return item.displayDifficulty
  }
  if (item.difficultyRecorded && Number.isFinite(item.difficulty)) {
    return item.difficulty
  }
  return undefined
}

export function hasTimelineDisplayDifficulty(
  item: ACUWorkTimelineDisplayItem
): boolean {
  return timelineDisplayDifficulty(item) != null
}

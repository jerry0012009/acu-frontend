type CurvePoint = {
  difficultyScore: number
  estimatedQuality: number
}

export function qualityAtDifficulty(
  curve: CurvePoint[],
  difficulty: number
): number {
  if (curve.length === 0) return 0
  const bounded = Math.max(0, Math.min(100, difficulty))
  const upperIndex = curve.findIndex(
    (point) => point.difficultyScore >= bounded
  )
  if (upperIndex <= 0) return curve[Math.max(0, upperIndex)].estimatedQuality
  if (upperIndex === -1) return curve.at(-1)?.estimatedQuality ?? 0
  const lower = curve[upperIndex - 1]
  const upper = curve[upperIndex]
  const span = upper.difficultyScore - lower.difficultyScore
  if (span <= 0) return upper.estimatedQuality
  const ratio = (bounded - lower.difficultyScore) / span
  return (
    lower.estimatedQuality +
    (upper.estimatedQuality - lower.estimatedQuality) * ratio
  )
}

export function compareQualityAtDifficulty(
  left: CurvePoint[],
  right: CurvePoint[],
  difficulty: number
): number {
  return (
    qualityAtDifficulty(right, difficulty) -
    qualityAtDifficulty(left, difficulty)
  )
}

export function sortTooltipLinesByQuality<
  T extends { datum?: { quality?: number } },
>(lines: T[]): T[] {
  return [...lines]
    .filter((line) => Number.isFinite(line.datum?.quality))
    .sort(
      (left, right) =>
        Number(right.datum?.quality ?? 0) - Number(left.datum?.quality ?? 0)
    )
}

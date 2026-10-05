export const CURVE_DISPLAY_SMOOTH_RADIUS = 5
export const CURVE_DISPLAY_SMOOTH_SIGMA = 2.5

export function gaussianSmooth(values: number[]): number[] {
  const weights = Array.from(
    { length: CURVE_DISPLAY_SMOOTH_RADIUS * 2 + 1 },
    (_, index) => {
      const offset = index - CURVE_DISPLAY_SMOOTH_RADIUS
      return Math.exp(
        -(offset * offset) /
          (2 * CURVE_DISPLAY_SMOOTH_SIGMA * CURVE_DISPLAY_SMOOTH_SIGMA)
      )
    }
  )

  return values.map((_, index) => {
    const start = Math.max(0, index - CURVE_DISPLAY_SMOOTH_RADIUS)
    const end = Math.min(values.length - 1, index + CURVE_DISPLAY_SMOOTH_RADIUS)
    let weightedSum = 0
    let weightTotal = 0

    for (let neighbor = start; neighbor <= end; neighbor += 1) {
      const weight = weights[neighbor - index + CURVE_DISPLAY_SMOOTH_RADIUS]
      weightedSum += values[neighbor] * weight
      weightTotal += weight
    }

    return weightedSum / weightTotal
  })
}

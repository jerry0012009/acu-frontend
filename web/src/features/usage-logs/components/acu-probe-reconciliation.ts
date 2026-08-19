export function recommendedProbeMultiplier(
  nominalCostUsd: number | undefined,
  actualDebit: string | undefined
): number | undefined {
  const debit = Number(actualDebit)
  return nominalCostUsd !== undefined &&
    nominalCostUsd > 0 &&
    Number.isFinite(debit) &&
    debit >= 0
    ? debit / nominalCostUsd
    : undefined
}

export function buildProbeCalibrationInput(
  observedBillingMultiplier: number,
  creditsPerCny: string,
  creditsPerCnyDirty: boolean
): {
  observedBillingMultiplier: number
  creditsPerCny?: number
} {
  const input: {
    observedBillingMultiplier: number
    creditsPerCny?: number
  } = { observedBillingMultiplier }
  if (creditsPerCnyDirty) input.creditsPerCny = Number(creditsPerCny)
  return input
}

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

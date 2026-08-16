import type { PricingModel } from '@/features/pricing/types'

import type {
  AcuChannelAttempt,
  AcuCostBreakdown,
  LogOtherData,
} from '../types'

function hasInternalAttemptIdentity(attempts: AcuChannelAttempt[]): boolean {
  return attempts.some(
    (attempt) =>
      Boolean(attempt.provider) ||
      Boolean(attempt.channel) ||
      Boolean(attempt.channel_id) ||
      Boolean(attempt.execution_profile_id)
  )
}

export function acuBreakdownForView(
  other: LogOtherData | null,
  isAdmin: boolean
): AcuCostBreakdown | undefined {
  const publicBreakdown = other?.acu_cost_breakdown
  if (!isAdmin) return publicBreakdown

  const adminBreakdown = other?.admin_info?.acu_cost_breakdown
  if (!adminBreakdown) return publicBreakdown
  if (!publicBreakdown) return adminBreakdown

  const publicAttempts = publicBreakdown.channel_attempts ?? []
  const adminAttempts = adminBreakdown.channel_attempts ?? []
  let attempts = publicAttempts
  if (
    !(
      publicAttempts.length > 0 && hasInternalAttemptIdentity(publicAttempts)
    ) &&
    adminAttempts.length > 0
  ) {
    attempts = adminAttempts
  }

  return {
    ...publicBreakdown,
    ...adminBreakdown,
    channel_attempts: attempts,
  }
}

export function acuResolvedReasoningEffort(
  other: LogOtherData | null,
  breakdown?: AcuCostBreakdown
): string {
  const snapshot = breakdown?.route_decision?.decision_snapshot
  const snapshotEffort =
    snapshot?.resolvedReasoningEffort ?? snapshot?.resolved_reasoning_effort
  const value =
    (typeof snapshotEffort === 'string' ? snapshotEffort : undefined) ??
    breakdown?.decision_summary?.resolved_reasoning_effort ??
    breakdown?.reasoning_effort ??
    other?.reasoning_effort
  return value?.trim() || 'default'
}

export function acuSuccessfulAttempt(
  breakdown?: AcuCostBreakdown
): AcuChannelAttempt | undefined {
  const attempts = [...(breakdown?.channel_attempts ?? [])].sort(
    (left, right) => (right.attempt_index ?? 0) - (left.attempt_index ?? 0)
  )
  return attempts.find((attempt) => attempt.status === 'success')
}

export function acuHasRecovery(breakdown?: AcuCostBreakdown): boolean {
  const attempts = breakdown?.channel_attempts ?? []
  return (
    attempts.some((attempt) => attempt.status === 'success') &&
    attempts.some((attempt) => attempt.status !== 'success')
  )
}

export type AcuPriceComparisonRow = {
  kind: 'input' | 'cached' | 'output'
  payableCnyPerMillion: number
  referenceCnyPerMillion: number
  multiplier: number
  savings: number
}

export function acuPriceComparisonRows(
  model: PricingModel | undefined,
  protocol?: string
): AcuPriceComparisonRow[] {
  if (!model?.reference) return []
  const protocolKey = protocol?.toLowerCase()
  const payable =
    (protocolKey ? model.payable_by_protocol?.[protocolKey] : undefined) ??
    model.payable
  if (!payable) return []

  const values: Array<
    [AcuPriceComparisonRow['kind'], number | undefined, number | undefined]
  > = [
    [
      'input',
      payable.input_cny_per_million,
      model.reference.input_cny_per_million,
    ],
    [
      'cached',
      payable.cached_input_cny_per_million,
      model.reference.cached_input_cny_per_million,
    ],
    [
      'output',
      payable.output_cny_per_million,
      model.reference.output_cny_per_million,
    ],
  ]

  return values.flatMap(([kind, payablePrice, referencePrice]) => {
    if (
      payablePrice == null ||
      referencePrice == null ||
      !Number.isFinite(payablePrice) ||
      !Number.isFinite(referencePrice) ||
      referencePrice <= 0
    ) {
      return []
    }
    const multiplier = payablePrice / referencePrice
    return [
      {
        kind,
        payableCnyPerMillion: payablePrice,
        referenceCnyPerMillion: referencePrice,
        multiplier,
        savings: 1 - multiplier,
      },
    ]
  })
}

import type {
  ACUSessionTrace,
  ACUSessionTraceSegment,
} from '../../session-trace-types'

type JudgeAttempt = NonNullable<
  ACUSessionTraceSegment['judge']
>['attempts'][number]

export function latestTraceRequest(trace: ACUSessionTrace) {
  return trace.segments.flatMap((segment) => segment.logicalRequests).at(-1)
}

export function isSuccessfulTraceStatus(status?: string): boolean {
  return Boolean(
    status &&
    ['success', 'completed', 'completed_with_recovery'].includes(status)
  )
}

export function isNeutralTraceCancellation(
  request: ReturnType<typeof latestTraceRequest>
): boolean {
  return Boolean(
    request &&
    (request.status === 'cancelled' ||
      request.deliveryStatus?.startsWith('client_cancelled_'))
  )
}

export function traceTimingSummary(trace: ACUSessionTrace) {
  const request = latestTraceRequest(trace)
  const judgeAttemptMs = trace.segments.reduce((total, segment) => {
    const attempts = segment.judge?.attempts ?? []
    return (
      total +
      (attempts.length
        ? attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
        : (segment.judge?.latencyMs ?? 0))
    )
  }, 0)
  const providerAttemptMs = trace.segments.reduce(
    (total, segment) =>
      total +
      segment.providerAttempts.reduce(
        (sum, attempt) => sum + attempt.latencyMs,
        0
      ),
    0
  )
  return {
    wallClockMs: request?.totalLatencyMs ?? null,
    judgeAttemptMs,
    providerAttemptMs,
  }
}

export function aggregateJudgeAttempts(attempts: JudgeAttempt[]) {
  const groups = new Map<string, JudgeAttempt & { count: number }>()
  for (const attempt of attempts) {
    const key = [
      attempt.model,
      attempt.provider,
      attempt.role,
      attempt.status,
      attempt.httpStatus ?? '',
      attempt.backupReason ?? '',
    ].join('\u0000')
    const current = groups.get(key)
    if (current) {
      current.count += 1
      current.latencyMs += attempt.latencyMs
    } else {
      groups.set(key, { ...attempt, count: 1 })
    }
  }
  return [...groups.values()]
}

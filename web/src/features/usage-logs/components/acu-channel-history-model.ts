import type {
  ACUChannelCooldownInterval,
  ACUChannelHistoryRow,
  ACUMonitorRange,
} from '../api'

export type HistoryFilters = {
  model: string
  provider: string
  channel: string
  profile: string
}

export type MonitorChartPoint = {
  bucket: string
  details: ACUChannelHistoryRow[]
  requestCount: number
  rateLimitedCount: number
  serverErrorCount: number
  watchdogCount: number
  recoveryCount: number
  [key: string]: string | number | ACUChannelHistoryRow[]
}

const RANGE_WINDOWS: Record<
  ACUMonitorRange,
  { durationMs: number; bucketMs: number }
> = {
  '1h': { durationMs: 60 * 60 * 1000, bucketMs: 60 * 1000 },
  '6h': { durationMs: 6 * 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  '24h': { durationMs: 24 * 60 * 60 * 1000, bucketMs: 15 * 60 * 1000 },
  '7d': { durationMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
}

export function monitorNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function selectMonitorHistoryRows(
  rows: ACUChannelHistoryRow[],
  filters: HistoryFilters
): ACUChannelHistoryRow[] {
  let scope: ACUChannelHistoryRow['scope_type'] = 'channel'
  if (filters.profile) {
    scope = 'profile'
  } else if (filters.model) {
    scope = 'channel_model'
  }
  return rows.filter(
    (row) =>
      row.scope_type === scope &&
      (!filters.profile || row.execution_profile_id === filters.profile) &&
      (!filters.model || row.canonical_model === filters.model) &&
      (!filters.provider || row.provider === filters.provider) &&
      (!filters.channel || row.channel === filters.channel)
  )
}

export function buildMonitorChartData(
  rows: ACUChannelHistoryRow[],
  range?: ACUMonitorRange,
  nowMs = Date.now()
): MonitorChartPoint[] {
  const buckets = new Map<string, ACUChannelHistoryRow[]>()
  const bucketMs = range ? RANGE_WINDOWS[range].bucketMs : 0
  for (const row of rows) {
    const timestamp = new Date(row.bucket).getTime()
    const bucket =
      bucketMs > 0 && Number.isFinite(timestamp)
        ? new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString()
        : row.bucket
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), row])
  }
  if (range) {
    const { durationMs, bucketMs } = RANGE_WINDOWS[range]
    const endMs = Math.floor(nowMs / bucketMs) * bucketMs
    const startMs = endMs - durationMs
    for (let bucketMsValue = startMs; bucketMsValue <= endMs; bucketMsValue += bucketMs) {
      const bucket = new Date(bucketMsValue).toISOString()
      if (!buckets.has(bucket)) buckets.set(bucket, [])
    }
  }
  return [...buckets.entries()]
    .sort(
      ([left], [right]) => new Date(left).getTime() - new Date(right).getTime()
    )
    .map(([bucket, details]) => {
      const point: MonitorChartPoint = {
        bucket,
        details,
        requestCount: details.reduce(
          (sum, row) => sum + monitorNumber(row.request_count),
          0
        ),
        rateLimitedCount: details.reduce(
          (sum, row) => sum + monitorNumber(row.rate_limited_count),
          0
        ),
        serverErrorCount: details.reduce(
          (sum, row) => sum + monitorNumber(row.server_error_count),
          0
        ),
        watchdogCount: details.reduce(
          (sum, row) => sum + monitorNumber(row.watchdog_count),
          0
        ),
        recoveryCount: details.reduce(
          (sum, row) => sum + monitorNumber(row.recovery_count),
          0
        ),
      }
      for (const row of details) {
        point[`p50:${row.scope_id}`] = monitorNumber(
          row.p50_first_model_event_ms
        )
        point[`p95:${row.scope_id}`] = monitorNumber(
          row.p95_first_model_event_ms
        )
      }
      return point
    })
}

export function boundMonitorWindow(
  pointCount: number,
  start: number,
  end: number
): { start: number; end: number } {
  const maximum = Math.max(0, pointCount - 1)
  const width = Math.max(1, Math.min(maximum, end - start))
  const boundedStart = Math.max(0, Math.min(Math.round(start), maximum - width))
  return {
    start: boundedStart,
    end: Math.min(maximum, boundedStart + width),
  }
}

export function summarizeMonitorRows(rows: ACUChannelHistoryRow[]) {
  const requests = rows.reduce(
    (sum, row) => sum + monitorNumber(row.request_count),
    0
  )
  const successes = rows.reduce(
    (sum, row) => sum + monitorNumber(row.success_count),
    0
  )
  const weighted = (
    key: 'p50_first_model_event_ms' | 'p95_first_model_event_ms'
  ) => {
    const measured = rows.filter((row) => monitorNumber(row[key]) > 0)
    const weight = measured.reduce(
      (sum, row) => sum + monitorNumber(row.request_count),
      0
    )
    return weight
      ? measured.reduce(
          (sum, row) =>
            sum + monitorNumber(row[key]) * monitorNumber(row.request_count),
          0
        ) / weight
      : 0
  }
  return {
    requests,
    successRate: requests ? successes / requests : 0,
    p50: weighted('p50_first_model_event_ms'),
    p95: weighted('p95_first_model_event_ms'),
    watchdog: rows.reduce(
      (sum, row) => sum + monitorNumber(row.watchdog_count),
      0
    ),
    recovery: rows.reduce(
      (sum, row) => sum + monitorNumber(row.recovery_count),
      0
    ),
  }
}

export function selectMonitorCooldownIntervals(
  intervals: ACUChannelCooldownInterval[],
  filters: HistoryFilters
): ACUChannelCooldownInterval[] {
  return intervals.filter(
    (item) =>
      (!filters.provider || item.provider === filters.provider) &&
      (!filters.channel || item.channel === filters.channel) &&
      (!filters.profile || item.execution_profile_id === filters.profile)
  )
}

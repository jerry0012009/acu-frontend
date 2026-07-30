import type { ACUWorkTimelineItem } from '../api'

export type TimelineViewport = { start: number; end: number }

export type TimelineBucket = {
  timestamp: number
  requestCount: number
}

const HOUR_SECONDS = 60 * 60

export function timelineBucketSeconds(hours: number): number {
  if (hours <= 1) return 60
  if (hours <= 6) return 5 * 60
  if (hours <= 24) return 15 * 60
  return HOUR_SECONDS
}

export function buildTimelineBuckets(
  from: number,
  to: number,
  hours: number,
  items: ACUWorkTimelineItem[]
): TimelineBucket[] {
  const bucketSeconds = timelineBucketSeconds(hours)
  const first = Math.floor(from / bucketSeconds) * bucketSeconds
  const last = Math.ceil(to / bucketSeconds) * bucketSeconds
  const counts = new Map<number, number>()
  for (const item of items) {
    const bucket = Math.floor(item.timestamp / bucketSeconds) * bucketSeconds
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  const buckets: TimelineBucket[] = []
  for (let timestamp = first; timestamp <= last; timestamp += bucketSeconds) {
    buckets.push({ timestamp, requestCount: counts.get(timestamp) ?? 0 })
  }
  return buckets
}

export function boundTimelineViewport(
  pointCount: number,
  start: number,
  end: number,
  minimumIntervals = 1
): TimelineViewport {
  const maximum = Math.max(0, pointCount - 1)
  const width = Math.max(
    Math.min(minimumIntervals, maximum),
    Math.min(maximum, Math.round(end - start))
  )
  const boundedStart = Math.max(0, Math.min(Math.round(start), maximum - width))
  return { start: boundedStart, end: Math.min(maximum, boundedStart + width) }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ]
}

export function summarizeTimelineItems(items: ACUWorkTimelineItem[]) {
  const judged = items.filter((item) => item.judgeCalled || item.judgeReused)
  const completed = items.filter((item) =>
    ['completed', 'completed_with_recovery'].includes(item.status)
  )
  const latencies = items
    .map((item) => item.firstModelEventLatencyMs)
    .filter((value) => value > 0)
  return {
    apiSteps: items.length,
    judgeCalls: items.filter((item) => item.judgeCalled).length,
    judgeReuseRate: judged.length
      ? items.filter((item) => item.judgeReused).length / judged.length
      : 0,
    completionRate: items.length ? completed.length / items.length : 0,
    actualTotalCostCny: items.reduce(
      (sum, item) => sum + item.actualCostCny,
      0
    ),
    p50FirstModelEventLatencyMs: percentile(latencies, 0.5),
    p95FirstModelEventLatencyMs: percentile(latencies, 0.95),
  }
}

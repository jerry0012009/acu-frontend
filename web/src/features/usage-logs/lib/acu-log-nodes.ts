import type { UsageLog } from '../data/schema'
import { parseLogOther } from './format'

export function mergeACULogNodes(logs: UsageLog[]): UsageLog[] {
  const groups = new Map<string, UsageLog[]>()
  const passthrough: UsageLog[] = []
  for (const log of logs) {
    const other = parseLogOther(log.other)
    const isACU =
      log.model_name === 'acu-auto' || !!other?.acu_logical_request_id
    if (!isACU || !log.request_id) {
      passthrough.push(log)
      continue
    }
    groups.set(log.request_id, [...(groups.get(log.request_id) ?? []), log])
  }
  const merged = [...passthrough]
  for (const entries of groups.values()) {
    const primary =
      entries.find(
        (entry) => !!parseLogOther(entry.other)?.acu_logical_request_id
      ) ??
      entries.find((entry) => entry.type === 5) ??
      entries[0]
    const other = parseLogOther(primary.other) ?? {}
    const related = entries
      .filter((entry) => entry.id !== primary.id)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        status:
          Number(/status_code=(\d+)/.exec(entry.content)?.[1] ?? 0) ||
          undefined,
        content: entry.content,
        created_at: entry.created_at,
      }))
    merged.push({
      ...primary,
      other: JSON.stringify({ ...other, acu_related_events: related }),
    })
  }
  return merged.sort(
    (left, right) => right.created_at - left.created_at || right.id - left.id
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { api } from '@/lib/api'

import { buildQueryParams } from './lib/query-params'
import type { ACUSessionTrace } from './session-trace-types'
import type {
  GetLogsParams,
  GetLogsResponse,
  GetLogStatsParams,
  GetLogStatsResponse,
  GetMidjourneyLogsParams,
  GetTaskLogsParams,
  UserInfo,
} from './types'

// ============================================================================
// Generic API Helpers
// ============================================================================

function buildApiPath(endpoint: string, isAdmin: boolean): string {
  return isAdmin ? endpoint : `${endpoint}/self`
}

async function fetchLogs<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogsResponse> {
  const paramRecord = params as unknown as Record<string, unknown>
  const queryParams = buildQueryParams({
    p: paramRecord.p || 1,
    page_size: paramRecord.page_size || 20,
    ...params,
  })
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path}?${queryParams}`)
  return res.data
}

async function fetchLogStats<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogStatsResponse> {
  const queryParams = buildQueryParams(
    params as unknown as Record<string, unknown>
  )
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path}/stat?${queryParams}`)
  return res.data
}

// ============================================================================
// Common Log APIs
// ============================================================================

export const getAllLogs = (params: GetLogsParams = {}) =>
  fetchLogs('/api/log', params, true)

export const getUserLogs = (
  params: Omit<GetLogsParams, 'username' | 'channel'> = {}
) => fetchLogs('/api/log', params, false)

export const getLogStats = (params: GetLogStatsParams = {}) =>
  fetchLogStats('/api/log', params, true)

export const getUserLogStats = (
  params: Omit<GetLogStatsParams, 'username' | 'channel'> = {}
) => fetchLogStats('/api/log', params, false)

export async function getACUSessionTrace(identifier: string) {
  const res = await api.get(
    `/api/log/self/acu-session-trace/${encodeURIComponent(identifier)}`
  )
  return res.data as {
    success: boolean
    message?: string
    data?: ACUSessionTrace
  }
}

export type ACUWorkTimelineItem = {
  timestamp: number
  sequence: number
  logicalRequestId: string
  sessionId: string
  taskId: string
  segmentId: string
  judgeCalled: boolean
  judgeReused: boolean
  judgeModel: string
  judgeBackupUsed: boolean
  difficulty: number
  requestedModel: string
  actualModel: string
  provider: string
  channel: string
  status: string
  firstModelEventLatencyMs: number
  endToEndLatencyMs: number
  judgeLatencyMs: number
  providerLatencyMs: number
  actualCostCny: number
  judgeCostCny: number
  providerCostCny: number
  failedAttemptCostCny: number
  errorClass?: string
  cooldownUntil?: string
}

export type ACUWorkTimeline = {
  from: number
  to: number
  summary: {
    apiSteps: number
    judgeCalls: number
    judgeReuseRate: number
    completionRate: number
    actualTotalCostCny: number
    p50FirstModelEventLatencyMs: number
    p95FirstModelEventLatencyMs: number
  }
  items: ACUWorkTimelineItem[]
}

export async function getACUWorkTimeline(from: number, to: number) {
  const res = await api.get(
    `/api/log/self/acu-work-timeline?from=${from}&to=${to}`
  )
  return res.data as {
    success: boolean
    message?: string
    data?: ACUWorkTimeline
  }
}

export type ACUChannelMonitorProfile = {
  executionProfileId: string
  canonicalModel: string
  protocol: string[]
  provider: string
  channel: string
  endpointHost: string
  multiplier: number
  effectiveCostStatus: string
  enabled: boolean
  administratorAllowed: boolean
  routingEligible: boolean
  state: string
  recentSuccessRate: number
  consecutiveFailures: number
  p50FirstModelEventLatencyMs: number
  p95FirstModelEventLatencyMs: number
  lastError: string
  lastSuccessAt: string
  cooldownUntil: string
}

export type ACUChannelMonitor = {
  range: string
  generatedAt: string
  profiles: ACUChannelMonitorProfile[]
  history: Array<Record<string, string | number | null>>
  supplyInventory: Array<Record<string, unknown>>
}

export async function getACUChannelMonitor(range: '1h' | '24h' | '7d') {
  const res = await api.get(`/api/log/acu-channel-monitor?range=${range}`)
  return res.data as {
    success: boolean
    message?: string
    data?: ACUChannelMonitor
  }
}

export async function pauseACUChannel(
  channelId: string,
  durationMinutes: 30 | 120
) {
  const res = await api.post('/api/log/acu-channel-monitor/pause', {
    channelId,
    durationMinutes,
  })
  return res.data as {
    success: boolean
    message?: string
    data?: { channelId: string; state: string; cooldownUntil: string }
  }
}

export async function getUserInfo(
  userId: number
): Promise<{ success: boolean; message?: string; data?: UserInfo }> {
  const res = await api.get(`/api/user/${userId}`)
  return res.data
}

// ============================================================================
// MjProxy (Drawing) Logs API
// ============================================================================

export const getAllMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, true)

export const getUserMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, false)

// ============================================================================
// Task Logs API
// ============================================================================

export const getAllTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, true)

export const getUserTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, false)

import { api } from '@/lib/api'

import type { PrivateACUMemory } from './private-acu-admin-api'

export type PrivateACUUserConfig = {
  observerEnabled: boolean
  advisorEnabled: boolean
  injectionEnabled: boolean
  learningEnabled: boolean
  observerInterval: number | null
  effectiveObserverInterval: number
  globalObserverInterval: number
  usesGlobalObserverInterval: boolean
  globalEnabled: boolean
  globalInjectionEnabled: boolean
  updatedAt?: string
}

export type PrivateACUAdvisor = {
  advisorId: string
  newapiUserId: string
  logicalRequestId: string
  triggerCallCount: number
  needAdvisor: boolean
  status: 'ok' | 'risk' | 'blocked'
  problem: string
  advice?: string
  learn: 'none' | 'candidate'
  relevantSkillIds: string[]
  observerResult?: {
    needAdvisor?: boolean
    problem?: string
  }
  createdAt: string
  userFeedback?: 'helpful' | 'inaccurate' | 'ignored'
  feedbackAt?: string
  sessionId?: string
  referenceStatus?: 'queued' | 'injected' | 'disabled' | 'failed'
  consumedByLogicalRequestId?: string
  consumedAt?: string
}

export type PrivateACUAdvisorNotification = {
  id: number
  advisorId: string
  status: string
  problemSummary: string
  adviceSummary: string
  referenceStatus: string
  targetPath: string
  sourceCreatedAt: string
  readAt?: string
  createdAt: string
}

export type PrivateACUAdvisorNotificationPreferences = {
  inAppEnabled: boolean
  browserEnabled: boolean
  emailEnabled: boolean
  email: string
  emailTarget?: string
}

export type PrivateACULearningRunSelf = {
  runId: string
  learningKind: string
  status: string
  elementCount: number
  skillChangeCount: number
  preferenceChangeCount: number
  receivedAt: string
  completedAt?: string
}

export type PrivateACULearningRunSelfDetail = PrivateACULearningRunSelf & {
  distillation: Record<string, unknown>
  skillChanges: Array<{
    skillId: string
    name: string
    descriptionBefore?: string
    descriptionAfter?: string
    changeType: 'created' | 'updated' | 'unchanged' | 'deleted' | string
    files: Array<{
      path: string
      before: string
      after: string
      diff: string
    }>
  }>
}

export type PrivateACUUsageWindow = {
  window: '24h' | '7d' | '30d'
  calls: number
  userChargeCny: string
  byStage: Record<'learning' | 'observer' | 'advisor', string>
  byStageCalls: Record<'learning' | 'observer' | 'advisor', number>
  totalUserChargeCny: string
  platformChargeCny: string
  adviceCount: number
  helpfulAdviceCount: number
}

type PrivateACUAdvisorListResponse = {
  success: boolean
  message?: string
  data?: {
    advisors: PrivateACUAdvisor[]
  }
}

export async function getPrivateACUAdvisors(
  limit = 100
): Promise<PrivateACUAdvisor[]> {
  const response = await api.get<PrivateACUAdvisorListResponse>(
    `/api/user/self/acu-advisor?limit=${encodeURIComponent(String(limit))}`
  )
  return response.data.data?.advisors ?? []
}

export async function updatePrivateACUAdvisorFeedback(
  advisorId: string,
  feedback: NonNullable<PrivateACUAdvisor['userFeedback']>
): Promise<void> {
  await api.post(
    `/api/user/self/acu-advisor/${encodeURIComponent(advisorId)}/feedback`,
    { feedback }
  )
}

export async function getPrivateACUAdvisorNotifications(limit = 10): Promise<{
  notifications: PrivateACUAdvisorNotification[]
  unreadCount: number
}> {
  const response = await api.get<{
    data: {
      notifications: PrivateACUAdvisorNotification[]
      unreadCount: number
    }
  }>(`/api/user/self/acu-advisor/notifications?limit=${limit}`)
  return response.data.data
}

export async function markPrivateACUAdvisorNotificationRead(
  advisorId: string
): Promise<void> {
  await api.post(
    `/api/user/self/acu-advisor/${encodeURIComponent(advisorId)}/read`
  )
}

export async function markAllPrivateACUAdvisorNotificationsRead(): Promise<void> {
  await api.post('/api/user/self/acu-advisor/notifications/read-all')
}

export async function getPrivateACUAdvisorNotificationPreferences(): Promise<PrivateACUAdvisorNotificationPreferences> {
  const response = await api.get<{
    data: PrivateACUAdvisorNotificationPreferences
  }>('/api/user/self/acu-advisor/notification-preferences')
  return response.data.data
}

export async function getPrivateACUUserConfig(): Promise<PrivateACUUserConfig> {
  const response = await api.get<{
    data: PrivateACUUserConfig
  }>('/api/user/self/acu-advisor/settings')
  return response.data.data
}

export async function updatePrivateACUUserConfig(
  config: Pick<
    PrivateACUUserConfig,
    | 'observerEnabled'
    | 'advisorEnabled'
    | 'injectionEnabled'
    | 'learningEnabled'
    | 'observerInterval'
  >
): Promise<PrivateACUUserConfig> {
  const response = await api.put<{
    data: PrivateACUUserConfig
  }>('/api/user/self/acu-advisor/settings', config)
  return response.data.data
}

export async function updatePrivateACUAdvisorNotificationPreferences(
  preferences: PrivateACUAdvisorNotificationPreferences
): Promise<PrivateACUAdvisorNotificationPreferences> {
  const response = await api.put<{
    data: PrivateACUAdvisorNotificationPreferences
  }>('/api/user/self/acu-advisor/notification-preferences', preferences)
  return response.data.data
}

export async function getPrivateACUMemory(): Promise<PrivateACUMemory> {
  const response = await api.get<{ data: PrivateACUMemory }>(
    '/api/user/self/acu-memory'
  )
  return response.data.data
}

export async function getPrivateACULearningRuns(): Promise<
  PrivateACULearningRunSelf[]
> {
  const response = await api.get<{
    data: { runs: PrivateACULearningRunSelf[] }
  }>('/api/user/self/acu-learning-runs')
  return response.data.data.runs
}

export async function getPrivateACULearningRunDetail(
  runId: string
): Promise<PrivateACULearningRunSelfDetail> {
  const response = await api.get<{
    data: PrivateACULearningRunSelfDetail
  }>(`/api/user/self/acu-learning-runs/${encodeURIComponent(runId)}`)
  return response.data.data
}

export async function getPrivateACUUsageSummary(): Promise<
  PrivateACUUsageWindow[]
> {
  const response = await api.get<{
    data: { windows: PrivateACUUsageWindow[] }
  }>('/api/user/self/acu-private-usage')
  return response.data.data.windows
}

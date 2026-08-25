import { api } from '@/lib/api'

export type PrivateACUPrompts = {
  observerPrompt: string
  advisorPrompt: string
  learningPrompt: string
  enabled: boolean
  promptVersion: number
  source: 'default' | 'database'
  updatedAt?: string
  updatedBy?: string
}

export type PrivateACUMemoryFile = {
  path: string
  mime: string
  content?: string
  url?: string
}

export type PrivateACUMemorySkill = {
  id: string
  name: string
  description: string
  files: PrivateACUMemoryFile[]
}

export type PrivateACUMemory = {
  enabled: boolean
  userId: string
  spaceId?: string
  skills: PrivateACUMemorySkill[]
  internalPrompts?: PrivateACUMemoryPrompt[]
}

export type PrivateACUUsageEntry = {
  ledgerId: string
  logicalRequestId: string
  stage: string
  provider?: string
  model?: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  usageStatus: string
  status: string
  nominalCostUsd: string
  actualCostCny: string
  userChargeCny: string
  billingMarkupMultiplier: number
  billingStatus: string
  billingAttemptCount: number
  billingLastError?: string
  createdAt: string
}

export type PrivateACUUsage = {
  entries: PrivateACUUsageEntry[]
  totals: Array<{
    stage: string
    status: string
    calls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    actualCostCny: string
    userChargeCny: string
  }>
}

export type PrivateACUExperience = {
  experienceId: string
  createdAt: string
  learningCalls: number
  learningSuccesses: number
  advisor?: {
    advisorId: string
    logicalRequestId: string
    createdAt: string
    needAdvisor: boolean
    status: string
    problem: string
    advice?: string
    relevantSkillIds: string[]
  }
}

export type PrivateACUExperienceDetail = {
  experienceId: string
  ledger: PrivateACUUsageEntry[]
  advisor?: PrivateACUExperience['advisor']
}

export type PrivateACUMemoryPrompt = {
  path: string
  mime: string
  content: string
}

export async function getPrivateACUPrompts() {
  const response = await api.get<{ data: PrivateACUPrompts }>(
    '/api/admin/acu-private/prompts'
  )
  return response.data.data
}

export async function savePrivateACUPrompts(
  prompts: Omit<
    PrivateACUPrompts,
    'promptVersion' | 'source' | 'updatedAt' | 'updatedBy'
  >
) {
  const response = await api.put<{ data: PrivateACUPrompts }>(
    '/api/admin/acu-private/prompts',
    prompts
  )
  return response.data.data
}

export async function resetPrivateACUPrompts() {
  const response = await api.post<{ data: PrivateACUPrompts }>(
    '/api/admin/acu-private/prompts/reset'
  )
  return response.data.data
}

export async function getPrivateACUMemory() {
  const response = await api.get<{ data: PrivateACUMemory }>(
    '/api/admin/acu-private/memory'
  )
  return response.data.data
}

export async function getPrivateACUUsage(userId: string, limit = 100) {
  const response = await api.get<PrivateACUUsage>(
    `/api/admin/acu-private/usage?newapiUserId=${encodeURIComponent(userId)}&limit=${limit}`
  )
  return response.data
}

export async function getPrivateACUExperiences(userId: string, limit = 50) {
  const response = await api.get<{ experiences: PrivateACUExperience[] }>(
    `/api/admin/acu-private/experiences?newapiUserId=${encodeURIComponent(userId)}&limit=${limit}`
  )
  return response.data.experiences
}

export async function getPrivateACUExperienceDetail(
  userId: string,
  experienceId: string
) {
  const response = await api.get<{ data: PrivateACUExperienceDetail }>(
    `/api/admin/acu-private/experiences/${encodeURIComponent(experienceId)}?newapiUserId=${encodeURIComponent(userId)}`
  )
  return response.data.data
}

export async function getPrivateACUAdvisors(userId: string, limit = 50) {
  const response = await api.get<{
    advisors: NonNullable<PrivateACUExperience['advisor']>[]
  }>(
    `/api/admin/acu-private/advisors?newapiUserId=${encodeURIComponent(userId)}&limit=${limit}`
  )
  return response.data.advisors
}

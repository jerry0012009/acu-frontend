import { api } from '@/lib/api'

export type PrivateACUPrompts = {
  observerPrompt: string
  advisorPrompt: string
  learningPrompt: string
  learningExamples?: PrivateACUPromptExample[]
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
  promptCards?: PrivateACUPromptCard[]
}

export type PrivateACUFilmStatus = {
  enabled: boolean
  teamScope?: string
  acontextUser?: string
  spaceId?: string
  learningModel?: string
  ingressTokenConfigured: boolean
  imagePolicy?: {
    maxImages: number
    maxInputImageBytes: number
    maxInputTotalBytes: number
    maxModelImageBytes: number
    maxModelTotalBytes: number
    maxImageDimension: number
    outputMimeType: string
    compressionPolicy: 'visual-quality-first'
  }
  lastSubmission?: {
    experienceId: string
    sessionId: string
    submittedAt: string
    imageCount: number
    receivedImageBytes: number
    preparedImageBytes: number
    images: Array<{
      imageIndex: number
      mode: 'unchanged' | 'compressed'
      inputBytes: number
      outputBytes: number
      inputWidth: number
      inputHeight: number
      outputWidth: number
      outputHeight: number
      outputMimeType: string
      quality?: number
    }>
  }
  skills: PrivateACUMemorySkill[]
  promptCards?: PrivateACUPromptCard[]
}

export type PrivateACUPromptCard = {
  id: string
  stage: 'judge' | 'task' | 'distillation' | 'skill_learner'
  title: string
  description: string
  content: string
  language: 'zh-CN' | 'mixed' | 'en'
  source: string
  execution: 'used' | 'bypassed_for_explicit_learning'
  examples?: PrivateACUPromptExample[]
}

export type PrivateACUPromptExample = {
  id: string
  title: string
  origin: 'reference_fixture' | 'captured_run'
  material: {
    text?: string
    json?: unknown
    images?: Array<{
      url: string
      mimeType?: string
      alt?: string
    }>
  }
  artifact: {
    format: 'text' | 'json' | 'markdown' | 'diff'
    content: string | unknown
  }
  sourceUrl?: string
  sourceRunId?: string
}

export type PrivateACUPOCSpaceAccess = {
  key: string
  spaceId: string
  memberUserIds: number[]
  enabled: boolean
}

export type PrivateACUPOCAccess = {
  spaces: PrivateACUPOCSpaceAccess[]
}

export type PrivateACUFilmMemberView = {
  enabled: boolean
  spaces: Array<{
    key: string
    teamScope?: string
    skills: PrivateACUMemorySkill[]
  }>
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

export type PrivateACULearningRun = {
  runId: string
  learningKind: string
  newapiUserId?: string
  teamScope?: string
  spaceId: string
  sessionId: string
  experienceId?: string
  status: string
  elementCount: number
  skillChangeCount: number
  receivedAt: string
  completedAt?: string
  error?: Record<string, unknown>
}

export type PrivateACULearningRuns = {
  runs: PrivateACULearningRun[]
}

export type PrivateACULearningRunDetail = PrivateACULearningRun & {
  taskId?: string
  evidence: Record<string, unknown>
  distillation: Record<string, unknown>
  skillsBefore: PrivateACUMemorySkill[]
  skillsAfter: PrivateACUMemorySkill[]
  skillChanges: Array<{
    skillId: string
    name: string
    descriptionBefore?: string
    descriptionAfter?: string
    changeType: string
    files: Array<{
      path: string
      before: string
      after: string
      diff: string
    }>
  }>
  timeline: Array<Record<string, unknown>>
  media: Array<{
    mediaId: string
    imageIndex: number
    mimeType: string
    filename?: string
    processing?: Record<string, unknown>
    url: string
  }>
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

export async function getPrivateACUMemory(userId = '') {
  const query = userId ? `?newapiUserId=${encodeURIComponent(userId)}` : ''
  const response = await api.get<{ data: PrivateACUMemory }>(
    `/api/admin/acu-private/memory${query}`
  )
  return response.data.data
}

export async function getPrivateACUFilmStatus() {
  const response = await api.get<{ data: PrivateACUFilmStatus }>(
    '/api/admin/acu-private/film'
  )
  return response.data.data
}

export async function getPrivateACUPOCAccess() {
  const response = await api.get<{ data: PrivateACUPOCAccess }>(
    '/api/admin/acu-private/access'
  )
  return response.data.data
}

export async function savePrivateACUPOCAccess(access: PrivateACUPOCAccess) {
  const response = await api.put<{ data: PrivateACUPOCAccess }>(
    '/api/admin/acu-private/access',
    access
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

export async function getPrivateACULearningRuns(
  limit = 100,
  learningKind = ''
) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (learningKind) query.set('learningKind', learningKind)
  const response = await api.get<{ data: PrivateACULearningRuns }>(
    `/api/admin/acu-private/learning-runs?${query.toString()}`
  )
  return response.data.data.runs
}

export async function getPrivateACULearningRunDetail(runId: string) {
  const response = await api.get<{ data: PrivateACULearningRunDetail }>(
    `/api/admin/acu-private/learning-runs/${encodeURIComponent(runId)}`
  )
  return response.data.data
}

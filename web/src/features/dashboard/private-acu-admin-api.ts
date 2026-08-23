import { api } from '@/lib/api'

export type PrivateACUPrompts = {
  observerPrompt: string
  advisorPrompt: string
  learningPrompt: string
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

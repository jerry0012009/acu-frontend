import { api } from '@/lib/api'

export type PreferenceRay = {
  id: string
  label: string
  category: string
  score: number
  confidence: number
  summary: string
  scope: string
  sourceIds: string[]
}

export type PreferenceProfileView = {
  status: 'queued' | 'generating' | 'ready' | 'empty' | 'error'
  profile: {
    summary: string
    rays: PreferenceRay[]
    sourceCount: number
    excluded: Array<{ sourceId: string; reason: string }>
  } | null
  generatedAt: string | null
  error: string | null
}

export async function getPreferenceProfile(): Promise<PreferenceProfileView> {
  const response = await api.get<{
    success: boolean
    data: PreferenceProfileView
  }>('/api/user/self/acu-preference-profile', { skipErrorHandler: true })
  if (!response.data.success || !response.data.data) {
    throw new Error('Preference profile unavailable')
  }
  return response.data.data
}

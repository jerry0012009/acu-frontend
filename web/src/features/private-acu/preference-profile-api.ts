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
  bipolar?: {
    axis_id: string
    schema_version: 'acu-preference-v5-bipolar'
    name: string
    end_a: string
    end_b: string
    position: number
    acceptable_interval: [number, number]
    importance: number
    confidence: number
    applicability: boolean
    origin: 'authorized_initialization' | 'learned' | 'user_explicit'
    evidence: string[]
    scope: { task: string; subtype: string; project: string }
  }
}

export type PreferenceProfileView = {
  status: 'queued' | 'generating' | 'ready' | 'empty' | 'error'
  profile: {
    summary: string
    rays: PreferenceRay[]
    sourceCount: number
    excluded: Array<{ sourceId: string; reason: string }>
    schemaVersion?: string
    acceptanceConditions?: string[]
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

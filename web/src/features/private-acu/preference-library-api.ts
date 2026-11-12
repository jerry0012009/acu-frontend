import { api } from '@/lib/api'

export type PreferenceRecord = { id: string; summary: string }
export type PreferenceChangeEvent = {
  runId: string
  trigger: 'user_dissatisfaction' | 'explicit_user_preference'
  recordedAt: string
  changes: Array<{
    preferenceId: string
    kind: 'created' | 'updated' | 'deleted'
    before: string
    after: string
  }>
}
export type PreferenceActivity = {
  version: 1
  events: PreferenceChangeEvent[]
  inspectedRuns: number
  moreAvailable: boolean
  partial: boolean
}

export async function getPreferenceLibrary(): Promise<{
  version: 1
  records: PreferenceRecord[]
}> {
  const response = await api.get('/api/user/self/acu-preference-library', {
    skipErrorHandler: true,
  })
  if (!response.data.success) throw new Error('Preference records unavailable')
  return response.data.data
}

export async function getPreferenceActivity(): Promise<PreferenceActivity> {
  const response = await api.get('/api/user/self/acu-preference-activity', {
    skipErrorHandler: true,
  })
  if (!response.data.success) throw new Error('Preference activity unavailable')
  return response.data.data
}

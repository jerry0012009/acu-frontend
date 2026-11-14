import { api } from '@/lib/api'

import type { PreferenceRecord } from './preference-library-api'
import type { PreferenceProfileView } from './preference-profile-api'

export type TeamPreferenceSpace = {
  key: string
  view: PreferenceProfileView & {
    profile:
      | (NonNullable<PreferenceProfileView['profile']> & {
          highlights?: Array<{ title: string; summary: string }>
        })
      | null
  }
  records: PreferenceRecord[]
}

export async function getTeamPreferences(): Promise<{
  version: number
  spaces: TeamPreferenceSpace[]
}> {
  const response = await api.get<{
    success: boolean
    data: { version: number; spaces: TeamPreferenceSpace[] }
  }>('/api/user/self/acu-team-preferences', { skipErrorHandler: true })
  if (!response.data.success || response.data.data?.version !== 1) {
    throw new Error('Team preferences unavailable')
  }
  return response.data.data
}

import { api } from '@/lib/api'

import type { PrivateACUFilmMemberView } from './private-acu-admin-api'

export async function getPrivateACUFilmForUser() {
  const response = await api.get<{ data: PrivateACUFilmMemberView }>(
    '/api/user/self/acu-film',
    { skipErrorHandler: true }
  )
  return response.data.data
}

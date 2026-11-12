import { api } from '@/lib/api'

export async function getRuntimeRelease(): Promise<{ version: string }> {
  const response = await api.get('/api/acu-runtime/release', {
    skipErrorHandler: true,
  })
  if (!response.data?.success || !response.data.data?.version) {
    throw new Error('Runtime release lookup unavailable')
  }
  return response.data.data
}

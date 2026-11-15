import { api } from '@/lib/api'

import type { MediaModel, MediaRecord, ReferenceMedia } from './types'

export const mediaHeaders = (token: number) => ({
  'X-ACU-Playground-Token-Id': String(token),
})

export function mediaLocalURL(raw: string): string {
  const address = new URL(raw, location.origin)
  if (
    address.origin !== location.origin &&
    ![
      'acu.best',
      'console.acu.best',
      'console.acucompute.com',
      'api.acucompute.com',
    ].includes(address.hostname)
  ) {
    throw new Error('Invalid media address')
  }
  if (
    !address.pathname.startsWith('/pg/assets/') &&
    !/^\/v1\/videos\/[^/]+\/content$/.test(address.pathname)
  ) {
    throw new Error('Invalid media address')
  }
  return address.pathname + address.search
}

export async function mediaModels(token: number): Promise<MediaModel[]> {
  return (
    await api.get('/pg/media/models', {
      params: { token_id: token },
      headers: mediaHeaders(token),
    })
  ).data.data
}

export async function mediaHistory(token: number): Promise<MediaRecord[]> {
  return (
    await api.get('/pg/media/history', {
      params: { token_id: token },
      headers: mediaHeaders(token),
    })
  ).data.data
}

export async function uploadMedia(
  file: File,
  token: number
): Promise<ReferenceMedia> {
  const body = new FormData()
  body.append('file', file)
  const response = await api.post('/pg/media/assets', body, {
    headers: mediaHeaders(token),
    timeout: 120000,
  })
  if (!response.data.success) throw new Error(response.data.message)
  const asset = response.data.data as {
    url: string
    name: string
    type: 'image' | 'video'
  }
  return {
    ...asset,
    id: crypto.randomUUID(),
    role: asset.type === 'image' ? 'reference_image' : 'reference_video',
  }
}

export async function downloadMedia(url: string, name: string): Promise<void> {
  const response = await api.get(mediaLocalURL(url), {
    responseType: 'blob',
  })
  const object = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = object
  link.download = name
  link.click()
  URL.revokeObjectURL(object)
}

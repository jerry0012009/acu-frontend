export interface MediaModel {
  id: string
  kind: 'image' | 'video'
  sizes: string[]
  resolutions?: string[]
  minSeconds?: number
  maxSeconds?: number
  maxImages: number
  maxVideos: number
  audio: boolean
  frameModes: boolean
  priceCny?: number
}

export interface MediaRecord {
  id: string
  kind: 'image' | 'video'
  model: string
  prompt?: string
  created: number
  status: string
  url: string
  error?: string
}

export interface ReferenceMedia {
  id: string
  url: string
  name: string
  type: 'image' | 'video'
  role: 'reference_image' | 'first_frame' | 'last_frame' | 'reference_video'
}

import { t } from 'i18next'

export const PLAYGROUND_MAX_IMAGE_FILES = 8
export const PLAYGROUND_MAX_INPUT_IMAGE_BYTES = 16 * 1024 * 1024
export const PLAYGROUND_MAX_PREPARED_IMAGE_BYTES = 4 * 1024 * 1024
export const PLAYGROUND_MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024
export const PLAYGROUND_MAX_IMAGE_DIMENSION = 2048

type PreparedImage = {
  file: File
  changed: boolean
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
}

async function compressImage(file: File): Promise<PreparedImage | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(
      1,
      PLAYGROUND_MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    for (const quality of [0.86, 0.74, 0.62, 0.5]) {
      const blob = await canvasBlob(canvas, quality)
      if (blob && blob.size <= PLAYGROUND_MAX_PREPARED_IMAGE_BYTES) {
        return {
          file: new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }),
          changed: true,
        }
      }
    }
  } catch {
    return null
  }

  return null
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (file.size > PLAYGROUND_MAX_INPUT_IMAGE_BYTES) {
    throw new Error(
      t('Image "{{filename}}" exceeds the {{limit}} MB upload limit.', {
        filename: file.name,
        limit: PLAYGROUND_MAX_INPUT_IMAGE_BYTES / 1024 / 1024,
      })
    )
  }

  if (file.size <= PLAYGROUND_MAX_PREPARED_IMAGE_BYTES) {
    return { file, changed: false }
  }

  const compressed = await compressImage(file)
  if (!compressed) {
    throw new Error(
      t('Image "{{filename}}" could not be compressed below {{limit}} MB.', {
        filename: file.name,
        limit: PLAYGROUND_MAX_PREPARED_IMAGE_BYTES / 1024 / 1024,
      })
    )
  }

  return compressed
}

export function dataUrlByteLength(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1).replaceAll(/\s/g, '')
  const unpadded = payload.replace(/=+$/, '')
  return Math.floor((unpadded.length * 3) / 4)
}

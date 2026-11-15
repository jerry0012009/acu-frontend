import { Plus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { uploadMedia } from './api'
import type { MediaModel, ReferenceMedia } from './types'

interface Props {
  model?: MediaModel
  token: number
  items: ReferenceMedia[]
  onChange: (items: ReferenceMedia[]) => void
  onError: (error: unknown) => void
  disabled: boolean
  onUploading: (busy: boolean) => void
}

export function MediaReferences(props: Props) {
  const { t } = useTranslation()
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [url, setUrl] = useState('')
  const [type, setType] = useState<'image' | 'video'>('image')
  const add = (item: ReferenceMedia) => {
    const count = props.items.filter((entry) => entry.type === item.type).length
    const limit =
      item.type === 'image' ? props.model?.maxImages : props.model?.maxVideos
    if (count >= (limit ?? 0)) throw new Error(t('Too many reference files'))
    props.onChange([...props.items, item])
  }
  const upload = async (files: FileList | null) => {
    if (!files) return
    setUploading(true)
    props.onUploading(true)
    try {
      const next = [...props.items]
      for (const file of files) {
        const kind = file.type.startsWith('video/') ? 'video' : 'image'
        const limit =
          kind === 'image' ? props.model?.maxImages : props.model?.maxVideos
        if (next.filter((item) => item.type === kind).length >= (limit ?? 0)) {
          throw new Error(t('Too many reference files'))
        }
        next.push(await uploadMedia(file, props.token))
      }
      props.onChange(next)
    } catch (error) {
      props.onError(error)
    } finally {
      setUploading(false)
      props.onUploading(false)
      if (picker.current) picker.current.value = ''
    }
  }
  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='text-sm font-medium'>{t('Reference media')}</h2>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.disabled || uploading}
          onClick={() => picker.current?.click()}
        >
          <Upload className='size-4' />
          {uploading ? t('Uploading') : t('Upload')}
        </Button>
      </div>
      <input
        ref={picker}
        type='file'
        className='hidden'
        aria-label={t('Upload reference media')}
        accept={
          props.model?.maxVideos
            ? 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime'
            : 'image/png,image/jpeg,image/webp'
        }
        multiple
        onChange={(event) => void upload(event.target.files)}
      />
      <div className='grid grid-cols-2 gap-2'>
        {props.items.map((item) => (
          <div key={item.id} className='min-w-0 rounded-md border p-2'>
            {item.type === 'image' ? (
              <img
                src={item.url}
                alt={item.name}
                className='aspect-video w-full rounded object-contain'
              />
            ) : (
              <video
                src={item.url}
                controls
                preload='metadata'
                className='aspect-video w-full rounded'
              />
            )}
            <div className='mt-2 flex min-w-0 items-center gap-1'>
              <span className='min-w-0 flex-1 truncate text-xs'>
                {item.name}
              </span>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                title={t('Remove')}
                aria-label={t('Remove')}
                disabled={props.disabled}
                onClick={() =>
                  props.onChange(
                    props.items.filter((entry) => entry.id !== item.id)
                  )
                }
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
            {item.type === 'image' && props.model?.frameModes && (
              <select
                aria-label={t('Image role')}
                className='bg-background mt-1 w-full rounded-md border p-1 text-xs'
                value={item.role}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onChange(
                    props.items.map((entry) =>
                      entry.id === item.id
                        ? {
                            ...entry,
                            role: event.target.value as ReferenceMedia['role'],
                          }
                        : entry
                    )
                  )
                }
              >
                <option value='reference_image'>{t('Reference image')}</option>
                <option value='first_frame'>{t('First frame')}</option>
                <option value='last_frame'>{t('Last frame')}</option>
              </select>
            )}
          </div>
        ))}
      </div>
      {props.model?.maxVideos ? (
        <div className='flex items-center gap-2'>
          <select
            aria-label={t('Media type')}
            className='bg-background h-9 rounded-md border px-2 text-xs'
            value={type}
            onChange={(event) =>
              setType(event.target.value as 'image' | 'video')
            }
          >
            <option value='image'>{t('Image')}</option>
            <option value='video'>{t('Video')}</option>
          </select>
          <Input
            aria-label={t('Reference URL')}
            placeholder='https://'
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            type='button'
            size='icon'
            variant='outline'
            title={t('Add URL')}
            aria-label={t('Add URL')}
            disabled={props.disabled || !url}
            onClick={() => {
              try {
                const parsed = new URL(url)
                if (parsed.protocol !== 'https:') {
                  throw new Error(t('An HTTPS URL is required'))
                }
                add({
                  id: crypto.randomUUID(),
                  url,
                  name: parsed.pathname.split('/').pop() || type,
                  type,
                  role:
                    type === 'image' ? 'reference_image' : 'reference_video',
                })
                setUrl('')
              } catch (error) {
                props.onError(error)
              }
            }}
          >
            <Plus className='size-4' />
          </Button>
        </div>
      ) : null}
    </section>
  )
}

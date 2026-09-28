import {
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { uploadAcuQuickStartMedia } from '../api'
import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type TutorialMedia = {
  id: number
  type: 'image' | 'video'
  title: string
  description: string
  url: string
  poster: string
  sortOrder: number
}

type AcuQuickStartMediaSectionProps = {
  enabled: boolean
  data: string
}

function parseTutorialMedia(data: string): TutorialMedia[] {
  try {
    const parsed = JSON.parse(data || '[]')
    if (!Array.isArray(parsed)) return []

    return parsed.map((item, index) => ({
      id: Number(item.id) || index + 1,
      type: item.type === 'video' ? 'video' : 'image',
      title: String(item.title || ''),
      description: String(item.description || ''),
      url: String(item.url || ''),
      poster: String(item.poster || ''),
      sortOrder: Number(item.sortOrder) || index + 1,
    }))
  } catch {
    return []
  }
}

export function AcuQuickStartMediaSection(
  props: AcuQuickStartMediaSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [items, setItems] = useState<TutorialMedia[]>([])
  const [isEnabled, setIsEnabled] = useState(props.enabled)
  const [hasChanges, setHasChanges] = useState(false)
  const [uploadingId, setUploadingId] = useState<number | null>(null)

  useEffect(() => {
    setItems(parseTutorialMedia(props.data))
    setHasChanges(false)
  }, [props.data])

  useEffect(() => {
    setIsEnabled(props.enabled)
  }, [props.enabled])

  const addItem = (type: TutorialMedia['type']) => {
    const nextId = Math.max(0, ...items.map((item) => item.id)) + 1
    setItems((current) => [
      ...current,
      {
        id: nextId,
        type,
        title: '',
        description: '',
        url: '',
        poster: '',
        sortOrder: current.length + 1,
      },
    ])
    setHasChanges(true)
  }

  const updateItem = (
    id: number,
    field: keyof TutorialMedia,
    value: string | number
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
    setHasChanges(true)
  }

  const removeItem = (id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
    setHasChanges(true)
  }

  const handleUpload = async (id: number, file: File | undefined) => {
    if (!file) return

    setUploadingId(id)
    try {
      const result = await uploadAcuQuickStartMedia(file)
      if (!result.success || !result.data) return

      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                type: result.data?.type ?? item.type,
                title: item.title || file.name,
                url: result.data?.url ?? item.url,
              }
            : item
        )
      )
      setHasChanges(true)
    } finally {
      setUploadingId(null)
    }
  }

  const handleToggleEnabled = async (checked: boolean) => {
    const result = await updateOption.mutateAsync({
      key: 'console_setting.acu_quick_start_enabled',
      value: checked,
    })
    if (result.success) {
      setIsEnabled(checked)
    }
  }

  const handleSave = async () => {
    if (items.some((item) => !item.url.trim())) {
      toast.error(t('Each tutorial item requires a media URL.'))
      return
    }

    const result = await updateOption.mutateAsync({
      key: 'console_setting.acu_quick_start_media',
      value: JSON.stringify(items),
    })
    if (result.success) {
      setHasChanges(false)
      toast.success(t('ACU setup tutorial saved'))
    }
  }

  return (
    <SettingsSection title={t('ACU Setup Tutorial')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' onClick={() => addItem('image')}>
              <Plus className='size-4' />
              <ImageIcon className='size-4' />
              {t('Add image')}
            </Button>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => addItem('video')}
            >
              <Plus className='size-4' />
              <Video className='size-4' />
              {t('Add video')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={!hasChanges || updateOption.isPending}
              onClick={handleSave}
            >
              <Save className='size-4' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <SettingsSwitchField
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            label={t('Enabled')}
            className='py-0'
          />
        </div>

        <p className='text-muted-foreground text-sm'>
          {t(
            'These images and videos appear in the WorkBuddy setup guide. Use public HTTPS URLs; videos may also include a poster image.'
          )}
        </p>

        {items.length === 0 ? (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center border-y text-sm'>
            {t('No tutorial media configured.')}
          </div>
        ) : (
          <div className='space-y-3'>
            {items.map((item, index) => (
              <div
                key={item.id}
                className='grid gap-3 rounded-lg border p-3 lg:grid-cols-[120px_minmax(0,1fr)_88px_36px]'
              >
                <div className='space-y-2'>
                  <label className='text-muted-foreground text-xs'>
                    {t('Media type')}
                  </label>
                  <Select
                    value={item.type}
                    onValueChange={(value) =>
                      updateItem(
                        item.id,
                        'type',
                        value === 'video' ? 'video' : 'image'
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='image'>{t('Image')}</SelectItem>
                      <SelectItem value='video'>{t('Video')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='space-y-2 text-xs'>
                    <span className='text-muted-foreground'>{t('Title')}</span>
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        updateItem(item.id, 'title', event.target.value)
                      }
                      placeholder={t('Step {{number}}', {
                        number: index + 1,
                      })}
                    />
                  </label>
                  <div className='space-y-2 text-xs'>
                    <span className='text-muted-foreground'>
                      {t('Media URL')}
                    </span>
                    <span className='flex gap-2'>
                      <Input
                        value={item.url}
                        onChange={(event) =>
                          updateItem(item.id, 'url', event.target.value)
                        }
                        placeholder='https://...'
                      />
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        disabled={uploadingId === item.id}
                        onClick={() =>
                          document
                            .getElementById(`acu-media-upload-${item.id}`)
                            ?.click()
                        }
                        aria-label={t('Upload')}
                        title={t('Upload')}
                      >
                        {uploadingId === item.id ? (
                          <Loader2 className='size-4 animate-spin' />
                        ) : (
                          <Upload className='size-4' />
                        )}
                      </Button>
                      <input
                        id={`acu-media-upload-${item.id}`}
                        type='file'
                        className='hidden'
                        accept={
                          item.type === 'video'
                            ? 'video/mp4,video/webm,video/quicktime'
                            : 'image/png,image/jpeg,image/webp,image/gif'
                        }
                        onChange={(event) => {
                          void handleUpload(item.id, event.target.files?.[0])
                          event.target.value = ''
                        }}
                      />
                    </span>
                  </div>
                  <label className='space-y-2 text-xs sm:col-span-2'>
                    <span className='text-muted-foreground'>
                      {t('Description')}
                    </span>
                    <Textarea
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.id, 'description', event.target.value)
                      }
                      rows={2}
                    />
                  </label>
                  {item.type === 'video' ? (
                    <label className='space-y-2 text-xs sm:col-span-2'>
                      <span className='text-muted-foreground'>
                        {t('Poster image URL')}
                      </span>
                      <Input
                        value={item.poster}
                        onChange={(event) =>
                          updateItem(item.id, 'poster', event.target.value)
                        }
                        placeholder='https://...'
                      />
                    </label>
                  ) : null}
                </div>

                <label className='space-y-2 text-xs'>
                  <span className='text-muted-foreground'>
                    {t('Sort order')}
                  </span>
                  <Input
                    type='number'
                    min={0}
                    value={item.sortOrder}
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        'sortOrder',
                        Number(event.target.value)
                      )
                    }
                  />
                </label>

                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='self-end text-red-500'
                  onClick={() => removeItem(item.id)}
                  aria-label={t('Delete tutorial item')}
                  title={t('Delete tutorial item')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  )
}

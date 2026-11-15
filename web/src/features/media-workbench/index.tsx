import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getACUConversationOptions } from '@/features/playground/api'
import { ConversationKeyEmpty } from '@/features/playground/components/conversation-key-empty'
import { ConversationTabs } from '@/features/playground/components/conversation-tabs'
import { PlaygroundApiKeySelector } from '@/features/playground/components/input/playground-api-key-selector'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  downloadMedia,
  mediaHeaders,
  mediaHistory,
  mediaModels,
  mediaLocalURL,
} from './api'
import { MediaVideoPreview } from './media-preview'
import { MediaReferences } from './media-references'
import type { MediaRecord, ReferenceMedia } from './types'

export function MediaWorkbench(props: { kind: 'image' | 'video' }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const [token, setToken] = useState(0)
  const [modelId, setModel] = useState('')
  const [size, setSize] = useState('')
  const [resolution, setResolution] = useState('')
  const [seconds, setSeconds] = useState(4)
  const [audio, setAudio] = useState(false)
  const [format, setFormat] = useState('mp4')
  const [uploading, setUploading] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<ReferenceMedia[]>([])
  const [selected, setSelected] = useState<MediaRecord | null>(null)
  const [estimateBody, setEstimateBody] = useState<Record<
    string,
    unknown
  > | null>(null)
  const options = useQuery({
    queryKey: ['media-options', user, token],
    queryFn: () => getACUConversationOptions(token || null),
  })
  const selectedToken = options.data?.selectedTokenId || 0
  const models = useQuery({
    queryKey: ['media-models', user, selectedToken],
    queryFn: () => mediaModels(selectedToken),
    enabled: selectedToken > 0,
  })
  const history = useQuery({
    queryKey: ['media-history', user, selectedToken],
    queryFn: () => mediaHistory(selectedToken),
    enabled: selectedToken > 0,
    refetchInterval: (query) =>
      query.state.data?.some(
        (item) => !['completed', 'failed'].includes(item.status)
      )
        ? 5000
        : false,
  })
  const candidates =
    models.data?.filter((item) => item.kind === props.kind) ?? []
  const model = candidates.find((item) => item.id === modelId) ?? candidates[0]
  useEffect(() => {
    if (props.kind !== 'video' || !model) {
      setEstimateBody(null)
      return
    }
    const timer = setTimeout(() => {
      const metadata: Record<string, unknown> = {}
      let videoSize = size
      if (model.frameModes) {
        metadata.resolution = resolution
        metadata.ratio = size
        metadata.generate_audio = audio
        if (model.id === 'doubao-seedance-2.5') metadata.output_format = format
        if (refs.length) {
          metadata.content = refs.map((item) => ({
            type: `${item.type}_url`,
            [`${item.type}_url`]: { url: item.url },
            role: item.role,
          }))
        }
      } else {
        const short = Number.parseInt(resolution)
        const long = Math.round((short * 16) / 9)
        videoSize = `${long}x${short}`
        if (size === '9:16') videoSize = `${short}x${long}`
        if (size === '1:1') videoSize = '1:1'
      }
      setEstimateBody({
        model: model.id,
        prompt: prompt.trim() || 'Estimate',
        seconds: String(seconds),
        size: videoSize,
        metadata,
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [
    props.kind,
    model,
    size,
    resolution,
    audio,
    seconds,
    refs,
    prompt,
    format,
  ])
  const estimate = useQuery({
    queryKey: ['media-estimate', user, selectedToken, estimateBody],
    queryFn: async () =>
      (
        await api.post('/pg/videos/estimate', estimateBody, {
          headers: mediaHeaders(selectedToken),
          skipErrorHandler: true,
        })
      ).data.data as { priceCny: number },
    enabled: selectedToken > 0 && estimateBody !== null,
    retry: false,
  })
  const error = (value: unknown) =>
    toast.error(value instanceof Error ? value.message : t('Generation failed'))
  useEffect(() => {
    setSelected(null)
    setRefs([])
  }, [user, props.kind])
  useEffect(() => {
    if (!model) return
    setSize(model.sizes[0] ?? '')
    setResolution(model.resolutions?.[0] ?? '')
    setSeconds(Math.max(model.minSeconds ?? 1, 4))
    setAudio(false)
    setRefs([])
  }, [model])
  const records = history.data?.filter((item) => item.kind === props.kind) ?? []
  const active =
    history.data?.find((item) => item.id === selected?.id) ??
    selected ??
    records[0]
  const generate = useMutation({
    mutationFn: async () => {
      if (!model || !selectedToken || !prompt.trim()) {
        throw new Error(t('Enter a prompt'))
      }
      if (props.kind === 'image') {
        let body: FormData | Record<string, unknown> = {
          model: model.id,
          prompt,
          size,
          n: 1,
          response_format: 'b64_json',
        }
        let path = '/pg/images/generations'
        if (refs.length) {
          const form = new FormData()
          for (const [key, value] of Object.entries(body)) {
            form.append(key, String(value))
          }
          for (const ref of refs) {
            const response = await api.get(mediaLocalURL(ref.url), {
              responseType: 'blob',
            })
            form.append('image[]', response.data, ref.name)
          }
          body = form
          path = '/pg/images/edits'
        }
        const response = await api.post(path, body, {
          headers: mediaHeaders(selectedToken),
          timeout: 600000,
        })
        const data = response.data.data as { url?: string }[] | undefined
        if (!data?.[0]?.url) {
          throw new Error(
            response.data.error?.message || t('No image returned')
          )
        }
        return {
          id:
            new URL(data[0].url, location.origin).pathname.split('/').pop() ||
            crypto.randomUUID(),
          kind: 'image',
          model: model.id,
          prompt,
          created: Date.now() / 1000,
          status: 'completed',
          url: data[0].url,
        } as MediaRecord
      }
      const metadata: Record<string, unknown> = {}
      if (model.frameModes) {
        metadata.resolution = resolution
        metadata.ratio = size
        metadata.generate_audio = audio
        if (model.id === 'doubao-seedance-2.5') metadata.output_format = format
        if (refs.length) {
          metadata.content = refs.map((item) => ({
            type: `${item.type}_url`,
            [`${item.type}_url`]: { url: item.url },
            role: item.role,
          }))
        }
      }
      let videoSize = size
      if (!model.frameModes) {
        const short = Number.parseInt(resolution)
        const long = Math.round((short * 16) / 9)
        videoSize = `${long}x${short}`
        if (size === '9:16') videoSize = `${short}x${long}`
        if (size === '1:1') videoSize = '1:1'
      }
      const body: Record<string, unknown> = {
        model: model.id,
        prompt,
        size: videoSize,
        seconds: String(seconds),
        metadata,
      }
      if (!model.frameModes && refs.length) {
        const response = await api.get(mediaLocalURL(refs[0].url), {
          responseType: 'blob',
        })
        const blob: Blob = response.data
        body.images = [
          await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener(
              'load',
              () => resolve(String(reader.result)),
              { once: true }
            )
            reader.addEventListener('error', reject, { once: true })
            reader.readAsDataURL(blob)
          }),
        ]
      }
      const response = await api.post('/pg/videos', body, {
        headers: mediaHeaders(selectedToken),
        timeout: 120000,
      })
      if (!response.data.id) {
        throw new Error(response.data.error?.message || t('Generation failed'))
      }
      return {
        id: response.data.id,
        kind: 'video',
        model: model.id,
        prompt,
        created: Date.now() / 1000,
        status: 'queued',
        url: `/v1/videos/${response.data.id}/content`,
      } as MediaRecord
    },
    onSuccess: (item) => {
      setSelected(item)
      void client.invalidateQueries({ queryKey: ['media-history', user] })
    },
    onError: error,
  })
  const busy = generate.isPending || uploading
  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6'>
      <ConversationTabs />
      {!options.isPending && options.data?.tokens.length === 0 && (
        <ConversationKeyEmpty />
      )}
      <header className='mb-5 flex items-center justify-between gap-3'>
        <h1 className='text-xl font-semibold'>
          {props.kind === 'image'
            ? t('Image generation')
            : t('Video generation')}
        </h1>
        <PlaygroundApiKeySelector
          tokens={options.data?.tokens ?? []}
          selectedTokenId={selectedToken}
          onTokenChange={(id) => {
            setToken(id)
            setSelected(null)
            setRefs([])
          }}
          disabled={busy}
        />
      </header>
      {(options.isError || models.isError || history.isError) && (
        <p role='alert' className='text-destructive mb-3 text-sm'>
          {t('Unable to load generation options')}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              void options.refetch()
              void models.refetch()
              void history.refetch()
            }}
          >
            {t('Retry')}
          </Button>
        </p>
      )}
      <div className='grid min-w-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]'>
        <form
          className='min-w-0 space-y-5'
          onSubmit={(event) => {
            event.preventDefault()
            generate.mutate()
          }}
        >
          <label className='block space-y-2 text-sm'>
            <span>{t('Model')}</span>
            <select
              className='bg-background h-10 w-full min-w-0 rounded-md border px-3 text-sm'
              value={model?.id ?? ''}
              disabled={busy || !candidates.length}
              onChange={(event) => setModel(event.target.value)}
            >
              {!candidates.length && (
                <option>
                  {models.isLoading ? t('Loading') : t('No available models')}
                </option>
              )}
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>
          <label className='block space-y-2 text-sm'>
            <span>{t('Prompt')}</span>
            <Textarea
              aria-label={t('Prompt')}
              className='min-h-36 resize-y'
              value={prompt}
              maxLength={32000}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <div className='grid grid-cols-2 gap-3'>
            <label className='space-y-2 text-sm'>
              <span>{t('Aspect ratio / size')}</span>
              <select
                aria-label={t('Aspect ratio / size')}
                className='bg-background h-10 w-full rounded-md border px-2'
                disabled={busy}
                value={size}
                onChange={(event) => setSize(event.target.value)}
              >
                {model?.sizes.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {props.kind === 'video' && (
              <label className='space-y-2 text-sm'>
                <span>{t('Resolution')}</span>
                <select
                  aria-label={t('Resolution')}
                  className='bg-background h-10 w-full rounded-md border px-2'
                  disabled={busy}
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                >
                  {model?.resolutions?.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {props.kind === 'video' && (
            <div className='flex items-center justify-between gap-3'>
              <label className='flex items-center gap-3 text-sm'>
                {t('Duration (seconds)')}
                <input
                  aria-label={t('Duration (seconds)')}
                  type='number'
                  className='bg-background h-9 w-20 rounded-md border px-2'
                  min={model?.minSeconds}
                  max={model?.maxSeconds}
                  value={seconds}
                  disabled={busy}
                  onChange={(event) => setSeconds(Number(event.target.value))}
                />
              </label>
              {model?.audio && (
                <label className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={audio}
                    disabled={busy}
                    onChange={(event) => setAudio(event.target.checked)}
                  />
                  {t('Audio')}
                </label>
              )}
            </div>
          )}
          {model?.id === 'doubao-seedance-2.5' && (
            <label className='flex items-center justify-between gap-3 text-sm'>
              {t('Output format')}
              <select
                aria-label={t('Output format')}
                className='bg-background rounded-md border p-2'
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value='mp4'>MP4</option>
                <option value='mov'>MOV</option>
              </select>
            </label>
          )}
          <MediaReferences
            model={model}
            token={selectedToken}
            items={refs}
            onChange={setRefs}
            onError={error}
            disabled={busy || !model}
            onUploading={setUploading}
          />
          {props.kind === 'video' && estimate.data && (
            <p className='text-sm tabular-nums'>
              {t('Estimated cost')}: ¥{estimate.data.priceCny.toFixed(4)}
            </p>
          )}
          {props.kind === 'image' && model?.priceCny != null && (
            <p className='text-sm tabular-nums'>
              {t('Estimated cost')}: ¥{model.priceCny.toFixed(4)}
            </p>
          )}
          <Button
            className='w-full'
            type='submit'
            disabled={busy || !model || !prompt.trim() || !selectedToken}
          >
            {busy ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Sparkles className='size-4' />
            )}
            {busy ? t('Generating') : t('Generate')}
          </Button>
        </form>
        <section
          className='min-w-0 space-y-4'
          aria-label={t('Generation result')}
        >
          <div className='bg-muted/20 flex min-h-80 items-center justify-center overflow-hidden rounded-md border lg:min-h-[480px]'>
            {!active && (
              <div className='text-muted-foreground'>
                {props.kind === 'image' ? (
                  <ImagePlus className='size-10' />
                ) : (
                  <Film className='size-10' />
                )}
              </div>
            )}
            {active?.status === 'completed' && active.kind === 'image' && (
              <img
                src={active.url}
                alt={active.prompt || t('Generated image')}
                className='max-h-[70vh] w-full object-contain'
              />
            )}
            {active?.status === 'completed' && active.kind === 'video' && (
              <MediaVideoPreview key={active.id} url={active.url} />
            )}
            {active && !['completed', 'failed'].includes(active.status) && (
              <div className='flex items-center gap-2 text-sm'>
                <Loader2 className='size-5 animate-spin' />
                {t('Video is generating')}
              </div>
            )}
            {active?.status === 'failed' && (
              <p role='alert' className='text-destructive p-5 text-sm'>
                {active.error || t('Generation failed')}
              </p>
            )}
          </div>
          {active && (
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <span className='text-muted-foreground min-w-0 text-xs break-all'>
                {active.model}
              </span>
              {active.prompt && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setPrompt(active.prompt || '')}
                >
                  {t('Reuse prompt')}
                </Button>
              )}
              {active.kind === 'image' && active.status === 'completed' && (
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={busy}
                  onClick={() => {
                    setRefs([
                      {
                        id: crypto.randomUUID(),
                        name: active.id,
                        url: active.url,
                        type: 'image',
                        role: 'reference_image',
                      },
                    ])
                    if (active.prompt) setPrompt(active.prompt)
                  }}
                >
                  {t('Use as reference')}
                </Button>
              )}
              {active.status === 'completed' && (
                <Button
                  variant='outline'
                  onClick={() =>
                    void downloadMedia(
                      active.url,
                      `${active.model}.${active.kind === 'video' ? 'mp4' : 'png'}`
                    ).catch(error)
                  }
                >
                  <Download className='size-4' />
                  {t('Download')}
                </Button>
              )}
            </div>
          )}
          <div className='flex items-center justify-between'>
            <h2 className='text-sm font-medium'>{t('Recent generations')}</h2>
            <Button
              variant='ghost'
              size='icon'
              title={t('Refresh')}
              aria-label={t('Refresh')}
              onClick={() => void history.refetch()}
            >
              <RefreshCw className='size-4' />
            </Button>
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            {records.map((item) => (
              <button
                type='button'
                key={item.id}
                className='focus-visible:ring-ring min-w-0 overflow-hidden rounded-md border text-left focus-visible:ring-2'
                onClick={() => setSelected(item)}
                aria-pressed={active?.id === item.id}
              >
                {item.kind === 'image' && item.status === 'completed' ? (
                  <img
                    src={item.url}
                    alt={item.prompt || item.model}
                    loading='lazy'
                    className='aspect-video w-full object-cover'
                  />
                ) : (
                  <div className='bg-muted/30 flex aspect-video items-center justify-center'>
                    <Film className='text-muted-foreground size-6' />
                  </div>
                )}
                <div className='space-y-1 p-2'>
                  <p className='truncate text-xs'>{item.model}</p>
                  <p className='text-muted-foreground text-xs'>
                    {t(item.status)} ·{' '}
                    {new Date(item.created * 1000).toLocaleTimeString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

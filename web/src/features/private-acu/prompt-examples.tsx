import { ExternalLink, Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import type { PrivateACUPromptExample } from '@/features/dashboard/private-acu-admin-api'

function formatExampleValue(value: unknown): string {
  if (typeof value === 'string') return value
  const formatted = JSON.stringify(value, null, 2)
  return formatted ?? String(value)
}

function ExampleImage(props: {
  image: NonNullable<PrivateACUPromptExample['material']['images']>[number]
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className='bg-muted/30 text-muted-foreground flex aspect-[4/3] items-center justify-center rounded-md p-3 text-center text-xs'>
        {t('Sample image unavailable')}
      </div>
    )
  }
  return (
    <div className='bg-muted/20 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md'>
      <img
        src={props.image.url}
        alt={props.image.alt || t('Prompt example image')}
        loading='lazy'
        referrerPolicy='no-referrer'
        className='max-h-full w-full object-contain'
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function ExampleValue(props: {
  label: string
  value: unknown
  muted?: boolean
}) {
  return (
    <div className='space-y-1.5'>
      <h6 className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
        {props.label}
      </h6>
      <pre
        className={`bg-muted/30 max-h-64 overflow-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap ${
          props.muted ? 'text-muted-foreground' : ''
        }`}
      >
        {formatExampleValue(props.value)}
      </pre>
    </div>
  )
}

function ExampleMaterial(props: {
  material: PrivateACUPromptExample['material']
}) {
  const { t } = useTranslation()
  const hasImages = Boolean(props.material.images?.length)
  const hasText =
    typeof props.material.text === 'string' && props.material.text.length > 0
  const hasJson = props.material.json !== undefined
  if (!hasImages && !hasText && !hasJson) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('No material example')}
      </p>
    )
  }
  return (
    <div className='space-y-3'>
      {hasImages && (
        <div className='grid gap-2 sm:grid-cols-2'>
          {props.material.images?.map((image) => (
            <ExampleImage key={image.url} image={image} />
          ))}
        </div>
      )}
      {hasText && (
        <ExampleValue label={t('Text')} value={props.material.text} />
      )}
      {hasJson && <ExampleValue label='JSON' value={props.material.json} />}
    </div>
  )
}

function ExampleArtifact(props: {
  artifact: PrivateACUPromptExample['artifact']
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <Badge variant='outline'>{props.artifact.format}</Badge>
        <span className='text-muted-foreground text-xs'>
          {t('Example output')}
        </span>
      </div>
      <ExampleValue
        label={props.label || t('Artifact')}
        value={props.artifact.content}
      />
    </div>
  )
}

export function PromptExamples(props: {
  examples?: PrivateACUPromptExample[]
  materialLabel?: string
  artifactLabel?: string
  hideArtifact?: boolean
}) {
  const { t } = useTranslation()
  if (!props.examples?.length) return null
  return (
    <section className='border-border space-y-3 border-t pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <ImageIcon
            className='text-muted-foreground size-4'
            aria-hidden='true'
          />
          <h5 className='text-sm font-semibold'>{t('Step examples')}</h5>
        </div>
        <Badge variant='secondary' className='text-[10px]'>
          {props.examples.length}
        </Badge>
      </div>
      <div className='divide-border divide-y'>
        {props.examples.map((example) => (
          <article
            key={example.id}
            className='space-y-3 py-3 first:pt-0 last:pb-0'
          >
            <header className='flex flex-wrap items-start justify-between gap-2'>
              <div className='min-w-0'>
                <h6 className='text-sm font-medium'>{example.title}</h6>
                <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs'>
                  <Badge variant='outline' className='text-[10px]'>
                    {example.origin === 'captured_run'
                      ? t('Captured run')
                      : t('Reference fixture')}
                  </Badge>
                  {example.sourceRunId ? (
                    <span className='font-mono'>{example.sourceRunId}</span>
                  ) : null}
                  {example.sourceUrl ? (
                    <a
                      href={example.sourceUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='text-primary inline-flex items-center gap-1 hover:underline'
                    >
                      {t('Source')}
                      <ExternalLink className='size-3' aria-hidden='true' />
                    </a>
                  ) : null}
                </div>
              </div>
            </header>
            <div
              className={`grid gap-4 ${
                props.hideArtifact ? '' : 'lg:grid-cols-2'
              }`}
            >
              <div className='space-y-2'>
                <h6 className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                  {props.materialLabel || t('Material example')}
                </h6>
                <ExampleMaterial material={example.material} />
              </div>
              {!props.hideArtifact && (
                <div className='space-y-2'>
                  <h6 className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                    {props.artifactLabel || t('Artifact example')}
                  </h6>
                  <ExampleArtifact
                    artifact={example.artifact}
                    label={props.artifactLabel}
                  />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

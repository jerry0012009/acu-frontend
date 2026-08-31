import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { api } from '@/lib/api'

import {
  getPrivateACULearningRunDetail,
  getPrivateACULearningRuns,
  type PrivateACULearningRunDetail,
} from '../../private-acu-admin-api'

function JsonBlock(props: { value: unknown }) {
  return (
    <pre className='bg-muted/30 max-h-80 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
      {JSON.stringify(props.value, null, 2)}
    </pre>
  )
}

function SkillSnapshot(props: {
  title: string
  skills: PrivateACULearningRunDetail['skillsBefore']
}) {
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>{props.title}</h3>
      {props.skills.length ? (
        props.skills.map((skill) => (
          <details key={`${props.title}-${skill.id}`} className='border-border rounded-md border p-3'>
            <summary className='cursor-pointer text-sm'>
              {skill.name} · {skill.description}
            </summary>
            {skill.files.map((file) => (
              <pre key={file.path} className='bg-muted/30 mt-2 overflow-auto p-2 text-xs whitespace-pre-wrap'>
                {file.path}
                {'\n\n'}
                {file.content || ''}
              </pre>
            ))}
          </details>
        ))
      ) : (
        <div className='text-muted-foreground text-xs'>-</div>
      )}
    </section>
  )
}

function LearningRunMediaPreview(props: {
  media: PrivateACULearningRunDetail['media'][number]
}) {
  const { t } = useTranslation()
  const mediaQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'learning-run-media', props.media.mediaId],
    queryFn: async () => {
      const response = await api.get<Blob>(props.media.url, {
        responseType: 'blob',
        skipErrorHandler: true,
      })
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })
  const [previewUrl, setPreviewUrl] = useState<string>()

  useEffect(() => {
    if (!mediaQuery.data) {
      setPreviewUrl(undefined)
      return
    }
    const url = URL.createObjectURL(mediaQuery.data)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [mediaQuery.data])

  return (
    <figure className='space-y-1'>
      <div className='bg-muted/20 flex min-h-32 items-center justify-center rounded-md'>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={props.media.filename || `#${props.media.imageIndex}`}
            className='max-h-56 w-full rounded-md object-contain'
          />
        ) : (
          <span className='text-muted-foreground text-xs'>
            {mediaQuery.isError ? t('Failed to load') : t('Loading')}
          </span>
        )}
      </div>
      <figcaption className='text-muted-foreground text-xs'>
        #{props.media.imageIndex} · {props.media.mimeType}
      </figcaption>
    </figure>
  )
}

function RunDetail(props: { detail?: PrivateACULearningRunDetail; loading: boolean }) {
  const { t } = useTranslation()
  if (props.loading) return <div className='text-muted-foreground'>{t('Loading')}</div>
  if (!props.detail) return <div className='text-muted-foreground'>{t('No details')}</div>
  const detail = props.detail
  return (
    <div className='space-y-5 overflow-y-auto px-4 pb-6'>
      <section className='flex flex-wrap gap-2 text-xs'>
        <Badge variant='outline'>{detail.status}</Badge>
        <Badge variant='outline'>{detail.learningKind}</Badge>
        <span className='text-muted-foreground'>{detail.receivedAt}</span>
      </section>
      <section className='space-y-2'>
        <h3 className='font-medium'>{t('Original evidence')}</h3>
        <JsonBlock value={detail.evidence} />
      </section>
      {detail.media.length > 0 && (
        <section className='space-y-2'>
          <h3 className='font-medium'>{t('Images')}</h3>
          <div className='grid grid-cols-2 gap-2'>
            {detail.media.map((media) => (
              <LearningRunMediaPreview key={media.mediaId} media={media} />
            ))}
          </div>
        </section>
      )}
      <section className='space-y-2'>
        <h3 className='font-medium'>{t('Distillation')}</h3>
        <JsonBlock value={detail.distillation} />
      </section>
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Skill changes')}</h3>
        {detail.skillChanges.length ? (
          detail.skillChanges.map((change) => (
            <details key={`${change.skillId}-${change.changeType}`} className='border-border rounded-md border p-3' open>
              <summary className='cursor-pointer text-sm'>
                {change.name} · {change.changeType}
              </summary>
              {change.files.map((file) => (
                <div key={file.path} className='mt-3 space-y-2'>
                  <div className='text-muted-foreground font-mono text-xs'>{file.path}</div>
                  <pre className='bg-muted/30 overflow-auto p-2 text-xs whitespace-pre-wrap'>{file.diff}</pre>
                </div>
              ))}
            </details>
          ))
        ) : (
          <div className='text-muted-foreground text-xs'>-</div>
        )}
      </section>
      <div className='grid gap-5 lg:grid-cols-2'>
        <SkillSnapshot title={t('Skills before')} skills={detail.skillsBefore} />
        <SkillSnapshot title={t('Skills after')} skills={detail.skillsAfter} />
      </div>
      <section className='space-y-2'>
        <h3 className='font-medium'>{t('Timeline')}</h3>
        <JsonBlock value={detail.timeline} />
      </section>
      {detail.error && (
        <section className='space-y-2'>
          <h3 className='font-medium'>{t('Error')}</h3>
          <JsonBlock value={detail.error} />
        </section>
      )}
    </div>
  )
}

export function PrivateACULearningRuns(props: { learningKind?: string }) {
  const { t } = useTranslation()
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const query = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'learning-runs', props.learningKind],
    queryFn: () => getPrivateACULearningRuns(100, props.learningKind),
  })
  const detailQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'learning-run', selectedRunId],
    queryFn: () => getPrivateACULearningRunDetail(selectedRunId || ''),
    enabled: Boolean(selectedRunId),
  })
  useEffect(() => setSelectedRunId(undefined), [props.learningKind])
  if (query.isLoading) return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  if (query.isError) return <div className='text-destructive text-sm'>{t('Failed to load')}</div>
  if (!query.data?.length) return <div className='text-muted-foreground text-sm'>{t('No learning runs')}</div>
  return (
    <>
      <div className='border-border overflow-auto rounded-md border'>
        <table className='w-full text-left text-xs'>
          <thead className='bg-muted/40'>
            <tr>
              <th className='p-2'>{t('Run')}</th>
              <th className='p-2'>{t('Kind')}</th>
              <th className='p-2'>{t('Status')}</th>
              <th className='p-2'>{t('Elements')}</th>
              <th className='p-2'>{t('Skills')}</th>
              <th className='p-2'>{t('Time')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((run) => (
              <tr key={run.runId} className='border-border hover:bg-muted/30 cursor-pointer border-t' onClick={() => setSelectedRunId(run.runId)}>
                <td className='p-2 font-mono'>{run.runId}</td>
                <td className='p-2'>{run.learningKind}</td>
                <td className='p-2'><Badge variant='outline'>{run.status}</Badge></td>
                <td className='p-2'>{run.elementCount}</td>
                <td className='p-2'>{run.skillChangeCount}</td>
                <td className='p-2 whitespace-nowrap'>{new Date(run.receivedAt).toLocaleString()} <ChevronRight className='inline size-3' /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={Boolean(selectedRunId)} onOpenChange={(open) => !open && setSelectedRunId(undefined)}>
        <SheetContent side='right' className='w-full sm:max-w-3xl'>
          <SheetHeader>
            <SheetTitle>{t('Learning run detail')}</SheetTitle>
            <SheetDescription>{selectedRunId || '-'}</SheetDescription>
          </SheetHeader>
          <RunDetail detail={detailQuery.data} loading={detailQuery.isLoading} />
        </SheetContent>
      </Sheet>
    </>
  )
}

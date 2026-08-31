import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { getPrivateACUFilmStatus } from '../../private-acu-admin-api'
import { PrivateACUSkillCatalog } from './private-acu-skill-catalog'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function PrivateACUFilmPOC() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'film'],
    queryFn: getPrivateACUFilmStatus,
  })

  if (query.isLoading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (query.isError || !query.data) {
    return <div className='text-destructive text-sm'>{t('Failed to load')}</div>
  }

  const status = query.data
  if (!status.enabled) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t('Film POC is not configured')}
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>{t('Film POC status')}</h2>
            <p className='text-muted-foreground text-xs'>
              {t('Read-only runtime state for the GYZ learning space')}
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={query.isFetching ? 'animate-spin' : undefined}
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </div>
        <dl className='border-border grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-3'>
          {[
            [t('Team scope'), status.teamScope || '-'],
            [t('Learning space'), status.spaceId || '-'],
            [t('Acontext user'), status.acontextUser || '-'],
            [t('Learning model'), status.learningModel || '-'],
            [
              t('Ingress token'),
              status.ingressTokenConfigured
                ? t('Configured')
                : t('Not configured'),
            ],
            [t('Quality skills'), String(status.skills.length)],
          ].map(([label, value]) => (
            <div
              key={label}
              className='border-border min-w-0 border-b p-3 last:border-b-0 sm:border-r lg:[&:nth-child(3n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0'
            >
              <dt className='text-muted-foreground text-xs'>{label}</dt>
              <dd className='mt-1 text-sm font-medium break-all'>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {status.imagePolicy && (
        <section className='space-y-3'>
          <h2 className='text-base font-semibold'>{t('Image policy')}</h2>
          <div className='border-border overflow-auto rounded-md border'>
            <table className='w-full text-left text-xs'>
              <thead className='bg-muted/40'>
                <tr>
                  <th className='p-2'>{t('Policy')}</th>
                  <th className='p-2'>{t('Value')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [t('Maximum images'), String(status.imagePolicy.maxImages)],
                  [
                    t('Input image limit'),
                    formatBytes(status.imagePolicy.maxInputImageBytes),
                  ],
                  [
                    t('Input total limit'),
                    formatBytes(status.imagePolicy.maxInputTotalBytes),
                  ],
                  [
                    t('Model image limit'),
                    formatBytes(status.imagePolicy.maxModelImageBytes),
                  ],
                  [
                    t('Model total limit'),
                    formatBytes(status.imagePolicy.maxModelTotalBytes),
                  ],
                  [
                    t('Maximum image dimension'),
                    `${status.imagePolicy.maxImageDimension} px`,
                  ],
                  [t('Output format'), status.imagePolicy.outputMimeType],
                  [t('Compression policy'), t('Visual quality first')],
                ].map(([label, value]) => (
                  <tr key={label} className='border-border border-t'>
                    <td className='p-2 font-medium'>{label}</td>
                    <td className='p-2'>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {status.lastSubmission && (
        <section className='space-y-3'>
          <h2 className='text-base font-semibold'>{t('Last submission')}</h2>
          <div className='border-border grid rounded-md border p-3 text-xs sm:grid-cols-2 lg:grid-cols-3'>
            <div>
              {t('Experience')}: {status.lastSubmission.experienceId}
            </div>
            <div>
              {t('Images')}: {status.lastSubmission.imageCount}
            </div>
            <div>
              {t('Time')}:{' '}
              {new Date(status.lastSubmission.submittedAt).toLocaleString()}
            </div>
            <div>
              {t('Received')}:{' '}
              {formatBytes(status.lastSubmission.receivedImageBytes)}
            </div>
            <div>
              {t('Prepared')}:{' '}
              {formatBytes(status.lastSubmission.preparedImageBytes)}
            </div>
            <div className='break-all'>
              {t('Session')}: {status.lastSubmission.sessionId}
            </div>
          </div>
          {status.lastSubmission.images.length > 0 && (
            <div className='border-border overflow-auto rounded-md border'>
              <table className='w-full text-left text-xs'>
                <thead className='bg-muted/40'>
                  <tr>
                    <th className='p-2'>{t('Image')}</th>
                    <th className='p-2'>{t('Processing')}</th>
                    <th className='p-2'>{t('Dimensions')}</th>
                    <th className='p-2'>{t('Size')}</th>
                    <th className='p-2'>{t('Output')}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.lastSubmission.images.map((image) => (
                    <tr
                      key={image.imageIndex}
                      className='border-border border-t'
                    >
                      <td className='p-2'>#{image.imageIndex}</td>
                      <td className='p-2'>
                        {image.mode === 'unchanged'
                          ? t('Original retained')
                          : t('Compressed')}
                      </td>
                      <td className='p-2 whitespace-nowrap'>
                        {image.inputWidth > 0
                          ? `${image.inputWidth} × ${image.inputHeight} → ${image.outputWidth} × ${image.outputHeight}`
                          : '-'}
                      </td>
                      <td className='p-2 whitespace-nowrap'>
                        {formatBytes(image.inputBytes)} →{' '}
                        {formatBytes(image.outputBytes)}
                      </td>
                      <td className='p-2 whitespace-nowrap'>
                        {image.outputMimeType}
                        {image.quality ? ` · Q${image.quality}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>{t('Film quality skills')}</h2>
        <PrivateACUSkillCatalog skills={status.skills} />
      </section>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import {
  getPreferenceActivity,
  type PreferenceActivity,
} from './preference-library-api'

export function PreferenceActivityList(props: {
  activity: PreferenceActivity
}) {
  const { t } = useTranslation()
  const labels = {
    created: t('Preference recorded'),
    updated: t('Preference summary updated'),
    deleted: t('Preference record removed'),
    rule_updated: t('Preference rule updated'),
  }
  return (
    <div className='min-w-0'>
      {props.activity.events.length ? (
        <ol className='divide-border divide-y border-y'>
          {props.activity.events.map((event) => (
            <li key={event.runId} className='space-y-3 py-4'>
              <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                <time dateTime={event.recordedAt}>
                  {new Date(event.recordedAt).toLocaleString()}
                </time>
                <span>
                  {event.trigger === 'explicit_user_preference'
                    ? t('Explicit preference')
                    : t('Feedback learning')}
                </span>
              </div>
              {event.changes.map((change) => (
                <div key={change.preferenceId} className='min-w-0 space-y-2'>
                  <h3 className='text-xs font-medium'>{labels[change.kind]}</h3>
                  <p className='text-sm leading-6 [overflow-wrap:anywhere]'>
                    {change.after || change.before}
                  </p>
                  {change.kind === 'updated' && (
                    <details className='text-sm'>
                      <summary className='text-muted-foreground cursor-pointer text-xs'>
                        {t('Previous summary')}
                      </summary>
                      <p className='border-border text-muted-foreground mt-2 border-l-2 pl-3 leading-6 [overflow-wrap:anywhere]'>
                        {change.before}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className='text-muted-foreground py-4 text-sm'>
          {t('No displayable summary changes in recent learning')}
        </p>
      )}
      {(props.activity.partial || props.activity.moreAvailable) && (
        <p className='text-muted-foreground mt-3 text-xs'>
          {props.activity.partial
            ? t('Some recent records could not be loaded')
            : t('Recent learning window, not a complete history')}
        </p>
      )}
    </div>
  )
}

export function PreferenceRecentActivity() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const query = useQuery({
    queryKey: ['private-acu', 'preference-activity', userId],
    queryFn: getPreferenceActivity,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
  })
  return (
    <section
      aria-label={t('Recent preference changes')}
      className='min-w-0 space-y-3'
    >
      <header className='flex items-center justify-between gap-3'>
        <h2 className='text-base font-semibold'>
          {t('Recent preference changes')}
        </h2>
        <Button
          size='icon'
          variant='ghost'
          title={t('Refresh')}
          aria-label={t('Refresh recent changes')}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw />
        </Button>
      </header>
      {query.isLoading && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Loading')}
        </p>
      )}
      {query.isError && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Recent preference changes unavailable')}
        </p>
      )}
      {query.data && <PreferenceActivityList activity={query.data} />}
    </section>
  )
}

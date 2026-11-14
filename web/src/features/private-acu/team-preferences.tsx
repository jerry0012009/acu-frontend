import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { PreferenceStarfishChart } from './preference-starfish'
import {
  getTeamPreferences,
  type TeamPreferenceSpace,
} from './team-preferences-api'

export function TeamPreferenceGraph(props: { space: TeamPreferenceSpace }) {
  const { t } = useTranslation()
  const view = props.space.view
  return (
    <section
      className='min-w-0 space-y-4 border-b pb-6'
      aria-label={t('Team creative vectors')}
    >
      <h2 className='text-lg font-semibold'>
        {t('{{team}} creative vectors', { team: props.space.key })}
      </h2>
      {view.profile?.rays.length ? (
        <PreferenceStarfishChart
          key={props.space.key}
          view={view}
          records={props.space.records}
        />
      ) : (
        <p role='status' className='text-muted-foreground text-sm'>
          {t(
            view.status === 'empty'
              ? 'No creative experience yet'
              : 'Updating creative vectors'
          )}
        </p>
      )}
      {view.status === 'error' && (
        <p role='status' className='text-sm'>
          {t('Refresh failed. Please retry.')}
        </p>
      )}
      {view.profile?.highlights?.length ? (
        <div className='grid gap-4 sm:grid-cols-2'>
          {view.profile.highlights.map((item) => (
            <article key={item.title}>
              <h3 className='text-sm font-medium'>{item.title}</h3>
              <p className='text-muted-foreground mt-1 text-sm leading-6'>
                {item.summary}
              </p>
            </article>
          ))}
        </div>
      ) : (
        view.profile?.summary && (
          <p className='text-sm leading-6'>{view.profile.summary}</p>
        )
      )}
    </section>
  )
}

export function TeamPreferences() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const query = useQuery({
    queryKey: ['private-acu', 'team-preferences', userId],
    queryFn: getTeamPreferences,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.spaces.some((space) =>
        ['queued', 'generating'].includes(space.view.status)
      )
        ? 10_000
        : false,
  })
  return (
    <div className='min-w-0 space-y-5'>
      <div className='flex justify-end'>
        <Button
          size='icon'
          variant='ghost'
          title={t('Refresh')}
          aria-label={t('Refresh')}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
        </Button>
      </div>
      {query.isError && (
        <p role='status'>{t('Refresh failed. Please retry.')}</p>
      )}
      {query.data?.spaces.map((space) => (
        <TeamPreferenceGraph key={`${userId}:${space.key}`} space={space} />
      ))}
    </div>
  )
}

export function TeamSpaceLinks() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const query = useQuery({
    queryKey: ['private-acu', 'team-preferences', userId],
    queryFn: getTeamPreferences,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
  })
  if (!query.data?.spaces.length) {
    return null
  }
  return (
    <nav
      className='flex flex-wrap gap-4 text-sm'
      aria-label={t('Team creative vectors')}
    >
      {query.data.spaces.map((space) => (
        <Link
          key={space.key}
          to='/private-acu/$section'
          params={{ section: 'film' }}
          className='text-primary underline-offset-4 hover:underline'
        >
          {t('{{team}} creative vectors', { team: space.key })}
        </Link>
      ))}
    </nav>
  )
}

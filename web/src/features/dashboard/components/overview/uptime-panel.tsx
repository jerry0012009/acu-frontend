import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getUptimeStatus } from '@/features/dashboard/api'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const STATUS_COLOR_MAP: Record<number, string> = {
  1: 'bg-success',
  0: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-primary',
}

export function UptimePanel() {
  const { t } = useTranslation()
  const canConfigure = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const query = useQuery({
    queryKey: ['dashboard', 'uptime'],
    queryFn: async () => {
      const result = await getUptimeStatus()
      if (!result.success) throw new Error('monitoring unavailable')
      return result.data
    },
    staleTime: 60 * 1000,
    retry: false,
  })
  const groups = query.data ?? []
  const hasMonitors = groups.some((group) => group.monitors?.length)

  return (
    <section className='border-t pt-5' aria-label={t('Uptime')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-base font-semibold'>{t('Uptime')}</h3>
        <div className='flex items-center gap-2'>
          {canConfigure &&
            !hasMonitors &&
            !query.isPending &&
            !query.isError && (
              <Link
                to='/system-settings/content/$section'
                params={{ section: 'uptime-kuma' }}
                className='text-primary text-sm hover:underline'
              >
                {t('Configure monitoring')}
              </Link>
            )}
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label={t('Refresh')}
            title={t('Refresh')}
          >
            <RotateCw
              className={cn('size-4', query.isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </div>
      {query.isPending && (
        <p role='status' className='text-muted-foreground mt-2 text-sm'>
          {t('Loading...')}
        </p>
      )}
      {query.isError && (
        <p role='alert' className='text-muted-foreground mt-2 text-sm'>
          {t('Could not load monitoring status. Refresh to try again.')}
        </p>
      )}
      {!query.isPending && !query.isError && !hasMonitors && (
        <p className='text-muted-foreground mt-2 text-sm'>
          {t('No uptime monitoring configured')}
        </p>
      )}
      {hasMonitors && (
        <div className='mt-4 max-h-80 overflow-auto'>
          {groups
            .filter((group) => group.monitors?.length)
            .map((group) => (
              <div key={group.categoryName}>
                <h4 className='text-muted-foreground py-2 text-xs font-medium'>
                  {group.categoryName}
                </h4>
                {group.monitors.map((monitor) => (
                  <div
                    key={monitor.name}
                    className='flex items-center justify-between gap-4 border-b py-3 text-sm'
                  >
                    <span className='flex min-w-0 items-center gap-2'>
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          STATUS_COLOR_MAP[monitor.status] ??
                            'bg-muted-foreground'
                        )}
                        aria-hidden='true'
                      />
                      <span className='break-words'>{monitor.name}</span>
                    </span>
                    <span className='shrink-0 font-medium tabular-nums'>
                      {((monitor.uptime ?? 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </section>
  )
}

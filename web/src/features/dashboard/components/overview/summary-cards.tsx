import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts'

import { Skeleton } from '@/components/ui/skeleton'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { formatNumber, formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

export function SummaryCards() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const range = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    return { start_timestamp: end - 86400, end_timestamp: end }
  }, [])
  const usage = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-sparklines',
      user?.id,
      range.start_timestamp,
      range.end_timestamp,
    ],
    queryFn: async () => {
      const result = await getUserQuotaDates({ ...range, default_time: 'hour' })
      if (!result.success) throw new Error('usage unavailable')
      return result.data
    },
    staleTime: 60 * 1000,
    retry: false,
  })
  const recentUsage = (usage.data ?? []).reduce(
    (total, row) => total + (Number(row.quota) || 0),
    0
  )
  const hourlyUsage = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, index) => ({
      time: new Date(
        (range.start_timestamp + index * 3600) * 1000
      ).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      quota: 0,
    }))
    for (const row of usage.data ?? []) {
      const index = Math.floor((row.created_at - range.start_timestamp) / 3600)
      if (index >= 0 && index < hours.length) {
        hours[index].quota += Number(row.quota) || 0
      }
    }
    return hours
  }, [usage.data, range.start_timestamp])
  const metrics = [
    {
      title: t('Last 24h usage'),
      value: usage.isError ? '—' : formatQuota(recentUsage),
      period: usage.isError
        ? t('Usage data unavailable')
        : t('Rolling 24 hours'),
      pending: usage.isPending,
    },
    {
      title: t('Total usage'),
      value: formatQuota(Number(user?.used_quota ?? 0)),
      period: t('All time'),
    },
    {
      title: t('Requests'),
      value: formatNumber(Number(user?.request_count ?? 0)),
      period: t('All time'),
    },
    {
      title: t('Credit remaining'),
      value: formatQuota(Number(user?.quota ?? 0)),
      period: t('Available balance'),
      balance: true,
    },
  ]

  return (
    <>
      <dl className='grid grid-cols-1 gap-y-5 min-[380px]:grid-cols-2 xl:grid-cols-4'>
        {metrics.map((metric) => (
          <div
            key={metric.title}
            data-summary-metric
            className='min-w-0 border-l pl-5 first:border-l-0 first:pl-0 min-[380px]:nth-3:border-l-0 min-[380px]:nth-3:pl-0 xl:nth-3:border-l xl:nth-3:pl-5'
          >
            <dt className='text-muted-foreground text-sm'>{metric.title}</dt>
            {metric.pending ? (
              <dd>
                <Skeleton className='my-3 h-8 w-24' />
              </dd>
            ) : (
              <dd className='my-2 text-[30px] leading-tight font-semibold break-all tabular-nums'>
                {metric.value}
              </dd>
            )}
            <div className='text-muted-foreground flex min-h-5 flex-wrap items-center gap-2 text-xs'>
              <span>{metric.period}</span>
              {metric.balance && (
                <Link
                  to='/wallet'
                  aria-label={t('Wallet')}
                  className='text-primary inline-flex items-center gap-1'
                >
                  {t('Wallet')}
                  <ArrowUpRight className='size-3' aria-hidden='true' />
                </Link>
              )}
              {metric.title === t('Last 24h usage') && usage.isError && (
                <button
                  type='button'
                  className='text-primary underline underline-offset-2'
                  onClick={() => usage.refetch()}
                >
                  {t('Retry')}
                </button>
              )}
            </div>
          </div>
        ))}
      </dl>
      {!usage.isPending && !usage.isError && recentUsage > 0 && (
        <figure
          className='mt-7 border-t pt-5'
          aria-label={t('Usage over the last 24 hours')}
        >
          <figcaption className='text-muted-foreground mb-3 text-xs'>
            {t('Hourly usage')}
          </figcaption>
          <div className='h-32 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%' minWidth={0}>
              <BarChart
                data={hourlyUsage}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                accessibilityLayer
              >
                <XAxis
                  dataKey='time'
                  axisLine={false}
                  tickLine={false}
                  minTickGap={60}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => [
                    formatQuota(Number(value)),
                    t('Hourly usage'),
                  ]}
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'var(--muted)' }}
                />
                <Bar
                  dataKey='quota'
                  fill='var(--primary)'
                  maxBarSize={18}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </>
  )
}

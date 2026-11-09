import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

const PERFORMANCE_WINDOW_HOURS = 24
const TOP_MODEL_LIMIT = 6

type WeightedMetric = 'avg_latency_ms' | 'avg_tps' | 'success_rate'

function simpleAverage(
  rows: PerfModelSummary[],
  metric: WeightedMetric,
  isValid: (value: number) => boolean
): number {
  let total = 0
  let count = 0
  for (const row of rows) {
    const value = Number(row[metric])
    if (!isValid(value)) continue
    total += value
    count++
  }
  return count > 0 ? total / count : Number.NaN
}

export function PerformanceHealthPanel() {
  const { t } = useTranslation()
  const metricsQuery = useQuery({
    queryKey: ['perf-metrics-summary', PERFORMANCE_WINDOW_HOURS],
    queryFn: async () => {
      const result = await getPerfMetricsSummary(PERFORMANCE_WINDOW_HOURS)
      if (!result.success) throw new Error('performance unavailable')
      return result
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const models = useMemo(
    () => metricsQuery.data?.data.models ?? [],
    [metricsQuery.data]
  )

  const summary = useMemo(() => {
    return {
      avgLatencyMs: Math.round(
        simpleAverage(
          models,
          'avg_latency_ms',
          (v) => Number.isFinite(v) && v > 0
        )
      ),
      avgTps: simpleAverage(
        models,
        'avg_tps',
        (v) => Number.isFinite(v) && v > 0
      ),
      successRate: simpleAverage(models, 'success_rate', Number.isFinite),
    }
  }, [models])

  const topModels = useMemo(() => models.slice(0, TOP_MODEL_LIMIT), [models])
  const loading = metricsQuery.isLoading
  const hasData = models.length > 0

  return (
    <section
      className='border-t pt-6'
      aria-labelledby='performance-health-title'
    >
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <h3 id='performance-health-title' className='text-base font-semibold'>
          {t('Performance health')}
        </h3>
        <span className='text-muted-foreground text-xs'>
          {t('Performance metrics for the last 24 hours')}
        </span>
      </div>

      {metricsQuery.isError ? (
        <div
          role='alert'
          className='text-muted-foreground flex flex-wrap items-center gap-3 py-5 text-sm'
        >
          {t('Performance data unavailable')}
          <Button
            size='sm'
            variant='outline'
            onClick={() => metricsQuery.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      ) : (
        <div className='space-y-5 pt-5'>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Unweighted model averages · not request-weighted service availability'
            )}
          </p>
          <div className='grid grid-cols-1 gap-5 sm:grid-cols-3'>
            <MetricCell
              label={t('Success rate')}
              value={formatUptimePct(summary.successRate)}
              loading={loading}
              valueClassName={getSuccessRateTextClass(summary.successRate)}
            />
            <MetricCell
              label={t('Average latency')}
              value={formatLatency(summary.avgLatencyMs)}
              loading={loading}
            />
            <MetricCell
              label={t('Throughput')}
              value={formatThroughput(summary.avgTps)}
              loading={loading}
            />
          </div>

          {loading ? (
            <div className='space-y-1'>
              {['success', 'latency', 'throughput'].map((key) => (
                <Skeleton key={key} className='h-5 w-full rounded' />
              ))}
            </div>
          ) : (
            hasData && (
              <div>
                <span className='text-muted-foreground mb-2 block text-xs font-medium'>
                  {t('Observed models')}
                </span>
                <div className='grid grid-cols-1 gap-x-4 sm:grid-cols-2'>
                  {topModels.map((model) => (
                    <div
                      key={model.model_name}
                      className='flex items-center justify-between gap-3 border-b py-3'
                    >
                      <span className='min-w-0 flex-1 font-mono text-xs break-all'>
                        {model.model_name}
                      </span>
                      <span className='inline-flex shrink-0 flex-wrap items-center justify-end gap-2'>
                        {model.request_count !== undefined && (
                          <span className='text-muted-foreground text-xs'>
                            {t('{{count}} requests', {
                              count: model.request_count,
                            })}
                          </span>
                        )}
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            getSuccessRateDotClass(model.success_rate)
                          )}
                          aria-hidden='true'
                        />
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums',
                            getSuccessRateTextClass(model.success_rate)
                          )}
                        >
                          {formatUptimePct(model.success_rate)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
          {!loading && !hasData && (
            <p className='text-muted-foreground text-sm'>
              {t('No performance samples in this window')}
            </p>
          )}
          <Link
            to='/dashboard/$section'
            params={{ section: 'models' }}
            className='text-primary text-sm hover:underline'
          >
            {t('View model analytics')}
          </Link>
        </div>
      )}
    </section>
  )
}

function MetricCell(props: {
  label: string
  value: string
  loading: boolean
  valueClassName?: string
}) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-sm'>
        <span>{props.label}</span>
      </div>
      {props.loading ? (
        <Skeleton className='mt-1.5 h-5 w-16' />
      ) : (
        <div
          className={cn(
            'mt-2 text-[28px] leading-tight font-semibold tabular-nums',
            props.valueClassName
          )}
        >
          {props.value}
        </div>
      )}
    </div>
  )
}

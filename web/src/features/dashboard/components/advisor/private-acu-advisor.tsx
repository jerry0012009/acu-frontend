import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CircleSlash,
  History,
  Lightbulb,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  getPrivateACUAdvisors,
  updatePrivateACUAdvisorFeedback,
  type PrivateACUAdvisor,
} from '../../advisor-api'

function AdvisorStatusIcon(props: { status: PrivateACUAdvisor['status'] }) {
  if (props.status === 'risk') {
    return <AlertTriangle className='text-amber-600 dark:text-amber-400' />
  }
  if (props.status === 'blocked') {
    return <CircleSlash className='text-destructive' />
  }
  return <Check className='text-emerald-600 dark:text-emerald-400' />
}

function AdvisorStatusLabel(props: { status: PrivateACUAdvisor['status'] }) {
  const { t } = useTranslation()
  const labels: Record<PrivateACUAdvisor['status'], string> = {
    ok: t('On track'),
    risk: t('Needs attention'),
    blocked: t('Blocked'),
  }
  return <span>{labels[props.status]}</span>
}

function AdvisorFeedback(props: {
  advisor: PrivateACUAdvisor
  onFeedback: (feedback: NonNullable<PrivateACUAdvisor['userFeedback']>) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const feedbackOptions = [
    {
      value: 'helpful' as const,
      label: t('Helpful'),
      icon: ThumbsUp,
    },
    {
      value: 'inaccurate' as const,
      label: t('Inaccurate'),
      icon: ThumbsDown,
    },
    {
      value: 'ignored' as const,
      label: t('Ignore'),
      icon: CircleSlash,
    },
  ]

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='text-muted-foreground mr-1 text-xs'>
        {t('Was this useful?')}
      </span>
      {feedbackOptions.map((option) => {
        const Icon = option.icon
        const selected = props.advisor.userFeedback === option.value
        return (
          <Button
            key={option.value}
            variant={selected ? 'secondary' : 'ghost'}
            size='sm'
            disabled={props.pending}
            onClick={() => props.onFeedback(option.value)}
            aria-pressed={selected}
          >
            <Icon />
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}

function AdvisorCard(props: {
  advisor: PrivateACUAdvisor
  onFeedback: (
    advisorId: string,
    feedback: NonNullable<PrivateACUAdvisor['userFeedback']>
  ) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const createdAt = useMemo(
    () => new Date(props.advisor.createdAt).toLocaleString(),
    [props.advisor.createdAt]
  )

  return (
    <article className='border-border/70 bg-card rounded-xl border p-4 sm:p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <AdvisorStatusIcon status={props.advisor.status} />
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold'>
              <AdvisorStatusLabel status={props.advisor.status} />
              <span className='text-muted-foreground text-xs font-normal'>
                {createdAt}
              </span>
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('After {{count}} model calls', {
                count: props.advisor.triggerCallCount,
              })}
            </p>
          </div>
        </div>
        {props.advisor.learn === 'candidate' && (
          <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
            <Lightbulb className='size-3.5' />
            {t('Learning candidate')}
          </span>
        )}
      </div>

      <div className='mt-4 space-y-3'>
        <div>
          <h3 className='text-muted-foreground text-xs font-medium uppercase'>
            {t('Observed problem')}
          </h3>
          <p className='mt-1 text-sm leading-6'>{props.advisor.problem}</p>
        </div>
        {props.advisor.advice && (
          <div className='border-primary/20 bg-primary/5 rounded-lg border p-3'>
            <h3 className='text-primary text-xs font-medium uppercase'>
              {t('Advisor suggestion')}
            </h3>
            <p className='mt-1 text-sm leading-6'>{props.advisor.advice}</p>
          </div>
        )}
        {props.advisor.relevantSkillIds.length > 0 && (
          <p className='text-muted-foreground text-xs'>
            {t('Reference skills')}: {props.advisor.relevantSkillIds.join(', ')}
          </p>
        )}
      </div>

      <div className='border-border/60 mt-4 border-t pt-3'>
        <AdvisorFeedback
          advisor={props.advisor}
          onFeedback={(feedback) =>
            props.onFeedback(props.advisor.advisorId, feedback)
          }
          pending={props.pending}
        />
      </div>
    </article>
  )
}

export function PrivateACUAdvisor() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAllHistory, setShowAllHistory] = useState(false)
  const advisorsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-advisor'],
    queryFn: () => getPrivateACUAdvisors(100),
  })
  const advisors = advisorsQuery.data ?? []
  const visibleAdvisors = showAllHistory
    ? advisors
    : advisors.filter((advisor) => advisor.needAdvisor)
  const feedbackMutation = useMutation({
    mutationFn: ({
      advisorId,
      feedback,
    }: {
      advisorId: string
      feedback: NonNullable<PrivateACUAdvisor['userFeedback']>
    }) => updatePrivateACUAdvisorFeedback(advisorId, feedback),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['dashboard', 'private-acu-advisor'],
      })
      toast.success(t('Feedback saved'))
    },
    onError: () => toast.error(t('Failed to save feedback')),
  })

  if (advisorsQuery.isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-36 w-full rounded-xl' />
        <Skeleton className='h-36 w-full rounded-xl' />
      </div>
    )
  }

  if (advisorsQuery.isError) {
    return (
      <div className='border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-xl border p-5'>
        <p className='text-sm'>{t('Unable to load Advisor suggestions')}</p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void advisorsQuery.refetch()}
        >
          <RefreshCw />
          {t('Retry')}
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-3', feedbackMutation.isPending && 'opacity-90')}
    >
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setShowAllHistory((current) => !current)}
          aria-pressed={showAllHistory}
        >
          <History />
          {showAllHistory
            ? t('Show recommendations only')
            : t('View all history')}
        </Button>
      </div>

      {visibleAdvisors.length === 0 ? (
        <div className='text-muted-foreground border-border/70 rounded-xl border border-dashed p-8 text-center text-sm'>
          {showAllHistory
            ? t('No Advisor history yet')
            : t('No active Advisor suggestions')}
        </div>
      ) : (
        visibleAdvisors.map((advisor) => (
          <AdvisorCard
            key={advisor.advisorId}
            advisor={advisor}
            onFeedback={(advisorId, feedback) =>
              feedbackMutation.mutate({ advisorId, feedback })
            }
            pending={feedbackMutation.isPending}
          />
        ))
      )}
    </div>
  )
}

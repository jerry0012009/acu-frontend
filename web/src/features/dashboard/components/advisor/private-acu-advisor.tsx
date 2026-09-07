import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleSlash,
  History,
  Lightbulb,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  getPrivateACUMemory,
  getPrivateACUAdvisors,
  getPrivateACUAdvisorNotificationPreferences,
  updatePrivateACUAdvisorNotificationPreferences,
  updatePrivateACUAdvisorFeedback,
  type PrivateACUAdvisor,
} from '../../advisor-api'
import { requestAdvisorBrowserNotificationPermission } from '../../lib/advisor-browser-notification'
import type { PrivateACUMemorySkill } from '../../private-acu-admin-api'
import { PrivateACUSkillCatalog } from '../admin/private-acu-skill-catalog'

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
  skills: PrivateACUMemorySkill[]
  skillsLoading: boolean
  onFeedback: (
    advisorId: string,
    feedback: NonNullable<PrivateACUAdvisor['userFeedback']>
  ) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const referencedSkills = props.skills.filter((skill) =>
    props.advisor.relevantSkillIds.includes(skill.id)
  )
  const createdAt = useMemo(
    () => new Date(props.advisor.createdAt).toLocaleString(),
    [props.advisor.createdAt]
  )
  let referencedSkillsContent = (
    <p className='text-muted-foreground text-sm'>{t('No skills')}</p>
  )
  if (props.skillsLoading) {
    referencedSkillsContent = <Skeleton className='h-16 w-full rounded-md' />
  } else if (referencedSkills.length > 0) {
    referencedSkillsContent = (
      <PrivateACUSkillCatalog skills={referencedSkills} />
    )
  }

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
          </div>
        </div>
        {props.advisor.learn === 'candidate' && (
          <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
            <Lightbulb className='size-3.5' />
            {t('Learning candidate')}
          </span>
        )}
        {props.advisor.referenceStatus && (
          <span className='text-muted-foreground text-xs'>
            {t('Reference status')}: {props.advisor.referenceStatus}
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
          <div className='space-y-2'>
            <h3 className='text-muted-foreground text-xs font-medium uppercase'>
              {t('Reference skills')}
            </h3>
            {referencedSkillsContent}
          </div>
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

function AdvisorList(props: { advisorId?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAllHistory, setShowAllHistory] = useState(true)
  const advisorsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-advisor'],
    queryFn: () => getPrivateACUAdvisors(100),
  })
  const memoryQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-memory'],
    queryFn: getPrivateACUMemory,
  })
  const advisors = useMemo(() => advisorsQuery.data ?? [], [advisorsQuery.data])
  useEffect(() => {
    if (
      !props.advisorId ||
      !advisors.some((advisor) => advisor.advisorId === props.advisorId)
    ) {
      return
    }
    document
      .getElementById(`private-acu-advisor-${props.advisorId}`)
      ?.scrollIntoView({ block: 'center' })
  }, [advisors, props.advisorId])
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
          <div
            key={advisor.advisorId}
            id={`private-acu-advisor-${advisor.advisorId}`}
            className={cn(
              props.advisorId === advisor.advisorId &&
                'rounded-xl outline outline-2 outline-primary/50'
            )}
          >
            <AdvisorCard
              advisor={advisor}
              skills={memoryQuery.data?.skills ?? []}
              skillsLoading={memoryQuery.isLoading}
              onFeedback={(advisorId, feedback) =>
                feedbackMutation.mutate({ advisorId, feedback })
              }
              pending={feedbackMutation.isPending}
            />
          </div>
        ))
      )}
    </div>
  )
}

function AdvisorNotificationPreferences() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const preferencesQuery = useQuery({
    queryKey: ['private-acu', 'advisor-notification-preferences'],
    queryFn: getPrivateACUAdvisorNotificationPreferences,
  })
  const mutation = useMutation({
    mutationFn: updatePrivateACUAdvisorNotificationPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['private-acu', 'advisor-notification-preferences'],
        data
      )
      toast.success(t('Notification preferences saved'))
    },
    onError: () => toast.error(t('Failed to save notification preferences')),
  })

  if (preferencesQuery.isLoading || !preferencesQuery.data) {
    return <Skeleton className='h-28 w-full rounded-lg' />
  }

  const preferences = preferencesQuery.data
  const update = (patch: Partial<typeof preferences>) =>
    mutation.mutate({ ...preferences, ...patch })

  return (
    <section className='border-border/70 bg-card space-y-4 rounded-lg border p-4'>
      <div>
        <h3 className='text-sm font-semibold'>{t('Advisor notifications')}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('Choose how new Advisor audit suggestions reach you.')}
        </p>
      </div>
      <div className='flex items-center justify-between gap-4'>
        <span className='text-sm'>{t('Console notifications')}</span>
        <Switch
          checked={preferences.inAppEnabled}
          onCheckedChange={(checked) => update({ inAppEnabled: checked })}
        />
      </div>
      <div className='flex items-center justify-between gap-4'>
        <span className='text-sm'>{t('Browser system notifications')}</span>
        <Switch
          checked={preferences.browserEnabled}
          onCheckedChange={async (checked) => {
            if (checked) {
              const permission =
                await requestAdvisorBrowserNotificationPermission()
              if (permission !== 'granted') {
                toast.error(
                  t('Browser notification permission was not granted')
                )
                return
              }
            }
            update({ browserEnabled: checked })
          }}
        />
      </div>
      <div className='flex items-center justify-between gap-4'>
        <span className='text-sm'>{t('Email notifications')}</span>
        <Switch
          checked={preferences.emailEnabled}
          onCheckedChange={(checked) => update({ emailEnabled: checked })}
        />
      </div>
      <label className='block space-y-2'>
        <span className='text-muted-foreground text-xs'>
          {t('Advisor notification email')}
        </span>
        <Input
          type='email'
          value={preferences.email}
          placeholder={preferences.emailTarget || t('Account email')}
          onChange={(event) => update({ email: event.target.value })}
        />
      </label>
    </section>
  )
}

function PrivateACUMemory() {
  const { t } = useTranslation()
  const memoryQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-memory'],
    queryFn: getPrivateACUMemory,
  })

  if (memoryQuery.isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-24 w-full rounded-lg' />
        <Skeleton className='h-24 w-full rounded-lg' />
      </div>
    )
  }

  if (memoryQuery.isError) {
    return (
      <div className='border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-5'>
        <p className='text-sm'>
          {t('Unable to load preferences and experience')}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void memoryQuery.refetch()}
        >
          <RefreshCw />
          {t('Retry')}
        </Button>
      </div>
    )
  }

  if (!memoryQuery.data?.enabled || memoryQuery.data.skills.length === 0) {
    return (
      <div className='text-muted-foreground border-border/70 rounded-lg border border-dashed p-8 text-center text-sm'>
        {t('No preferences or experience yet')}
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      {memoryQuery.data.skills.map((skill) => (
        <details
          key={skill.id}
          className='border-border/70 bg-card rounded-lg border p-4'
        >
          <summary className='flex cursor-pointer list-none items-start gap-2 text-sm font-medium'>
            <ChevronDown className='mt-0.5 size-4 shrink-0' />
            <span className='min-w-0'>
              <span className='block'>{skill.name}</span>
              {skill.description && (
                <span className='text-muted-foreground mt-1 block text-xs leading-5 font-normal'>
                  {skill.description}
                </span>
              )}
            </span>
          </summary>
          <div className='mt-3 space-y-3'>
            {skill.files.map((file) => (
              <pre
                key={file.path}
                className='bg-muted/30 max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'
              >
                {file.content || t('No content')}
              </pre>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

export function PrivateACUAdvisor(props: { advisorId?: string }) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue='advisor'>
      <TabsList>
        <TabsTrigger value='advisor'>{t('Advisor')}</TabsTrigger>
        <TabsTrigger value='memory'>
          {t('Preferences and experience')}
        </TabsTrigger>
        <TabsTrigger value='settings'>{t('Notifications')}</TabsTrigger>
      </TabsList>
      <TabsContent value='advisor'>
        <AdvisorList advisorId={props.advisorId} />
      </TabsContent>
      <TabsContent value='memory'>
        <PrivateACUMemory />
      </TabsContent>
      <TabsContent value='settings'>
        <AdvisorNotificationPreferences />
      </TabsContent>
    </Tabs>
  )
}

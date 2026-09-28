import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bell,
  BookOpen,
  BrainCircuit,
  CircleDollarSign,
  ChevronRight,
  Eye,
  FileText,
  ListChecks,
} from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getPrivateACULearningRunDetail,
  getPrivateACULearningRuns,
  getPrivateACUMemory,
  getPrivateACUUsageSummary,
  getPrivateACUUserConfig,
  type PrivateACULearningRunSelfDetail,
  type PrivateACUUsageWindow,
} from '@/features/dashboard/advisor-api'
import { PrivateACUUserSettings } from '@/features/dashboard/components/advisor/private-acu-advisor'

import {
  preferenceDisplayText,
  preferenceDocumentLabel,
} from './preference-display'

function getUsageWindowLabel(
  window: PrivateACUUsageWindow['window'],
  t: (key: string) => string
) {
  if (window === '24h') return t('Past 24 hours')
  if (window === '7d') return t('Past 7 days')
  return t('Past 30 days')
}

function formatPrivateShare(userChargeCny: string, totalUserChargeCny: string) {
  const userCharge = Number(userChargeCny)
  const totalUserCharge = Number(totalUserChargeCny)
  if (
    !Number.isFinite(userCharge) ||
    !Number.isFinite(totalUserCharge) ||
    totalUserCharge <= 0
  ) {
    return null
  }
  return `${((userCharge / totalUserCharge) * 100).toFixed(2)}%`
}

function StatusPanel() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['private-acu', 'user-settings'],
    queryFn: getPrivateACUUserConfig,
  })
  if (query.isLoading) return <Skeleton className='h-28 w-full rounded-lg' />
  if (!query.data) return null
  const settings = query.data
  const userEnabled =
    settings.learningEnabled ||
    settings.observerEnabled ||
    settings.advisorEnabled ||
    settings.injectionEnabled
  const enabled = settings.globalEnabled && userEnabled
  let statusMessage = t(
    'Private ACU is ready. Choose the features you want to enable.'
  )
  if (!settings.globalEnabled) {
    statusMessage = t('Private ACU is currently disabled by the administrator.')
  } else if (userEnabled) {
    statusMessage = t('Your selected Private ACU features are active.')
  }
  return (
    <div
      className={`rounded-md border p-4 ${
        enabled
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-border bg-muted/15'
      }`}
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <div className='text-sm font-semibold'>
            {t('Current account status')}
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>{statusMessage}</p>
        </div>
        <Badge variant={enabled ? 'default' : 'outline'}>
          {enabled ? t('Enabled') : t('Disabled')}
        </Badge>
      </div>
    </div>
  )
}

function UsageSummary() {
  const { t } = useTranslation()
  const [selectedWindow, setSelectedWindow] =
    useState<PrivateACUUsageWindow['window']>('24h')
  const query = useQuery({
    queryKey: ['private-acu', 'usage-summary'],
    queryFn: getPrivateACUUsageSummary,
    retry: false,
  })
  if (query.isLoading) {
    return <Skeleton className='h-32 w-full rounded-lg' />
  }
  const windows = query.data ?? []
  const activeWindow =
    windows.find((window) => window.window === selectedWindow) ?? windows[0]
  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>{t('Private ACU cost')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Your Private ACU cost share is measured against your total ACU spending in the same period. Completed learning, process observation, and automatic correction show the value delivered.'
            )}
          </p>
        </div>
        <Select
          value={activeWindow?.window ?? selectedWindow}
          onValueChange={(value) =>
            setSelectedWindow(value as PrivateACUUsageWindow['window'])
          }
        >
          <SelectTrigger className='w-full sm:w-[180px]'>
            <SelectValue placeholder={t('Select time range')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value='24h'>{t('Past 24 hours')}</SelectItem>
            <SelectItem value='7d'>{t('Past 7 days')}</SelectItem>
            <SelectItem value='30d'>{t('Past 30 days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {activeWindow ? (
        <article className='border-border bg-card rounded-md border p-4'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-sm font-medium'>
              {getUsageWindowLabel(activeWindow.window, t)}
            </span>
            <CircleDollarSign className='text-muted-foreground size-4' />
          </div>
          <div className='mt-3 text-xl font-semibold'>
            ¥{Number(activeWindow.userChargeCny).toFixed(4)}
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {t('{{count}} calls', { count: activeWindow.calls })}
          </div>
          <div className='mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300'>
            {formatPrivateShare(
              activeWindow.userChargeCny,
              activeWindow.totalUserChargeCny
            ) ? (
              <>
                {t('Your Private ACU share of total ACU cost')}{' '}
                {formatPrivateShare(
                  activeWindow.userChargeCny,
                  activeWindow.totalUserChargeCny
                )}
              </>
            ) : (
              t('Total ACU cost share is unavailable')
            )}
          </div>
          <dl className='mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs'>
            <div>
              <dt className='text-muted-foreground'>{t('Learning')}</dt>
              <dd className='mt-1'>
                ¥{Number(activeWindow.byStage.learning ?? 0).toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Observer')}</dt>
              <dd className='mt-1'>
                ¥{Number(activeWindow.byStage.observer ?? 0).toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Advisor')}</dt>
              <dd className='mt-1'>
                ¥{Number(activeWindow.byStage.advisor ?? 0).toFixed(4)}
              </dd>
            </div>
          </dl>
          <dl className='mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs'>
            <div>
              <dt className='text-muted-foreground'>
                {t('Completed learning')}
              </dt>
              <dd className='mt-1 font-medium'>
                {activeWindow.byStageCalls.learning ?? 0} {t('times')}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('Process observation')}
              </dt>
              <dd className='mt-1 font-medium'>
                {activeWindow.byStageCalls.observer ?? 0} {t('times')}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>
                {t('Automatic correction')}
              </dt>
              <dd className='mt-1 font-medium'>
                {activeWindow.byStageCalls.advisor ?? 0} {t('times')}
              </dd>
            </div>
          </dl>
        </article>
      ) : (
        <p className='text-muted-foreground text-sm'>{t('No recent usage')}</p>
      )}
    </section>
  )
}

export function PreferenceDocumentIdentity(props: { id: string }) {
  const { t } = useTranslation()
  return (
    <div className='text-muted-foreground flex min-w-0 items-start gap-2 text-[11px]'>
      <span className='shrink-0 pt-1'>{t('Document ID')}</span>
      <code className='min-w-0 flex-1 pt-1 leading-4 break-all'>
        {props.id || '-'}
      </code>
      {props.id ? (
        <CopyButton
          value={props.id}
          className='size-6'
          iconClassName='size-3'
          tooltip={t('Copy document ID')}
          aria-label={t('Copy document ID: {{id}}', { id: props.id })}
        />
      ) : null}
    </div>
  )
}

function PreferenceDocuments() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['private-acu', 'self-memory'],
    queryFn: getPrivateACUMemory,
    retry: false,
  })
  if (query.isLoading) return <Skeleton className='h-48 w-full rounded-lg' />
  const preferences = query.data?.skills ?? []
  if (!preferences.length) {
    return (
      <div className='border-border bg-muted/15 rounded-md border p-5'>
        <div className='text-sm font-medium'>{t('No Preference MD yet')}</div>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t(
            'This is a normal starting state. When account learning captures useful feedback or preferences, the result will appear here.'
          )}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-3'>
      {preferences.map((preference) => (
        <details
          key={preference.id}
          className='border-border bg-card rounded-md border p-4'
        >
          <summary className='cursor-pointer list-none'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='font-medium break-words'>
                  {preferenceDisplayText(preference.name) || t('Preference MD')}
                </div>
                <p className='text-muted-foreground mt-1 text-xs break-words'>
                  {preferenceDisplayText(preference.description)}
                </p>
              </div>
              <Badge variant='secondary'>{t('Preference MD')}</Badge>
            </div>
            <div className='mt-2'>
              <PreferenceDocumentIdentity id={preference.id} />
            </div>
          </summary>
          <div className='mt-4 space-y-3 border-t pt-4'>
            {preference.files.map((file) => (
              <article key={file.path} className='bg-muted/25 rounded-md p-3'>
                <div className='text-muted-foreground text-xs'>
                  {t('Preference document')}
                </div>
                <pre className='mt-2 max-h-96 overflow-auto text-xs leading-5 whitespace-pre-wrap'>
                  {preferenceDisplayText(file.content || t('No content'))}
                </pre>
              </article>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

export function PrivateACUUserOverview() {
  const { t } = useTranslation()
  return (
    <div className='space-y-7'>
      <section className='border-border overflow-hidden rounded-lg border bg-[linear-gradient(120deg,rgba(16,185,129,0.08),transparent_45%),linear-gradient(300deg,rgba(14,165,233,0.07),transparent_40%)] p-5 sm:p-7'>
        <Badge variant='outline' className='mb-4 gap-1.5'>
          <BrainCircuit className='size-3.5' />
          {t('Account learning and reference')}
        </Badge>
        <h1 className='max-w-3xl text-2xl leading-tight font-semibold'>
          {t('Private ACU learns from your preferences and experience')}
        </h1>
        <p className='text-muted-foreground mt-3 max-w-4xl text-sm leading-6'>
          {t(
            'It can turn explicit feedback and recurring preferences into a visible Preference MD, observe work in the background, and offer optional Advisor reference for later requests.'
          )}
        </p>
      </section>

      <section className='grid gap-3 md:grid-cols-3'>
        {[
          {
            icon: BookOpen,
            title: t('Account learning'),
            text: t(
              'Learns from explicit feedback and useful interaction experience.'
            ),
          },
          {
            icon: Eye,
            title: t('Observer'),
            text: t('Reviews selected completed calls in the background.'),
          },
          {
            icon: Bell,
            title: t('Advisor'),
            text: t(
              'Provides optional reference and never decides the task for you.'
            ),
          },
        ].map(({ icon: Icon, title, text }) => (
          <article
            key={title}
            className='border-border bg-card rounded-md border p-4'
          >
            <Icon className='text-primary size-5' />
            <h2 className='mt-4 text-sm font-semibold'>{title}</h2>
            <p className='text-muted-foreground mt-1 text-xs leading-5'>
              {text}
            </p>
          </article>
        ))}
      </section>

      <StatusPanel />
      <PrivateACUUserSettings />
      <UsageSummary />

      <section className='grid gap-3 md:grid-cols-3'>
        {[
          {
            to: '/private-acu/account',
            icon: FileText,
            title: t('Preference MD'),
            text: t('View what your account has accumulated.'),
          },
          {
            to: '/private-acu/learning-runs',
            icon: ListChecks,
            title: t('Learning runs'),
            text: t('Review recent account learning results.'),
          },
          {
            to: '/private-acu/advisor',
            icon: Bell,
            title: t('Advisor'),
            text: t('Review advice, feedback, and notification settings.'),
          },
        ].map(({ to, icon: Icon, title, text }) => (
          <article
            key={to}
            className='border-border bg-card flex flex-col justify-between rounded-md border p-4'
          >
            <div>
              <Icon className='text-muted-foreground size-5' />
              <h2 className='mt-4 text-sm font-semibold'>{title}</h2>
              <p className='text-muted-foreground mt-1 text-xs'>{text}</p>
            </div>
            <Button
              className='mt-4 self-end'
              variant='ghost'
              size='sm'
              render={<Link to={to} />}
            >
              {t('Open')}
              <ArrowRight />
            </Button>
          </article>
        ))}
      </section>
    </div>
  )
}

export function PrivateACUUserAccount() {
  const { t } = useTranslation()
  return (
    <div className='space-y-6'>
      <section>
        <h1 className='text-xl font-semibold'>{t('Preference MD')}</h1>
        <p className='text-muted-foreground mt-2 max-w-3xl text-sm leading-6'>
          {t(
            'Preference MD records reusable preferences and ways to avoid repeating past mistakes. It is account reference, not a separate capability module.'
          )}
        </p>
      </section>
      <PreferenceDocuments />
    </div>
  )
}

export function LearningRunDetail(props: {
  detail?: PrivateACULearningRunSelfDetail
  loading: boolean
  error: boolean
}) {
  const { t } = useTranslation()
  const documentAnchor = useId()
  if (props.loading) {
    return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  }
  if (props.error || !props.detail) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Unable to load learning run details')}
      </p>
    )
  }
  const detail = props.detail
  const distilledContext = detail.distillation.distilled_context
  const changeTypeLabel: Record<string, string> = {
    created: t('Learning document created'),
    updated: t('Learning document updated'),
    deleted: t('Learning document deleted'),
  }
  return (
    <div className='space-y-5 overflow-y-auto px-4 pb-6'>
      <section className='grid gap-2 sm:grid-cols-3'>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>{t('Result')}</div>
          <div className='mt-1'>
            <Badge variant='outline'>{detail.status}</Badge>
          </div>
        </div>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Preference rules')}
          </div>
          <div className='mt-1 text-lg font-semibold'>
            {detail.elementCount}
          </div>
        </div>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Documents changed')}
          </div>
          <div className='mt-1 text-sm font-semibold'>
            {t('Preference document count', { count: detail.skillChangeCount })}
          </div>
        </div>
      </section>

      {detail.skillChanges.length ? (
        <section aria-label={t('Changed documents')} className='space-y-2'>
          <h3 className='text-sm font-semibold'>{t('Changed documents')}</h3>
          <ul className='border-border divide-border divide-y border-y'>
            {detail.skillChanges.map((change, index) => (
              <li
                key={`${change.skillId}-${change.changeType}`}
                className='grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3'
              >
                <button
                  type='button'
                  className='text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex min-w-0 items-start gap-2 rounded-sm text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none'
                  aria-controls={`${documentAnchor}-${index}`}
                  onClick={() => {
                    const target = document.getElementById(
                      `${documentAnchor}-${index}`
                    )
                    target?.scrollIntoView({ block: 'start' })
                    target?.focus({ preventScroll: true })
                  }}
                >
                  <FileText
                    className='mt-0.5 size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='min-w-0 break-all'>
                    {preferenceDisplayText(change.name) || t('Preference MD')}
                  </span>
                </button>
                <Badge variant='secondary'>
                  {changeTypeLabel[change.changeType] || change.changeType}
                </Badge>
                <div className='col-span-2 min-w-0 pl-6'>
                  <PreferenceDocumentIdentity id={change.skillId} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {distilledContext ? (
        <section className='space-y-2'>
          <h3 className='text-sm font-semibold'>{t('What was learned')}</h3>
          <div className='border-border bg-muted/20 rounded-md border p-3 text-sm leading-6 whitespace-pre-wrap'>
            {preferenceDisplayText(
              typeof distilledContext === 'string'
                ? distilledContext
                : JSON.stringify(distilledContext, null, 2)
            )}
          </div>
        </section>
      ) : null}

      <section className='space-y-3'>
        <div>
          <h3 className='text-sm font-semibold'>
            {t('Preference MD changes')}
          </h3>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'See which Preference MD documents were added, updated, or deleted.'
            )}
          </p>
        </div>
        {detail.skillChanges.length ? (
          detail.skillChanges.map((change, index) => (
            <article
              key={`${change.skillId}-${change.changeType}`}
              id={`${documentAnchor}-${index}`}
              aria-label={
                preferenceDisplayText(change.name) || t('Preference MD')
              }
              tabIndex={-1}
              className='border-border focus-visible:ring-ring scroll-mt-3 rounded-md border p-3 focus-visible:ring-2 focus-visible:outline-none'
            >
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='min-w-0 flex-1'>
                  <h4 className='text-sm font-medium break-words'>
                    {preferenceDisplayText(change.name)}
                  </h4>
                  <div className='mt-1'>
                    <PreferenceDocumentIdentity id={change.skillId} />
                  </div>
                  {change.descriptionAfter &&
                  change.descriptionAfter !== change.descriptionBefore ? (
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                      {preferenceDisplayText(change.descriptionAfter)}
                    </p>
                  ) : null}
                </div>
                <Badge variant='secondary'>
                  {changeTypeLabel[change.changeType] || change.changeType}
                </Badge>
              </div>
              {change.files.map((file) => (
                <details
                  key={file.path}
                  className='border-border/70 mt-3 rounded-md border'
                  open
                >
                  <summary className='cursor-pointer px-3 py-2 font-mono text-xs'>
                    {preferenceDocumentLabel(
                      file.path,
                      t('Preference document')
                    )}
                  </summary>
                  <div className='grid gap-3 border-t p-3 lg:grid-cols-2'>
                    {file.before ? (
                      <div>
                        <div className='text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase'>
                          {t('Before')}
                        </div>
                        <pre className='bg-muted/30 max-h-64 overflow-auto rounded-md p-2 text-xs leading-5 whitespace-pre-wrap'>
                          {preferenceDisplayText(file.before)}
                        </pre>
                      </div>
                    ) : null}
                    {file.after ? (
                      <div>
                        <div className='text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase'>
                          {t('After')}
                        </div>
                        <pre className='bg-muted/30 max-h-64 overflow-auto rounded-md border p-2 text-xs leading-5 whitespace-pre-wrap'>
                          {preferenceDisplayText(file.after)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                  {file.diff ? (
                    <details className='border-border/70 border-t' open>
                      <summary className='text-muted-foreground cursor-pointer px-3 py-2 text-[11px] font-semibold tracking-wide uppercase'>
                        {t('View document diff')}
                      </summary>
                      <DocumentDiff value={file.diff} />
                    </details>
                  ) : null}
                </details>
              ))}
            </article>
          ))
        ) : (
          <div className='border-border bg-muted/15 rounded-md border p-4 text-sm'>
            {t('No real Preference MD changes')}
          </div>
        )}
      </section>
    </div>
  )
}

function DocumentDiff(props: { value: string }) {
  return (
    <pre className='bg-muted/20 mx-3 mb-3 max-h-72 overflow-auto rounded-md border p-2 text-xs leading-5'>
      {props.value.split('\n').map((line, index) => {
        const marker = line[0]
        let className = 'text-muted-foreground'
        if (marker === '+') {
          className = 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
        } else if (marker === '-') {
          className = 'bg-red-500/15 text-red-800 dark:text-red-200'
        }
        return (
          <span
            // oxlint-disable-next-line react/no-array-index-key -- immutable diffs can contain duplicate lines
            key={`${index}-${line}`}
            className={`block min-w-max px-1 ${className}`}
          >
            {preferenceDisplayText(line) || ' '}
          </span>
        )
      })}
    </pre>
  )
}

export function PrivateACUUserLearningRuns() {
  const { t } = useTranslation()
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const query = useQuery({
    queryKey: ['private-acu', 'self-learning-runs'],
    queryFn: getPrivateACULearningRuns,
    retry: false,
  })
  const detailQuery = useQuery({
    queryKey: ['private-acu', 'self-learning-run', selectedRunId],
    queryFn: () => getPrivateACULearningRunDetail(selectedRunId || ''),
    enabled: Boolean(selectedRunId),
    retry: false,
  })
  let runsContent = (
    <div className='border-border bg-muted/15 rounded-md border p-5'>
      <div className='text-sm font-medium'>{t('No learning runs yet')}</div>
      <p className='text-muted-foreground mt-1 text-sm'>
        {t(
          'Enable account learning to begin building Preference MD from future feedback.'
        )}
      </p>
    </div>
  )
  if (query.isLoading) {
    runsContent = <Skeleton className='h-56 w-full rounded-lg' />
  } else if (query.data?.length) {
    runsContent = (
      <div className='border-border overflow-auto rounded-md border'>
        <div className='bg-muted/40 grid min-w-[20rem] grid-cols-[minmax(0,1fr)_5rem_6.5rem_1rem] gap-2 px-4 py-2 text-xs font-medium sm:min-w-[40rem] sm:grid-cols-[minmax(0,1fr)_8rem_8rem_2rem] sm:gap-3'>
          <span>{t('Time')}</span>
          <span>{t('Result')}</span>
          <span>{t('Documents changed')}</span>
          <span />
        </div>
        {query.data.map((run) => (
          <button
            type='button'
            key={`${run.receivedAt}-${run.status}-${run.preferenceChangeCount}`}
            className='border-border hover:bg-muted/30 grid w-full min-w-[20rem] grid-cols-[minmax(0,1fr)_5rem_6.5rem_1rem] items-center gap-2 border-t px-4 py-3 text-left text-xs transition-colors sm:min-w-[40rem] sm:grid-cols-[minmax(0,1fr)_8rem_8rem_2rem] sm:gap-3 sm:text-sm'
            onClick={() => setSelectedRunId(run.runId)}
          >
            <span>{new Date(run.receivedAt).toLocaleString()}</span>
            <span>
              <Badge variant='outline'>{run.status}</Badge>
            </span>
            <span>
              {t('Preference document count', { count: run.skillChangeCount })}
            </span>
            <ChevronRight className='text-muted-foreground size-4' />
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className='space-y-5'>
      <section>
        <h1 className='text-xl font-semibold'>{t('Learning runs')}</h1>
        <p className='text-muted-foreground mt-2 max-w-3xl text-sm leading-6'>
          {t(
            'Each item represents one account learning attempt. Internal prompts, providers, and raw context are not shown here.'
          )}
        </p>
      </section>
      {runsContent}
      <Sheet
        open={Boolean(selectedRunId)}
        onOpenChange={(open) => !open && setSelectedRunId(undefined)}
      >
        <SheetContent side='right' className='w-full sm:max-w-3xl'>
          <SheetHeader>
            <SheetTitle>{t('Learning run detail')}</SheetTitle>
            <SheetDescription>{selectedRunId || '-'}</SheetDescription>
          </SheetHeader>
          <LearningRunDetail
            detail={detailQuery.data}
            loading={detailQuery.isLoading}
            error={detailQuery.isError}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

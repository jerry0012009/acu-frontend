/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  RefreshCw,
  Route,
  Server,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { getACUSessionTrace } from '../../api'
import type {
  ACUSessionTrace,
  ACUSessionTraceSegment,
} from '../../session-trace-types'
import {
  aggregateJudgeAttempts,
  isNeutralTraceCancellation,
  isSuccessfulTraceStatus,
  latestTraceRequest,
  traceTimingSummary,
} from './acu-session-trace-model'

interface ACUSessionTracePanelProps {
  identifier: string
}

function elapsedLabel(value: number | null): string {
  if (value == null || value <= 0) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`
}

function cashLabel(value: number | null | undefined): string {
  if (value == null) return '—'
  return `¥${value.toFixed(value < 0.01 ? 6 : 4)}`
}

function latestRoute(trace: ACUSessionTrace) {
  return [...trace.segments].reverse().find((segment) => segment.route)?.route
}

function uniqueRoute(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(' → ') || '—'
}

function segmentRequestSummary(segment: ACUSessionTraceSegment) {
  const completed = segment.logicalRequests.filter((request) =>
    isSuccessfulTraceStatus(request.status)
  ).length
  const cancelled = segment.logicalRequests.filter(
    (request) => request.status === 'cancelled'
  ).length
  const running = segment.logicalRequests.filter((request) =>
    ['pending', 'started', 'running'].includes(request.status)
  ).length
  return { completed, cancelled, running }
}

function attemptStatusClass(status: string): string {
  if (isSuccessfulTraceStatus(status)) return 'text-emerald-600'
  if (status === 'cancelled') return 'text-muted-foreground'
  return 'text-rose-600'
}

function TimingSummary(props: { trace: ACUSessionTrace }) {
  const { t } = useTranslation()
  const summary = traceTimingSummary(props.trace)
  const metrics: Array<[string, number | null]> = [
    [t('Wall-clock total'), summary.wallClockMs],
    [t('Judge accumulated attempts'), summary.judgeAttemptMs],
    [t('Provider accumulated attempts'), summary.providerAttemptMs],
  ]

  return (
    <div className='min-w-0'>
      <div className='mb-2 flex items-center gap-2 text-xs font-medium'>
        <Clock3 className='size-3.5' aria-hidden='true' />
        {t('Timing summary')}
      </div>
      <div className='bg-border grid gap-px overflow-hidden rounded border sm:grid-cols-3'>
        {metrics.map(([label, value]) => (
          <div key={label} className='bg-background min-w-0 px-3 py-2'>
            <div className='text-muted-foreground text-[11px]'>{label}</div>
            <div className='mt-1 font-medium tabular-nums'>
              {elapsedLabel(value)}
            </div>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground mt-1.5 text-[11px]'>
        {t(
          'Accumulated attempt time may exceed wall-clock time because retries and segments are counted separately.'
        )}
      </p>
    </div>
  )
}

function AttemptTimeline(props: { segment: ACUSessionTraceSegment }) {
  const { t } = useTranslation()
  const judgeAttempts = aggregateJudgeAttempts(
    props.segment.judge?.attempts ?? []
  )
  return (
    <div className='grid min-w-0 gap-3 lg:grid-cols-2'>
      <div className='min-w-0'>
        <div className='mb-1.5 flex items-center gap-1.5 text-xs font-medium'>
          <Bot className='size-3.5' aria-hidden='true' /> {t('Judge attempts')}
        </div>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {judgeAttempts.length ? (
            judgeAttempts.map((attempt, index) => (
              <div
                key={`${attempt.role}-${attempt.model}-${attempt.provider}-${attempt.status}-${attempt.httpStatus ?? ''}-${attempt.backupReason ?? ''}`}
                className='flex min-w-0 items-center gap-1.5'
              >
                {index > 0 && (
                  <ChevronRight
                    className='text-muted-foreground size-3'
                    aria-hidden='true'
                  />
                )}
                <div className='bg-muted/40 min-w-0 rounded border px-2 py-1.5 text-[11px]'>
                  <div className='truncate font-medium'>
                    {attempt.model} · {attempt.role}
                    {attempt.count > 1 ? ` ×${attempt.count}` : ''}
                  </div>
                  <div className={attemptStatusClass(attempt.status)}>
                    {attempt.status}
                    {attempt.httpStatus ? ` · ${attempt.httpStatus}` : ''} ·{' '}
                    {elapsedLabel(attempt.latencyMs)}
                  </div>
                  {attempt.backupReason && (
                    <div className='text-muted-foreground mt-0.5 break-words'>
                      {attempt.backupReason}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>
              {props.segment.judge?.judgeReused
                ? t('Judge reused')
                : t('Judge unavailable')}
            </span>
          )}
        </div>
      </div>
      <div className='min-w-0'>
        <div className='mb-1.5 flex items-center gap-1.5 text-xs font-medium'>
          <Server className='size-3.5' aria-hidden='true' />{' '}
          {t('Provider attempts')}
        </div>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {props.segment.providerAttempts.map((attempt, index) => (
            <div
              key={`${attempt.attemptIndex}-${attempt.channel}`}
              className='flex min-w-0 items-center gap-1.5'
            >
              {index > 0 && (
                <ChevronRight
                  className='text-muted-foreground size-3'
                  aria-hidden='true'
                />
              )}
              <div className='bg-muted/40 min-w-0 rounded border px-2 py-1.5 text-[11px]'>
                <div className='truncate font-medium'>
                  {attempt.model} · {attempt.provider} · {attempt.channel}
                </div>
                <div className={attemptStatusClass(attempt.status)}>
                  {attempt.status}
                  {attempt.httpStatus ? ` · ${attempt.httpStatus}` : ''} ·{' '}
                  {elapsedLabel(attempt.latencyMs)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ACUSessionTraceView(props: { trace: ACUSessionTrace }) {
  const { t } = useTranslation()
  const request = latestTraceRequest(props.trace)
  const route = latestRoute(props.trace)
  const judges = props.trace.segments
    .map((segment) => segment.judge)
    .filter(Boolean)
  const allJudgeAttempts = judges.flatMap((judge) => judge?.attempts ?? [])
  const groupedJudgeAttempts = aggregateJudgeAttempts(allJudgeAttempts)
  let judgeLabel = t('Judge unavailable')
  if (allJudgeAttempts.length) {
    judgeLabel = t('{{count}} Judge attempts', {
      count: allJudgeAttempts.length,
    })
  } else if (judges.some((judge) => judge?.judgeReused)) {
    judgeLabel = t('Judge reused')
  }
  const selectedModel =
    route?.selectedCanonicalModel || request?.actualModel || '—'
  const segmentJudgeLabel = (segment: ACUSessionTraceSegment): string => {
    if (segment.judge?.judgeReused) return t('Judge reused')
    if (segment.judge?.judgeCalls) return t('Judge new')
    return segment.judgeStatusReason || t('Legacy segment has no Judge record')
  }
  const executionRoute = uniqueRoute(
    props.trace.segments.map(
      (segment) => segment.route?.selectedCanonicalModel || ''
    )
  )
  const judgeRoute =
    groupedJudgeAttempts
      .map(
        (attempt) =>
          `${attempt.model}${attempt.count > 1 ? ` ×${attempt.count}` : ''}`
      )
      .join(' → ') || '—'
  let requestStatusVariant: 'green' | 'neutral' | 'red' = 'red'
  if (isSuccessfulTraceStatus(request?.status)) requestStatusVariant = 'green'
  else if (isNeutralTraceCancellation(request)) requestStatusVariant = 'neutral'

  return (
    <section
      className='border-border/70 min-w-0 space-y-4 rounded-md border p-3 sm:p-4'
      aria-label={t('ACU Session Trace')}
    >
      <div className='flex min-w-0 flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex min-w-0 items-center gap-2'>
            <Route
              className='size-4 shrink-0 text-cyan-700'
              aria-hidden='true'
            />
            <h3 className='truncate text-sm font-semibold'>
              ACU Auto → {selectedModel}
            </h3>
          </div>
          <p className='text-muted-foreground mt-1 truncate text-xs'>
            {t('Execution models')}: {executionRoute}
          </p>
          <p className='text-muted-foreground mt-1 truncate text-xs'>
            {t('Judge models')}: {judgeRoute} · {judgeLabel}
          </p>
        </div>
        <StatusBadge
          label={t(request?.status || props.trace.session.status)}
          variant={requestStatusVariant}
          size='sm'
          copyable={false}
        />
      </div>

      <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-6'>
        <div>
          <div className='text-muted-foreground'>{t('Total')}</div>
          <div className='font-medium tabular-nums'>
            {elapsedLabel(request?.totalLatencyMs ?? 0)}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('First byte')}</div>
          <div className='font-medium tabular-nums'>
            {elapsedLabel(request?.firstTokenLatencyMs ?? null)}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('Difficulty')}</div>
          <div className='font-medium tabular-nums'>
            {judges.at(-1)?.difficulty?.toFixed(1) ?? '—'}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('Provider')}</div>
          <div className='truncate font-medium'>
            {route?.selectedProvider || '—'}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('User charge')}</div>
          <div className='font-medium tabular-nums'>
            {cashLabel(request?.userChargeCny)}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('Cash cost')}</div>
          <div className='font-medium tabular-nums'>
            {cashLabel(request?.actualCashCostCny)}
          </div>
        </div>
      </div>

      <TimingSummary trace={props.trace} />

      <div className='space-y-2'>
        <div className='flex items-center gap-1.5 text-xs font-medium'>
          <GitBranch className='size-3.5' aria-hidden='true' /> {t('Segments')}
        </div>
        {props.trace.segments.map((segment, index) => (
          <article
            key={segment.segmentId}
            className='border-l-2 border-cyan-600/40 pl-3'
          >
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
              <span className='font-semibold'>
                {index + 1}. {segment.workPhase || segment.phase}{' '}
                {segment.workPhaseQualityTargetOffset
                  ? `(${segment.workPhaseQualityTargetOffset > 0 ? '+' : ''}${segment.workPhaseQualityTargetOffset})`
                  : ''}
              </span>
              <span className='text-muted-foreground'>
                {segment.creationReason}
              </span>
              <span>{segmentJudgeLabel(segment)}</span>
              {segment.judge && (
                <span className='tabular-nums'>
                  D {segment.judge.difficulty.toFixed(1)}
                </span>
              )}
              {segment.route && (
                <span>
                  {segment.route.selectedDisplayName ||
                    segment.route.selectedCanonicalModel}
                </span>
              )}
              {segment.judge?.routeRefreshReason && (
                <span className='text-muted-foreground'>
                  {segment.judge.routeRefreshReason}
                </span>
              )}
              <span className='text-muted-foreground'>
                {segment.logicalRequests.length} {t('requests')}
              </span>
              <span className='text-muted-foreground'>
                {segmentRequestSummary(segment).completed} {t('completed')} ·{' '}
                {segmentRequestSummary(segment).cancelled}{' '}
                {t('client cancelled')} ·{' '}
                {segmentRequestSummary(segment).running} {t('running')}
              </span>
            </div>
            <div className='mt-2'>
              <AttemptTimeline segment={segment} />
            </div>
            {segment.route && (
              <details className='mt-2 text-xs'>
                <summary className='cursor-pointer font-medium'>
                  {t('Routing decision')}
                </summary>
                <div className='text-muted-foreground mt-2 grid gap-3 sm:grid-cols-3'>
                  <div>
                    <div>
                      {t('Candidate')}:{' '}
                      {segment.route.selectedCandidateId ||
                        segment.route.selectedCanonicalModel}
                    </div>
                    <div>
                      {t('Preset')}:{' '}
                      {segment.route.selectedExecutionPresetId || t('base')}
                    </div>
                  </div>
                  <div>
                    <div>
                      {t('Reasoning')}:{' '}
                      {segment.route.clientRequestedReasoningEffort ||
                        t('none')}{' '}
                      → {segment.route.presetReasoningEffort || t('base')} →{' '}
                      {segment.route.resolvedReasoningEffort || t('default')}
                    </div>
                    <div>
                      {segment.route.reasoningMappingStatus || 'model_default'}
                    </div>
                  </div>
                  <div>
                    <div>
                      {t('Judge source')}:{' '}
                      {segment.judge?.resultSource || t('n/a')}
                    </div>
                    <div>
                      {t('Tokens')}:{' '}
                      {segment.logicalRequests
                        .reduce((sum, item) => sum + (item.inputTokens ?? 0), 0)
                        .toLocaleString()}{' '}
                      {t('in')} ·{' '}
                      {segment.logicalRequests
                        .reduce(
                          (sum, item) => sum + (item.outputTokens ?? 0),
                          0
                        )
                        .toLocaleString()}{' '}
                      {t('out')}
                    </div>
                  </div>
                </div>
                <div className='mt-2'>
                  {(segment.route.topCandidates ?? []).map((candidate) => (
                    <div
                      key={candidate.candidateId}
                      className='grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] gap-2 py-0.5'
                    >
                      <span className='truncate'>
                        {candidate.selected ? `${t('Selected')} · ` : ''}
                        {candidate.displayName}
                      </span>
                      <span>Q {candidate.estimatedQuality.toFixed(1)}</span>
                      <span>{cashLabel(candidate.estimatedCallCost)}</span>
                      <span>U {candidate.valueUtility.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {segment.judge?.explanation && (
              <details className='mt-2 text-xs'>
                <summary className='cursor-pointer font-medium'>
                  {t('Judge explanation')}
                </summary>
                <p className='text-muted-foreground mt-1 break-words whitespace-pre-wrap'>
                  {segment.judge.explanation}
                </p>
              </details>
            )}
            <details className='mt-2 text-xs'>
              <summary className='cursor-pointer font-medium'>
                {t('Request details')}
              </summary>
              {segment.logicalRequests.map((logical) => {
                if (
                  logical.deliveryStatus === 'client_cancelled_after_output'
                ) {
                  return (
                    <div
                      key={logical.logicalRequestId}
                      className='mt-2 rounded border p-2 text-xs'
                    >
                      <div className='font-medium'>
                        {t('Client ended stream')}
                      </div>
                      <div className='text-muted-foreground mt-1'>
                        {t(
                          'Visible output was produced. Recovery was skipped to avoid duplicate generation.'
                        )}
                      </div>
                    </div>
                  )
                }
                if (
                  logical.deliveryStatus === 'client_cancelled_before_output'
                ) {
                  return (
                    <div
                      key={logical.logicalRequestId}
                      className='mt-2 rounded border p-2 text-xs'
                    >
                      {t('Client disconnected before receiving output')}
                    </div>
                  )
                }
                return logical.errorDiagnosis ? (
                  <div
                    key={logical.logicalRequestId}
                    className='mt-2 rounded border border-rose-500/30 bg-rose-500/5 p-2 text-xs'
                  >
                    <div className='flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-300'>
                      <AlertTriangle className='size-3.5' aria-hidden='true' />{' '}
                      {t('Error diagnosis')}
                    </div>
                    <div className='mt-1 grid gap-1 sm:grid-cols-2'>
                      <span>
                        {t('Source')}: {logical.errorDiagnosis.errorSource}
                      </span>
                      <span className='break-all'>
                        {t('Endpoint')}:{' '}
                        {logical.errorDiagnosis.endpoint || '—'}
                      </span>
                      <span>CF-Ray: {logical.errorDiagnosis.cfRay || '—'}</span>
                      <span>
                        {t('First byte')}:{' '}
                        {logical.errorDiagnosis.firstByteReceived && t('Yes')}
                        {!logical.errorDiagnosis.firstByteReceived &&
                          logical.errorDiagnosis.visibleBytes > 0 &&
                          t('Not recorded')}
                        {!logical.errorDiagnosis.firstByteReceived &&
                          logical.errorDiagnosis.visibleBytes === 0 &&
                          t('No')}
                      </span>
                      <span>
                        {t('Visible bytes')}:{' '}
                        {logical.errorDiagnosis.visibleBytes}
                      </span>
                      <span>
                        {t('Recovery eligible')}:{' '}
                        {logical.errorDiagnosis.recoveryEligible
                          ? t('Yes')
                          : t('No')}
                      </span>
                      <span>
                        {t('Recovery executed')}:{' '}
                        {logical.errorDiagnosis.recoveryExecuted
                          ? t('Yes')
                          : t('No')}
                      </span>
                      {logical.errorDiagnosis.recoveryReason && (
                        <span className='break-words sm:col-span-2'>
                          {logical.errorDiagnosis.recoveryReason}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null
              })}
            </details>
          </article>
        ))}
      </div>
      <div className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
        <CheckCircle2 className='size-3' aria-hidden='true' />{' '}
        {t('Raw payloads, headers, and secrets are not included.')}
      </div>
    </section>
  )
}

export function ACUSessionTracePanel(props: ACUSessionTracePanelProps) {
  const { t } = useTranslation()
  const traceQuery = useQuery({
    queryKey: ['acu-session-trace', props.identifier],
    queryFn: () => getACUSessionTrace(props.identifier),
    enabled: props.identifier.length > 0,
    staleTime: 30_000,
  })
  if (traceQuery.isPending) {
    return (
      <div
        className='space-y-4 rounded border p-4'
        aria-label={t('Loading ACU Session Trace…')}
      >
        <div className='flex items-center justify-between gap-4'>
          <Skeleton className='h-5 w-56' />
          <Skeleton className='h-5 w-20' />
        </div>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className='h-12 w-full' />
          ))}
        </div>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    )
  }
  if (
    traceQuery.isError ||
    !traceQuery.data?.success ||
    !traceQuery.data.data
  ) {
    return (
      <div className='rounded border p-4 text-sm'>
        <div className='text-muted-foreground'>
          {t('ACU Session Trace is unavailable.')}
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='mt-3'
          onClick={() => void traceQuery.refetch()}
        >
          <RefreshCw className='mr-1.5 size-3.5' aria-hidden='true' />
          {t('Retry')}
        </Button>
      </div>
    )
  }
  return <ACUSessionTraceView trace={traceQuery.data.data} />
}

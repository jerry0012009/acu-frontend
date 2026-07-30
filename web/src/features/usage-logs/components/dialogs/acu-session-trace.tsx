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
  Route,
  Server,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/utils'

import { getACUSessionTrace } from '../../api'
import type {
  ACUSessionTrace,
  ACUSessionTraceSegment,
} from '../../session-trace-types'

interface ACUSessionTracePanelProps {
  identifier: string
}

function elapsedLabel(value: number | null): string {
  if (value == null || value <= 0) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`
}

function cashLabel(value: number): string {
  return `¥${value.toFixed(value < 0.01 ? 6 : 4)}`
}

function latestRequest(trace: ACUSessionTrace) {
  return trace.segments.flatMap((segment) => segment.logicalRequests).at(-1)
}

function latestRoute(trace: ACUSessionTrace) {
  return [...trace.segments].reverse().find((segment) => segment.route)?.route
}

function Waterfall(props: { trace: ACUSessionTrace }) {
  const { t } = useTranslation()
  const request = latestRequest(props.trace)
  const judgeMs = props.trace.segments.reduce(
    (total, segment) =>
      total + (segment.judge?.judgeCalls ? segment.judge.latencyMs : 0),
    0
  )
  const providerMs = props.trace.segments.reduce(
    (total, segment) =>
      total +
      segment.providerAttempts.reduce(
        (sum, attempt) => sum + attempt.latencyMs,
        0
      ),
    0
  )
  const totalMs = Math.max(request?.totalLatencyMs ?? judgeMs + providerMs, 1)
  const stages = [
    {
      label: t('Request'),
      value: Math.max(totalMs - judgeMs - providerMs, 1),
      tone: 'bg-slate-400',
    },
    { label: t('Judge'), value: Math.max(judgeMs, 1), tone: 'bg-cyan-600' },
    { label: t('Route'), value: 1, tone: 'bg-violet-500' },
    {
      label: t('Provider'),
      value: Math.max(providerMs, 1),
      tone: 'bg-amber-500',
    },
    {
      label: request?.status === 'success' ? t('Complete') : t('Error'),
      value: 1,
      tone: request?.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500',
    },
  ]

  return (
    <div className='min-w-0'>
      <div className='mb-2 flex items-center gap-2 text-xs font-medium'>
        <Clock3 className='size-3.5' aria-hidden='true' />
        {t('Request waterfall')}
      </div>
      <div
        className='grid min-w-[520px] gap-1 overflow-hidden rounded border p-1'
        style={{
          gridTemplateColumns: stages
            .map((stage) => `${Math.max(stage.value / totalMs, 0.08)}fr`)
            .join(' '),
        }}
      >
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={cn(
              'min-w-0 rounded px-2 py-2 text-center text-[11px] font-medium text-white',
              stage.tone
            )}
          >
            <div className='truncate'>{stage.label}</div>
            <div className='truncate opacity-80'>
              {elapsedLabel(stage.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AttemptTimeline(props: { segment: ACUSessionTraceSegment }) {
  const { t } = useTranslation()
  return (
    <div className='grid min-w-0 gap-3 lg:grid-cols-2'>
      <div className='min-w-0'>
        <div className='mb-1.5 flex items-center gap-1.5 text-xs font-medium'>
          <Bot className='size-3.5' aria-hidden='true' /> {t('Judge attempts')}
        </div>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {props.segment.judge?.attempts.length ? (
            props.segment.judge.attempts.map((attempt, index) => (
              <div
                key={`${attempt.role}-${attempt.model}-${attempt.provider}-${attempt.latencyMs}`}
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
                  </div>
                  <div
                    className={
                      attempt.status === 'success'
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }
                  >
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
                <div
                  className={
                    attempt.status === 'success'
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }
                >
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
  const request = latestRequest(props.trace)
  const route = latestRoute(props.trace)
  const judges = props.trace.segments
    .map((segment) => segment.judge)
    .filter(Boolean)
  const judgeLabel = judges.some((judge) => judge?.judgeReused)
    ? t('Judge reused')
    : judges
        .flatMap((judge) => judge?.attempts ?? [])
        .map((attempt) => attempt.model)
        .join(' → ') || t('Judge unavailable')
  const selectedModel =
    route?.selectedCanonicalModel || request?.actualModel || '—'
  const segmentJudgeLabel = (segment: ACUSessionTraceSegment): string => {
    if (segment.judge?.judgeReused) return t('Judge reused')
    if (segment.judge?.judgeCalls) return t('Judge new')
    return t('Judge unavailable')
  }

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
            {judgeLabel}
          </p>
        </div>
        <StatusBadge
          label={request?.status || props.trace.session.status}
          variant={request?.status === 'success' ? 'green' : 'red'}
          size='sm'
          copyable={false}
        />
      </div>

      <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5'>
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
          <div className='text-muted-foreground'>{t('Actual cost')}</div>
          <div className='font-medium tabular-nums'>
            {cashLabel(request?.actualCostCny ?? 0)}
          </div>
        </div>
      </div>

      <div className='max-w-full overflow-x-auto pb-1'>
        <Waterfall trace={props.trace} />
      </div>

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
                {index + 1}. {segment.phase}
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
                <span>{segment.route.selectedCanonicalModel}</span>
              )}
              {segment.judge?.routeRefreshReason && (
                <span className='text-muted-foreground'>
                  {segment.judge.routeRefreshReason}
                </span>
              )}
              <span className='text-muted-foreground'>
                {segment.logicalRequests.length} {t('requests')}
              </span>
            </div>
            <div className='mt-2'>
              <AttemptTimeline segment={segment} />
            </div>
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
            {segment.logicalRequests.map(
              (logical) =>
                logical.errorDiagnosis && (
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
                        {logical.errorDiagnosis.firstByteReceived
                          ? t('Yes')
                          : t('No')}
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
                )
            )}
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
      <div className='text-muted-foreground rounded border p-3 text-xs'>
        {t('Loading ACU Session Trace…')}
      </div>
    )
  }
  if (traceQuery.isError || !traceQuery.data?.success || !traceQuery.data.data) {
    return (
      <div className='text-muted-foreground rounded border p-3 text-xs'>
        {t('ACU Session Trace is unavailable.')}
      </div>
    )
  }
  return <ACUSessionTraceView trace={traceQuery.data.data} />
}

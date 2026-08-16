import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'

import type { ACUSessionTrace } from '../../../session-trace-types'
import { ACUSessionTraceView } from '../acu-session-trace'
import {
  aggregateJudgeAttempts,
  isMissingACUSessionTrace,
  isNeutralTraceCancellation,
  isSuccessfulTraceStatus,
  traceTimingSummary,
} from '../acu-session-trace-model'

Object.defineProperty(globalThis, 'React', {
  configurable: true,
  value: React,
})

const trace: ACUSessionTrace = {
  session: {
    sessionId: 'ses_fixture',
    status: 'success',
    startedAt: '2026-07-30T14:00:00Z',
    lastActivityAt: '2026-07-30T14:03:00Z',
  },
  task: {
    taskId: 'task_fixture',
    goalSummary: 'Inspect server',
    status: 'success',
  },
  segments: [
    {
      segmentId: 'seg_1',
      creationReason: 'new_task',
      phase: 'execution',
      status: 'superseded',
      startedAt: '2026-07-30T14:00:00Z',
      workPhase: 'inspection',
      workPhaseQualityTargetOffset: -8,
      judge: {
        trigger: 'new_task',
        judgeCalls: 1,
        judgeReused: false,
        evaluationId: 'judge_1',
        model: 'mimo-v2.5-pro',
        provider: 'xiaomi_mimo',
        status: 'success',
        difficulty: 20,
        confidence: 0.9,
        explanation: 'Simple request.',
        inputTokens: 100,
        outputTokens: 20,
        latencyMs: 1000,
        attempts: [
          {
            role: 'primary',
            model: 'mimo-v2.5-pro',
            provider: 'xiaomi_mimo',
            status: 'success',
            latencyMs: 1000,
          },
        ],
      },
      route: {
        routeDecisionId: 'route_1',
        requestedModel: 'acu-auto',
        selectedCanonicalModel: 'gpt-5.4-mini',
        selectedProvider: 'lucen',
        selectedChannel: 'mini-a',
        modelSelectionReason: 'value',
        channelSelectionReason: 'health',
        candidateCount: 5,
        paretoFrontier: ['gpt-5.4-mini'],
        effectiveQualityTarget: 72,
      },
      logicalRequests: [
        {
          logicalRequestId: 'req_1',
          newApiLogId: 'log_1',
          requestId: 'native_1',
          requestedModel: 'acu-auto',
          actualModel: 'gpt-5.4-mini',
          status: 'success',
          startedAt: '2026-07-30T14:00:01Z',
          completedAt: '2026-07-30T14:00:05Z',
          totalLatencyMs: 4000,
          firstTokenLatencyMs: 500,
          visibleOutputBytes: 100,
          actualCostCny: 0.01,
        },
        {
          logicalRequestId: 'req_2',
          newApiLogId: 'log_2',
          requestId: 'native_2',
          requestedModel: 'acu-auto',
          actualModel: 'gpt-5.4-mini',
          status: 'success',
          startedAt: '2026-07-30T14:00:10Z',
          completedAt: '2026-07-30T14:00:12Z',
          totalLatencyMs: 2000,
          firstTokenLatencyMs: 300,
          visibleOutputBytes: 80,
          actualCostCny: 0.01,
        },
      ],
      providerAttempts: [],
    },
    {
      segmentId: 'seg_2',
      previousSegmentId: 'seg_1',
      creationReason: 'human_message',
      phase: 'recovery',
      status: 'active',
      startedAt: '2026-07-30T14:01:00Z',
      workPhase: 'planning',
      workPhaseQualityTargetOffset: 8,
      judge: {
        trigger: 'human_message',
        judgeCalls: 1,
        judgeReused: false,
        evaluationId: 'judge_2',
        model: 'deepseek-v4-flash',
        provider: 'closeai',
        status: 'success',
        difficulty: 49.4,
        confidence: 0.82,
        explanation: 'Backup selected after invalid JSON.',
        inputTokens: 200,
        outputTokens: 30,
        latencyMs: 1200,
        attempts: [
          {
            role: 'primary',
            model: 'mimo-v2.5-pro',
            provider: 'xiaomi_mimo',
            status: 'invalid_response',
            errorCategory: 'invalid_json',
            latencyMs: 500,
            backupReason: 'invalid_json',
          },
          {
            role: 'backup',
            model: 'deepseek-v4-flash',
            provider: 'closeai',
            status: 'success',
            latencyMs: 700,
          },
        ],
      },
      route: {
        routeDecisionId: 'route_2',
        requestedModel: 'acu-auto',
        selectedCanonicalModel: 'gpt-5.6-luna',
        selectedProvider: 'lucen',
        selectedChannel: 'luna-a',
        modelSelectionReason: 'best value',
        channelSelectionReason: 'preferred healthy channel',
        candidateCount: 5,
        paretoFrontier: ['gpt-5.6-luna', 'gpt-5.6-terra'],
        effectiveQualityTarget: 83,
      },
      logicalRequests: [
        {
          logicalRequestId: 'req_3',
          newApiLogId: 'log_3',
          requestId: 'native_3',
          requestedModel: 'acu-auto',
          actualModel: 'gpt-5.6-luna',
          status: 'success',
          startedAt: '2026-07-30T14:01:01Z',
          completedAt: '2026-07-30T14:03:00Z',
          totalLatencyMs: 119000,
          firstTokenLatencyMs: 110000,
          visibleOutputBytes: 200,
          userChargeCny: 0.22,
          actualCashCostCny: 0.18,
          actualCostCny: 0.18,
          errorDiagnosis: {
            errorSource: 'execution_provider_cloudflare',
            endpoint: 'https://provider.example/v1',
            cfRay: 'fixture-ray',
            firstByteReceived: false,
            visibleBytes: 7710,
            recoveryEligible: true,
            recoveryExecuted: true,
            recoveryReason: 'same model channel recovery',
          },
        },
      ],
      providerAttempts: [
        {
          attemptIndex: 1,
          model: 'gpt-5.6-luna',
          provider: 'lucen',
          channel: 'luna-a',
          endpoint: 'https://provider.example/v1',
          status: 'failed',
          httpStatus: 524,
          errorCategory: 'provider_http',
          startedAt: '2026-07-30T14:01:01Z',
          completedAt: '2026-07-30T14:02:40Z',
          latencyMs: 99000,
          firstTokenLatencyMs: null,
          visibleOutputBytes: 7710,
        },
        {
          attemptIndex: 2,
          model: 'gpt-5.6-luna',
          provider: 'closeai',
          channel: 'luna-b',
          endpoint: 'https://backup.example/v1',
          status: 'success',
          httpStatus: 200,
          startedAt: '2026-07-30T14:02:40Z',
          completedAt: '2026-07-30T14:03:00Z',
          latencyMs: 20000,
          firstTokenLatencyMs: 1000,
          visibleOutputBytes: 200,
          recoveryReason: 'same_model_channel_recovery',
        },
      ],
    },
  ],
}

test('renders two segments and complete Judge and Provider attempt chains without sensitive payloads', async () => {
  const i18n = createInstance()
  await i18n
    .use(initReactI18next)
    .init({ lng: 'en', resources: { en: { translation: {} } } })
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ACUSessionTraceView trace={trace} isAdmin />
    </I18nextProvider>
  )

  assert.match(html, /ACU Auto → gpt-5\.6-luna/)
  assert.match(html, /Execution models/)
  assert.match(html, /Judge models/)
  assert.match(html, /mimo-v2\.5-pro/)
  assert.match(html, /deepseek-v4-flash/)
  assert.match(html, /luna-a/)
  assert.match(html, /luna-b/)
  assert.match(html, /524/)
  assert.match(html, /fixture-ray/)
  assert.match(html, /Wall-clock total/)
  assert.match(html, /Judge accumulated attempts/)
  assert.match(html, /Provider accumulated attempts/)
  assert.match(html, /¥0\.2200/)
  assert.match(html, /Inspection/)
  assert.match(html, /Planning/)
  assert.match(html, /-8/)
  assert.match(html, /\+8/)
  assert.match(html, /Routing quality target/)
  assert.match(html, /72\.0/)
  assert.doesNotMatch(html, /Cash cost/)
  assert.doesNotMatch(html, /¥0\.1800/)
  assert.doesNotMatch(html, /estimatedCallCost|effectiveCostCny/)
  assert.doesNotMatch(html, /Authorization|API Key|raw payload body/)
})

test('hides provider, channel, and endpoint identities for ordinary users', async () => {
  const i18n = createInstance()
  await i18n
    .use(initReactI18next)
    .init({ lng: 'en', resources: { en: { translation: {} } } })
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ACUSessionTraceView trace={trace} />
    </I18nextProvider>
  )

  assert.match(
    html,
    new RegExp(
      publicChannelAlias('lucen', 'luna-a').replaceAll(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )
    )
  )
  assert.doesNotMatch(html, /lucen|closeai|luna-a|luna-b|provider\.example/)
  assert.doesNotMatch(html, /executionProfileId/)
})

test('keeps wall-clock and accumulated attempt time as separate metrics', () => {
  const summary = traceTimingSummary(trace)
  assert.equal(summary.wallClockMs, 119000)
  assert.equal(summary.judgeAttemptMs, 2200)
  assert.equal(summary.providerAttemptMs, 119000)
})

test('aggregates repeated Judge attempts without hiding their accumulated time', () => {
  const attempts = trace.segments[0].judge?.attempts
  assert.ok(attempts)
  const repeated = aggregateJudgeAttempts([
    attempts[0],
    { ...attempts[0], latencyMs: 750 },
  ])
  assert.equal(repeated.length, 1)
  assert.equal(repeated[0].count, 2)
  assert.equal(repeated[0].latencyMs, 1750)
})

test('uses the same successful status semantics as the timeline', () => {
  assert.equal(isSuccessfulTraceStatus('success'), true)
  assert.equal(isSuccessfulTraceStatus('completed'), true)
  assert.equal(isSuccessfulTraceStatus('completed_with_recovery'), true)
  assert.equal(isSuccessfulTraceStatus('failed'), false)
})

test('treats all explicitly client-cancelled requests as neutral', () => {
  const cancelled = structuredClone(trace)
  const request = cancelled.segments.at(-1)?.logicalRequests.at(-1)
  assert.ok(request)
  request.status = 'cancelled'
  request.deliveryStatus = 'client_cancelled_before_output'
  assert.equal(isNeutralTraceCancellation(request), true)
})

test('recognizes missing trace responses without treating network failures as not found', () => {
  assert.equal(
    isMissingACUSessionTrace({
      response: {
        status: 500,
        data: { message: 'ACU session trace was not found' },
      },
    }),
    true
  )
  assert.equal(
    isMissingACUSessionTrace({
      response: { status: 503, data: { message: 'upstream unavailable' } },
    }),
    false
  )
})

test('summarizes and neutrally renders cancellation after visible output', async () => {
  const neutral = structuredClone(trace)
  const latestSegment = neutral.segments.at(-1)
  assert.ok(latestSegment)
  const latest = latestSegment.logicalRequests.at(-1)
  assert.ok(latest)
  latest.status = 'cancelled'
  latest.deliveryStatus = 'client_cancelled_after_output'
  latest.visibleOutputBytes = 200
  const i18n = createInstance()
  await i18n
    .use(initReactI18next)
    .init({ lng: 'en', resources: { en: { translation: {} } } })
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ACUSessionTraceView trace={neutral} />
    </I18nextProvider>
  )

  assert.match(html, /Client ended stream/)
  assert.match(html, /client cancelled/)
  assert.doesNotMatch(html, /Error diagnosis.*Client ended stream/)
  assert.match(html, /text-muted-foreground/)
  assert.doesNotMatch(html, /text-destructive[^>]*>cancelled/)
})

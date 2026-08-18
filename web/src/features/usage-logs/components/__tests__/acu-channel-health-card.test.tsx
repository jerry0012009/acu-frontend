import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })
const domWindow = new Window({ url: 'http://localhost/' })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  value: domWindow.matchMedia.bind(domWindow),
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ACUChannelHealthCard } = await import('../acu-channel-health-card')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

test('shows separate Production and Probe evidence and expands all Profile evidence', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUChannelHealthCard
          generatedAt='2026-08-05T12:00:00Z'
          channel={{
            channel: 'cx006',
            providers: ['lucen'],
            enabledProfileCount: 1,
            eligibleProfileCount: 1,
            modelCount: 1,
            state: 'healthy',
            requestCount: 12,
            successCount: 11,
            availability: 11 / 12,
            buckets: Array.from({ length: 60 }, (_, index) => ({
              bucket: new Date(Date.UTC(2026, 7, 5, 0, index)).toISOString(),
              request_count: index === 59 ? 12 : 0,
              success_count: index === 59 ? 11 : 0,
              error_count: index === 59 ? 1 : 0,
            })) as never,
            probeBuckets: Array.from({ length: 60 }, (_, index) => ({
              bucket: new Date(Date.UTC(2026, 7, 5, 0, index)).toISOString(),
              fullPoolCount: index === 59 ? 1 : 0,
              targetedCount: index === 59 ? 1 : 0,
              recoveryCount: 0,
              successCount: index === 59 ? 2 : 0,
              totalCount: index === 59 ? 2 : 0,
            })),
            probeCount: 2,
            probedProfileCount: 1,
            latestFullPoolProbeAt: '2026-08-05T11:00:00Z',
            latestTargetedProbeAt: '2026-08-05T11:30:00Z',
            targetedProbeCount: 1,
            targetedProbeSuccessCount: 1,
            recoveryProbeCount: 0,
            recoveryProbeSuccessCount: 0,
            latestHealthEvent: {
              source: 'full_pool_probe',
              result: 'success',
              at: '2026-08-05T11:00:00Z',
            },
            primaryProfile: null,
            profiles: [
              {
                executionProfileId: 'cx006:gpt-5.6-luna:responses',
                canonicalModel: 'gpt-5.6-luna',
                provider: 'lucen',
                channel: 'cx006',
                protocol: ['responses'],
                state: 'healthy',
                routingEligible: true,
                routingEligibility: 'eligible',
                enabled: true,
                profileUtility: 0.812,
                profileRank: 1,
                profileCandidateCount: 3,
                successCount: 11,
                requestCount: 12,
                judgeSuccessCount: 4,
                judgeAttemptCount: 5,
                fullPoolProbeSuccessCount: 2,
                fullPoolProbeCount: 2,
                targetedProbeSuccessCount: 1,
                targetedProbeCount: 1,
                recoveryProbeSuccessCount: 0,
                recoveryProbeCount: 0,
                firstEventSampleCount: 9,
                costContribution: 0.3,
                speedContribution: 0.2,
                reliabilityContribution: 0.312,
                metricSource: 'first_event_p50',
              } as never,
            ],
          }}
        />
      </I18nextProvider>
    )
  })
  assert.match(container.textContent ?? '', /11 \/ 12 successful attempts/)
  assert.match(container.textContent ?? '', /Targeted 1 \/ 1/)
  assert.equal(
    container.querySelectorAll('[aria-label="Production timeline"] span')
      .length,
    60
  )
  assert.equal(
    container.querySelectorAll('[aria-label="Probe timeline"] span').length,
    60
  )
  const button = container.querySelector('button')
  assert.ok(button)
  await act(async () =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  assert.match(container.textContent ?? '', /0\.812/)
  assert.match(container.textContent ?? '', /11\/12/)
  assert.match(container.textContent ?? '', /4\/5/)
  assert.match(container.textContent ?? '', /2\/2/)
  assert.match(container.textContent ?? '', /1\/1/)
  assert.match(container.textContent ?? '', /9 first-event/)
  assert.match(container.textContent ?? '', /first_event_p50/)
  await act(async () => root.unmount())
  container.remove()
})

test('shows failed Probe coverage without presenting an empty Production success rate', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUChannelHealthCard
          generatedAt='2026-08-05T12:00:00Z'
          channel={{
            channel: 'cx008',
            providers: ['lucen'],
            profiles: [],
            enabledProfileCount: 1,
            eligibleProfileCount: 0,
            modelCount: 1,
            state: 'unavailable',
            primaryProfile: null,
            requestCount: 0,
            successCount: 0,
            availability: null,
            buckets: [],
            probeBuckets: [],
            probeCount: 1,
            probedProfileCount: 0,
            latestFullPoolProbeAt: '2026-08-05T11:00:00Z',
            latestTargetedProbeAt: null,
            targetedProbeCount: 0,
            targetedProbeSuccessCount: 0,
            recoveryProbeCount: 0,
            recoveryProbeSuccessCount: 0,
            latestHealthEvent: null,
          }}
        />
      </I18nextProvider>
    )
  })
  assert.match(container.textContent ?? '', /No production traffic/)
  assert.match(container.textContent ?? '', /0 \/ 1 Profiles passed/)
  assert.doesNotMatch(container.textContent ?? '', /Not actively verified/)
  assert.doesNotMatch(container.textContent ?? '', /0\.00%/)
  await act(async () => root.unmount())
  container.remove()
})

import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

Object.defineProperty(globalThis, 'React', {
  configurable: true,
  value: React,
})
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
const { ACUModelHealthCard } = await import('../acu-model-health-card')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

test('renders anonymous model lines and isolates user-facing supply evidence', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const buckets = Array.from({ length: 60 }, (_, index) => ({
    bucket: new Date(Date.UTC(2026, 7, 5, 0, index)).toISOString(),
    request_count: index === 59 ? 5 : 0,
    success_count: index === 59 ? 5 : 0,
    error_count: 0,
  }))
  const probeBuckets = Array.from({ length: 24 }, (_, index) => ({
    bucket: new Date(Date.UTC(2026, 7, 5, 0, index)).toISOString(),
    fullPoolCount: index === 23 ? 1 : 0,
    targetedCount: 0,
    historicalCount: 0,
    successCount: index === 23 ? 1 : 0,
    totalCount: index === 23 ? 3 : 0,
  }))
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUModelHealthCard
          showDiagnostics={false}
          model={{
            modelId: 'gpt-5.6-luna',
            eligibleCount: 1,
            totalCount: 1,
            requestCount: 5,
            successCount: 5,
            availability: 1,
            buckets: buckets as never,
            probeBuckets,
            profiles: [
              {
                executionProfileId: 'cx006:gpt-5.6-luna:responses',
                canonicalModel: 'gpt-5.6-luna',
                provider: 'lucen',
                channel: 'cx006',
                protocol: ['responses'],
                publicNote: 'Preferred route for long coding tasks',
                multiplier: 0.85,
                effectivePriceMultiplier: 0.61,
                p50FirstModelEventLatencyMs: 1200,
                profileLatencyMs: 7800,
                metricSource: 'full_pool_probe_latency',
                requestCount: 5,
                successCount: 5,
                routingEligible: true,
                state: 'healthy',
                probeStatus: 'success',
                probeBuckets,
              } as never,
            ],
          }}
        />
      </I18nextProvider>
    )
  })
  const header = container.querySelector('button')
  assert.ok(header)
  await act(async () =>
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  const text = container.textContent ?? ''
  assert.match(text, /gpt-5\.6-luna/)
  assert.match(text, /ACU Route \d{4}/)
  assert.match(text, /0\.61×/)
  assert.match(text, /Price factor/)
  assert.match(text, /Response latency/)
  assert.match(text, /Preferred route for long coding tasks/)
  assert.match(text, /7\.8 s/)
  assert.match(text, /Probe-led latency score/)
  assert.doesNotMatch(text, /0\.85x/)
  assert.doesNotMatch(text, /P50 first event/)
  assert.doesNotMatch(text, /lucen/)
  assert.doesNotMatch(text, /cx006/)
  assert.doesNotMatch(text, /cx006:gpt-5\.6-luna:responses/)
  assert.equal(
    container.querySelectorAll('[aria-label="Production timeline"] span')
      .length,
    0
  )
  assert.doesNotMatch(text, /Production/)
  assert.equal(
    container.querySelectorAll('[aria-label="Probe · 48h timeline"] span')
      .length,
    48
  )
  const probeTimelines = container.querySelectorAll(
    '[aria-label="Probe · 48h timeline"]'
  )
  assert.equal(probeTimelines.length, 2)
  assert.match(
    probeTimelines[0]?.querySelectorAll('span').item(23)?.className ?? '',
    /bg-success/
  )
  assert.match(
    probeTimelines[1]?.querySelectorAll('span').item(23)?.className ?? '',
    /bg-warning/
  )
  await act(async () => root.unmount())
  container.remove()
})

test('shows production evidence for an admin model view', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUModelHealthCard
          showDiagnostics
          model={{
            modelId: 'gpt-5.6-luna',
            eligibleCount: 0,
            totalCount: 0,
            requestCount: 0,
            successCount: 0,
            availability: null,
            buckets: [
              {
                bucket: '2026-08-19T00:00:00.000Z',
                request_count: 0,
                success_count: 0,
                error_count: 0,
              },
            ] as never,
            probeBuckets: [],
            profiles: [],
          }}
        />
      </I18nextProvider>
    )
  })
  const text = container.textContent ?? ''
  assert.equal(
    container.querySelectorAll('[aria-label="Production timeline"] span')
      .length,
    1
  )
  assert.match(text, /No production traffic/)
  await act(async () => root.unmount())
  container.remove()
})

test('toggles only the selected API key profile from the profile row', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const toggles: Array<{ profileId: string; enabled: boolean }> = []
  const editedNotes: string[] = []
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    value: () => true,
  })
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUModelHealthCard
          showDiagnostics={false}
          tokenProfileActions={{
            tokenName: 'primary',
            maskedKey: 'sk-a**********1234',
            scope: {
              tokenId: 12,
              custom: false,
              globalProfileIds: [
                'cx006:gpt-5.6-luna:responses',
                'cx007:gpt-5.6-luna:responses',
              ],
              configuredProfileIds: [],
              effectiveProfileIds: [
                'cx006:gpt-5.6-luna:responses',
                'cx007:gpt-5.6-luna:responses',
              ],
            },
            isPending: () => false,
            onToggle: (profile, enabled) =>
              toggles.push({
                profileId: profile.executionProfileId,
                enabled,
              }),
          }}
          profileNoteActions={{
            isPending: () => false,
            onEdit: (profile) => editedNotes.push(profile.executionProfileId),
          }}
          model={{
            modelId: 'gpt-5.6-luna',
            eligibleCount: 1,
            totalCount: 1,
            requestCount: 0,
            successCount: 0,
            availability: null,
            buckets: [],
            probeBuckets: [],
            profiles: [
              {
                executionProfileId: 'cx006:gpt-5.6-luna:responses',
                canonicalModel: 'gpt-5.6-luna',
                provider: 'lucen',
                channel: 'cx006',
                protocol: ['responses'],
                publicNote: 'Low-latency route',
                routingEligible: true,
                state: 'healthy',
                probeBuckets: [],
              } as never,
            ],
          }}
        />
      </I18nextProvider>
    )
  })
  const header = container.querySelector('button')
  assert.ok(header)
  await act(async () =>
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  const profileButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Disable for this API key'
  )
  assert.ok(profileButton)
  assert.match(container.textContent ?? '', /Global routing: Allowed/)
  assert.match(container.textContent ?? '', /This API key: Allowed/)
  await act(async () =>
    profileButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  assert.deepEqual(toggles, [
    {
      profileId: 'cx006:gpt-5.6-luna:responses',
      enabled: false,
    },
  ])
  const noteButton = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Edit note'
  )
  assert.ok(noteButton)
  await act(async () =>
    noteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  assert.deepEqual(editedNotes, ['cx006:gpt-5.6-luna:responses'])
  await act(async () => root.unmount())
  container.remove()
})

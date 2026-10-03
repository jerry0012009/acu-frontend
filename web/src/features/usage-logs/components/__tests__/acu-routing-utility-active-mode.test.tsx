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
const { RoutingUtilityEditor } = await import('../acu-channel-monitor')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

test('routing utility is fixed to Active Utility without a mode selector', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <RoutingUtilityEditor
          value={
            {
              defaultCandidatePreferenceScores: {},
              defaultProfilePreferenceScores: {},
              supplyPresets: {},
              qualityPresets: {},
              latency: {},
              reliability: {},
              workPhaseBiasOffsets: {},
            } as never
          }
          modelPool={[]}
          profiles={[]}
          onChange={() => undefined}
        />
      </I18nextProvider>
    )
  })

  assert.match(container.textContent ?? '', /Active Utility/)
  assert.equal(container.querySelector('select'), null)
  assert.doesNotMatch(container.textContent ?? '', /legacy|shadow/)

  await act(async () => root.unmount())
  container.remove()
})

test('shows Router candidates using routingEnabled with a neutral default weight', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <RoutingUtilityEditor
          value={
            {
              defaultCandidatePreferenceScores: {},
              defaultProfilePreferenceScores: {},
              supplyPresets: {},
              qualityPresets: {},
              latency: {},
              reliability: {},
              workPhaseBiasOffsets: {},
            } as never
          }
          modelPool={
            [
              {
                modelId: 'gpt-6-luna',
                modelCategory: 'text_agent',
                routingEnabled: true,
                routingCandidates: [
                  {
                    candidateId: 'gpt-6-luna',
                    modelId: 'gpt-6-luna',
                    displayName: 'GPT-6 Luna',
                    kind: 'base',
                    protocols: ['responses'],
                    responsesProfileCount: 1,
                    messagesProfileCount: 0,
                  },
                ],
              },
            ] as never
          }
          profiles={[]}
          onChange={() => undefined}
        />
      </I18nextProvider>
    )
  })

  const preferenceButton = container.querySelector('button')
  assert.ok(preferenceButton)
  await act(async () => preferenceButton.click())

  const input = container.querySelector(
    '[aria-label="gpt-6-luna Model Preference"]'
  )
  assert.ok(input)
  assert.equal((input as HTMLInputElement).value, '100')

  await act(async () => root.unmount())
  container.remove()
})

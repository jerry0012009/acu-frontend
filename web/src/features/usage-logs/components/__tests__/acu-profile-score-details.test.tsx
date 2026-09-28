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
const { ACUProfileScoreDetails } = await import('../acu-profile-score-details')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
after(() => domWindow.close())

test('score inspector exposes recorded contributions and keeps missing latency unavailable', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <ACUProfileScoreDetails
          profile={
            {
              executionProfileId: 'fixture:responses',
              profileUtility: 0.75,
              costContribution: 0.2,
              speedContribution: 0.3,
              reliabilityContribution: 0.1,
              profilePreferenceMultiplier: 1.25,
              profileRank: 1,
              profileCandidateCount: 3,
              healthEvents: [],
            } as never
          }
        />
      </I18nextProvider>
    )
  )
  const button = host.querySelector(
    'button[aria-label="View routing score details"]'
  )
  assert.ok(button)
  await act(async () =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  const dialog = document.querySelector('[role="dialog"]')
  assert.ok(dialog)
  assert.match(dialog.textContent ?? '', /Routing score details/)
  assert.match(dialog.textContent ?? '', /0\.7500/)
  assert.match(dialog.textContent ?? '', /0\.6000 × 1\.25/)
  assert.match(dialog.textContent ?? '', /n\/a/)
  assert.doesNotMatch(dialog.textContent ?? '', /80%|20%/)
  await act(async () => root.unmount())
  host.remove()
})

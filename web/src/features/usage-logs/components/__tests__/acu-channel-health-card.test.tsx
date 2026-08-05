/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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

test('expands a Channel to show Profile score and sample evidence', async () => {
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
            buckets: [],
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
  const button = container.querySelector('button')
  assert.ok(button)
  await act(async () =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  )
  assert.match(container.textContent ?? '', /0\.812/)
  assert.match(container.textContent ?? '', /11\/12/)
  assert.match(container.textContent ?? '', /9 first-event/)
  assert.match(container.textContent ?? '', /first_event_p50/)
  await act(async () => root.unmount())
  container.remove()
})

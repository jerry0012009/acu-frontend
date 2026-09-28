import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

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

const React = await import('react')
const { act } = React
;(globalThis as typeof globalThis & { React?: unknown }).React =
  React.default ?? React
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { PrivateACUUserConfigTable } = await import('../private-acu-admin')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => domWindow.close())

test('shows enabled users and selects the existing account when clicked', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let selectedUserId = ''

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <PrivateACUUserConfigTable
          configs={[
            {
              newapiUserId: '3',
              observerEnabled: true,
              advisorEnabled: false,
              injectionEnabled: true,
              learningEnabled: true,
              effectiveObserverInterval: 20,
              globalObserverInterval: 20,
              usesGlobalObserverInterval: true,
              globalEnabled: true,
              globalInjectionEnabled: true,
            },
            {
              newapiUserId: '4',
              observerEnabled: false,
              advisorEnabled: false,
              injectionEnabled: false,
              learningEnabled: false,
              effectiveObserverInterval: 20,
              globalObserverInterval: 20,
              usesGlobalObserverInterval: true,
              globalEnabled: true,
              globalInjectionEnabled: true,
            },
          ]}
          users={[{ id: 3, username: 'acu_founder' }]}
          loading={false}
          error={false}
          onSelect={(userId) => {
            selectedUserId = userId
          }}
        />
      </I18nextProvider>
    )
  })

  const text = container.textContent ?? ''
  assert.match(text, /acu_founder · #3/)
  assert.doesNotMatch(text, /#4/)
  assert.match(text, /Enabled/)
  assert.match(text, /Disabled/)
  assert.match(text, /Global default/)

  const userButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('acu_founder')
  )
  assert.ok(userButton)
  await act(async () => userButton.click())
  assert.equal(selectedUserId, '3')

  await act(async () => root.unmount())
  container.remove()
})

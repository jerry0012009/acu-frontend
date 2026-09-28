import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window({ url: 'http://localhost/' })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
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
const { PrivateACUUserSelector } = await import('../private-acu-admin')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => domWindow.close())

test('searches beyond the initial user page and selects the returned numeric ID', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let searchValue = ''
  let selectedUserId = ''

  const render = (
    options: Array<{ value: string; label: string }>,
    loading = false
  ) => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <PrivateACUUserSelector
          options={options}
          value={selectedUserId}
          searchValue={searchValue}
          loading={loading}
          onSearchValueChange={(value) => {
            searchValue = value
          }}
          onValueChange={(value) => {
            selectedUserId = value
          }}
        />
      </I18nextProvider>
    )
  }

  await act(async () => render([{ value: '3', label: 'acu_founder · #3' }]))
  const input = container.querySelector('input')
  assert.ok(input)

  await act(async () => {
    input.focus()
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    assert.ok(setInputValue)
    setInputValue.call(input, '165')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(searchValue, '165')

  await act(async () => render([{ value: '165', label: 'x · #165' }], false))
  const result = [...container.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent?.includes('x · #165')
  )
  assert.ok(result)

  await act(async () => {
    result.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })
  assert.equal(selectedUserId, '165')

  await act(async () => root.unmount())
  container.remove()
})

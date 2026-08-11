import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const React = await import('react')
const { act } = React
;(globalThis as typeof globalThis & { React?: unknown }).React =
  React.default ?? React
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({
  lng: 'zh',
  resources: {
    zh: {
      translation: {
        'Community Support': '社群支持',
        'QQ Group: 985621187': 'QQ群：985621187',
      },
    },
  },
})
const { QqGroupCallout } = await import('../qq-group-callout')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

test('shows the QQ group number as community support information', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<QqGroupCallout />)
  })

  const callout = container.querySelector('aside')
  assert.ok(callout)
  assert.equal(callout.getAttribute('aria-label'), '社群支持')
  assert.match(container.textContent ?? '', /QQ群：985621187/)

  await act(async () => root.unmount())
  container.remove()
})

after(() => domWindow.close())

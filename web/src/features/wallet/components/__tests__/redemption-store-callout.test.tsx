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
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Buy a redemption code': 'Buy a redemption code',
        'Purchase from the ACU store, then enter the code above to add funds.':
          'Purchase from the ACU store, then enter the code above to add funds.',
        'Buy a redemption code (opens in a new tab)':
          'Buy a redemption code (opens in a new tab)',
        'Buy now': 'Buy now',
      },
    },
  },
})
const { RedemptionStoreCallout } = await import('../redemption-store-callout')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

test('opens the configured redemption store in a safe new tab', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <RedemptionStoreCallout purchaseUrl='https://pay.ldxp.cn/shop/ACU' />
    )
  })

  const link = container.querySelector('a')
  assert.ok(link)
  assert.equal(link.href, 'https://pay.ldxp.cn/shop/ACU')
  assert.equal(link.target, '_blank')
  assert.equal(link.rel, 'noopener noreferrer')
  assert.equal(
    link.getAttribute('aria-label'),
    'Buy a redemption code (opens in a new tab)'
  )
  assert.match(container.textContent ?? '', /ACU store/)
  assert.equal(container.querySelector('iframe'), null)

  await act(async () => root.unmount())
  container.remove()
})

after(() => domWindow.close())

import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
const descriptors = new Map<string, PropertyDescriptor | undefined>()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}
descriptors.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
)
const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const { api } = await import('@/lib/api')
const { ChangePasswordDialog } = await import('../change-password-dialog')
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

after(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
  domWindow.happyDOM.abort()
})

for (const [name, password, accepted] of [
  ['32-character password', 'N'.repeat(32), true],
  ['multibyte password over 72 bytes', '界'.repeat(25), false],
] as const) {
  test(`${accepted ? 'submits' : 'blocks'} ${name} in the change-password dialog`, async () => {
    const requests: Array<Record<string, string>> = []
    const previousAdapter = api.defaults.adapter
    api.defaults.adapter = async (config) => {
      requests.push(JSON.parse(config.data))
      return {
        data: { success: false, message: 'Test response' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () =>
        root.render(
          <ChangePasswordDialog
            open
            onOpenChange={() => undefined}
            username='test-user'
          />
        )
      )
      for (const [id, value] of [
        ['currentPassword', 'C'.repeat(48)],
        ['newPassword', password],
        ['confirmPassword', password],
      ]) {
        const input = document.querySelector<HTMLInputElement>(`#${id}`)
        assert.ok(input)
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(
            domWindow.HTMLInputElement.prototype,
            'value'
          )?.set
          assert.ok(setter)
          setter.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
      const form = document.querySelector('#change-password-form')
      assert.ok(form)
      await act(async () => {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        )
      })
      assert.equal(requests.length, accepted ? 1 : 0)
      if (accepted) {
        assert.deepEqual(requests[0], {
          original_password: 'C'.repeat(48),
          password,
        })
      }
    } finally {
      await act(async () => root.unmount())
      container.remove()
      api.defaults.adapter = previousAdapter
    }
  })
}

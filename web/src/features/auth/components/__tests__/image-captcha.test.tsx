import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

const dom = new Window({ url: 'http://localhost/' })
Object.defineProperty(globalThis, 'React', { configurable: true, value: React })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'MutationObserver',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom[key],
  })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
})
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider } = await import('react-i18next')
const { api } = await import('@/lib/api')
const { ImageCaptcha } = await import('../image-captcha')
const i18n = createInstance()
await i18n.init({ lng: 'en', resources: {} })
after(() => dom.close())

test('image captcha loads only same-site images and refresh clears the consumed answer', async () => {
  const previous = api.defaults.adapter
  let generation = 0
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/api/auth/captcha')
    assert.equal(config.params.purpose, 'register-email')
    generation += 1
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        success: true,
        data: {
          id: `challenge-${generation}`,
          image: 'data:image/png;base64,aGVsbG8=',
        },
      },
    }
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const answers: unknown[] = []
  const onChange = (value: unknown) => {
    answers.push(value)
  }
  try {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ImageCaptcha purpose='register-email' onChange={onChange} />
        </I18nextProvider>
      )
    })
    assert.ok(
      container.querySelector('img')?.src.startsWith('data:image/png;base64,')
    )
    assert.equal(container.querySelectorAll('script, iframe').length, 0)
    const input = container.querySelector('input')
    assert.ok(input)
    assert.equal(input.disabled, false)
    assert.ok(container.querySelector(`label[for="${input.id}"]`))
    const refresh = container.querySelector(
      'button[aria-label="Refresh verification code"]'
    ) as HTMLButtonElement
    assert.ok(refresh)
    await act(async () => {
      refresh.click()
    })
    assert.equal(generation, 2)
    assert.deepEqual(answers.at(-1), { captcha_id: '', captcha_answer: '' })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    api.defaults.adapter = previous
  }
})

test('captcha load failure shows a retry action instead of an indefinitely disabled challenge', async () => {
  const previous = api.defaults.adapter
  let fail = true
  api.defaults.adapter = async (config) => {
    if (fail) throw new Error('network unavailable')
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        success: true,
        data: { id: 'recovered', image: 'data:image/png;base64,aGVsbG8=' },
      },
    }
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const onChange = () => {}
  try {
    await act(async () =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <ImageCaptcha purpose='reset-email' onChange={onChange} />
        </I18nextProvider>
      )
    )
    assert.ok(container.querySelector('[role="alert"]'))
    assert.equal(container.querySelector('input')?.disabled, true)
    fail = false
    await act(async () => {
      ;(container.querySelector('button') as HTMLButtonElement).click()
    })
    assert.equal(container.querySelector('[role="alert"]'), null)
    assert.equal(container.querySelector('input')?.disabled, false)
    assert.ok(container.querySelector('img'))
  } finally {
    await act(async () => root.unmount())
    container.remove()
    api.defaults.adapter = previous
  }
})

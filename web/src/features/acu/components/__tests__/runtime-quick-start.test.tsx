import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import { api } from '@/lib/api'

import { getRuntimeRelease } from '../../lib/runtime-release'
import { RuntimeQuickStart } from '../runtime-quick-start'

const dom = new Window()
const i18n = createInstance()
await i18n.init({ lng: 'en', resources: {} })
Object.defineProperty(globalThis, 'React', { configurable: true, value: React })
after(() => dom.close())

test('Runtime displays the fetched version and keeps platform downloads on the latest resolver', async () => {
  const previous = api.defaults.adapter
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/api/acu-runtime/release')
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true, data: { version: '0.1.99' } },
    }
  }
  const client = new QueryClient()
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator'
  )
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Windows NT 10.0; Win64; x64' },
  })
  try {
    await client.fetchQuery({
      queryKey: ['acu-runtime-release'],
      queryFn: getRuntimeRelease,
    })
    dom.document.body.innerHTML = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <RuntimeQuickStart onDirect={() => {}} />
        </I18nextProvider>
      </QueryClientProvider>
    )
    assert.ok(dom.document.body.textContent.includes('v0.1.99'))
    assert.ok(
      dom.document.querySelector('a[href="/api/acu-runtime/download/windows"]')
    )
    assert.ok(
      dom.document.querySelector(
        'a[href="https://github.com/jerry0012009/acu-runtime/releases/latest"]'
      )
    )
    client.clear()
    dom.document.body.innerHTML = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <RuntimeQuickStart onDirect={() => {}} />
        </I18nextProvider>
      </QueryClientProvider>
    )
    assert.equal(dom.document.querySelector('.acu-release-tag'), null)
    assert.ok(
      dom.document.querySelector('a[href="/api/acu-runtime/download/windows"]')
    )
  } finally {
    api.defaults.adapter = previous
    client.clear()
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'navigator')
    }
  }
})

test('Runtime lookup rejects unavailable release data instead of returning a pinned fallback', async () => {
  const previous = api.defaults.adapter
  api.defaults.adapter = async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: false },
  })
  try {
    await assert.rejects(getRuntimeRelease(), /lookup unavailable/)
  } finally {
    api.defaults.adapter = previous
  }
})

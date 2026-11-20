import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import { ApiBaseUrls } from '../api-base-urls'

const i18n = createInstance()
await i18n.init({ lng: 'en', resources: {} })
Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

for (const anthropic of [false, true]) {
  test(`shows independently copyable ${anthropic ? 'Claude Code' : 'OpenAI-compatible'} addresses`, async () => {
    const dom = new Window()
    try {
      dom.document.body.innerHTML = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ApiBaseUrls anthropic={anthropic} />
        </I18nextProvider>
      )
      const suffix = anthropic ? '' : '/v1'
      assert.deepEqual(
        Array.from(
          dom.document.querySelectorAll('code'),
          (el) => el.textContent
        ),
        [`https://api.acucompute.com${suffix}`, `https://acu.best${suffix}`]
      )
      for (const label of [
        'Copy Mainland China Base URL',
        'Copy overseas Base URL',
      ]) {
        assert.ok(dom.document.querySelector(`button[aria-label="${label}"]`))
      }
    } finally {
      await dom.close()
    }
  })
}

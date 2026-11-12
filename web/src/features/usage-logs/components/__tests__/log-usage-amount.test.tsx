import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import { LogUsageAmount } from '../log-usage-amount'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

async function renderAmount(
  stats: React.ComponentProps<typeof LogUsageAmount>['stats']
) {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: {} })
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <LogUsageAmount stats={stats} />
    </I18nextProvider>
  )
}

test('shows exact filtered CNY charge rather than rounded quota equivalent', async () => {
  const html = await renderAmount({
    quota: 213,
    rpm: 0,
    tpm: 0,
    user_charge_cny: '0.0028740000',
    exact_charge_count: 1,
    legacy_charge_count: 0,
  })
  assert.ok(html.includes('¥0.00287400'))
  assert.ok(!html.includes('Legacy quota conversion'))
})

test('identifies a mixed total that includes historical quota conversion', async () => {
  const html = await renderAmount({
    quota: 213,
    rpm: 0,
    tpm: 0,
    user_charge_cny: '0.0028740004',
    legacy_charge_count: 2,
  })
  assert.ok(html.includes('¥0.0028740004'))
  assert.ok(html.includes('Legacy quota conversion'))
  assert.ok(html.includes('2'))
})

test('keeps a tiny positive exact total visible', async () => {
  assert.ok(
    (
      await renderAmount({
        quota: 0,
        rpm: 0,
        tpm: 0,
        user_charge_cny: '0.0000000004',
      })
    ).includes('¥0.0000000004')
  )
})

test('labels the legacy response fallback instead of claiming exact CNY', async () => {
  assert.ok(
    (await renderAmount({ quota: 213, rpm: 0, tpm: 0 })).includes(
      'Legacy quota conversion'
    )
  )
})

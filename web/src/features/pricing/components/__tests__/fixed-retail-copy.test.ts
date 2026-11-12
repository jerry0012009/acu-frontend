import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createInstance } from 'i18next'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

test('Chinese pricing copy explains fixed retail and no Judge surcharge', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'zh', resources: { en, zh } })
  const text = i18n.t(
    'Models are billed at their fixed retail prices. Judge evaluations carry no additional charge.'
  )
  assert.match(text, /固定零售价/)
  assert.match(text, /不另收费/)
  assert.match(
    i18n.t('Estimated supplier cash cost ¥{{cost}} per request', {
      cost: '0.12',
    }),
    /供应商预计现金成本 ¥0\.12\/次/
  )
})

test('Pricing introduction states fixed model retail billing without a Judge surcharge', () => {
  const source = readFileSync(
    new URL('../../index.tsx', import.meta.url),
    'utf8'
  )
  assert.ok(
    source.includes(
      'Models are billed at their fixed retail prices. Judge evaluations carry no additional charge.'
    )
  )
  assert.doesNotMatch(
    source,
    /Routing evaluation fees, when incurred, are additional/
  )
})

test('Pricing chart explanation uses fixed retail estimates without route-dependent charges', () => {
  const source = readFileSync(
    new URL('../acu-model-curves.tsx', import.meta.url),
    'utf8'
  )
  assert.ok(
    source.includes(
      'Solid bars estimate charges at current fixed model retail prices for the token counts above. Light bars show reference prices, not additional charges. Changing routes does not change fixed model retail prices.'
    )
  )
  assert.doesNotMatch(
    source,
    /Route availability, network status, and price updates can change the final charge/
  )
  assert.doesNotMatch(source, /Current routed estimate/)
})

test('shared pricing explanations do not reintroduce Judge surcharges or route-dependent retail prices', () => {
  for (const filename of ['acu-price-summary.tsx', 'model-card.tsx']) {
    const source = readFileSync(
      new URL(`../${filename}`, import.meta.url),
      'utf8'
    )
    assert.ok(
      source.includes(
        'Models are billed at their fixed retail prices. Judge evaluations carry no additional charge.'
      )
    )
    assert.doesNotMatch(
      source,
      /evaluation fees|Actual payment may change with route availability/i
    )
  }
})

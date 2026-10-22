import assert from 'node:assert/strict'
import test from 'node:test'

import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import type { PricingModel } from '../../types'
import { ACUPriceSummary, ACURouteDetails } from '../acu-price-summary'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
})

const price = {
  input_cny_per_million: 1.25,
  output_cny_per_million: 5,
  status: 'estimated' as const,
  pricing_policy_version: 'test',
}
const model: PricingModel = {
  id: 1,
  model_name: 'test',
  quota_type: 0,
  model_ratio: 0.625,
  completion_ratio: 4,
  enable_groups: [],
  payable: price,
  acu_quote: {
    status: 'ready',
    protocol: 'chat_completions',
    supply_strategy: 'balanced',
    routes: [
      {
        id: 'a',
        display_name: 'Selected route',
        selected: true,
        payable: price,
      },
      {
        id: 'b',
        display_name: 'Alternative route',
        selected: false,
        payable: { ...price, input_cny_per_million: 2.5 },
      },
    ],
  },
}

function render(element: React.ReactNode) {
  const window = new Window()
  window.document.body.innerHTML = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{element}</I18nextProvider>
  )
  return window
}

test('summary identifies the protocol, strategy, route count and token unit', () => {
  const window = render(<ACUPriceSummary model={model} tokenUnit='M' />)
  try {
    const text = window.document.body.textContent ?? ''
    assert.match(text, /Input.*¥1\.25/)
    assert.match(text, /Output.*¥5/)
    assert.match(text, /1M tokens/)
    assert.match(text, /Chat · Balanced routing · 2 available routes/)
    assert.equal(
      window.document.querySelector('button')?.getAttribute('aria-label'),
      'Pricing details'
    )
  } finally {
    window.close()
  }
})

test('details list the same prices and mark only the current estimated selection', () => {
  const window = render(<ACURouteDetails model={model} tokenUnit='M' />)
  try {
    const rows = window.document.querySelectorAll('tbody tr')
    assert.equal(rows.length, 2)
    assert.match(
      rows[0].textContent ?? '',
      /Selected route.*¥1\.25.*¥5.*Currently estimated selection/
    )
    assert.match(
      rows[1].textContent ?? '',
      /Alternative route.*¥2\.5.*Available/
    )
    assert.equal(window.document.querySelectorAll('th[scope=col]').length, 4)
    assert.match(
      window.document.body.textContent ?? '',
      /Routing evaluation fees/
    )
  } finally {
    window.close()
  }
})

test('loading, error and unavailable quotes show no stale price or route table', () => {
  const quote = model.acu_quote
  assert.ok(quote)
  for (const status of ['loading', 'error', 'ready'] as const) {
    const current = {
      ...model,
      payable: undefined,
      acu_quote: { ...quote, status, routes: [] },
    }
    const window = render(
      <>
        <ACUPriceSummary model={current} tokenUnit='M' />
        <ACURouteDetails model={current} tokenUnit='M' />
      </>
    )
    try {
      const text = window.document.body.textContent ?? ''
      assert.doesNotMatch(text, /¥|Selected route/)
      assert.equal(window.document.querySelector('table'), null)
      assert.ok(window.document.querySelector('[role=status]'))
      assert.equal(
        window.document.querySelector('[aria-busy=true]') != null,
        status === 'loading'
      )
    } finally {
      window.close()
    }
  }
})

test('1K display scales the summary and each route consistently', () => {
  const window = render(
    <>
      <ACUPriceSummary model={model} tokenUnit='K' />
      <ACURouteDetails model={model} tokenUnit='K' />
    </>
  )
  try {
    assert.match(window.document.body.textContent ?? '', /¥0\.00125/)
    assert.match(
      window.document.querySelector('tbody tr')?.textContent ?? '',
      /¥0\.00125.*¥0\.005/
    )
  } finally {
    window.close()
  }
})

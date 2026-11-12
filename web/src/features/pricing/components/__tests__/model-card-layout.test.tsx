import assert from 'node:assert/strict'
import test from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import type { PricingModel } from '../../types'
import { ModelCard } from '../model-card'
import { ModelDetailsContent } from '../model-details'
import { usePricingColumns } from '../pricing-columns'

const model: PricingModel = {
  id: 1,
  model_name: 'claude-fable-5',
  display_name: 'Claude Fable 5',
  description: 'LUNA · Messages · Tool Call · Reasoning · ACU Auto',
  tags: 'LUNA,Messages,Tool Call,Reasoning,ACU Auto',
  supported_endpoint_types: ['anthropic'],
  enable_groups: ['default'],
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  payable: {
    input_cny_per_million: 5.625,
    output_cny_per_million: 28.125,
    status: 'estimated',
    pricing_policy_version: 'fixture',
  },
  reference: {
    input_cny_per_million: 67.4,
    output_cny_per_million: 337,
    source_type: 'official',
    source_name: 'Official pricing',
    observed_at: '2026-10-22',
    original_currency: 'CNY',
  },
  acu_quote: {
    status: 'ready',
    protocol: 'messages',
    routes: [],
  },
}

test('fixed retail cards, table and details show the model multiplier without route-dependent estimates', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  assert.ok(model.payable)
  const fixed: PricingModel = {
    ...model,
    acu_quote: undefined,
    price_currency: 'CNY',
    price_semantics: 'fixed_model_multiplier',
    payable: {
      ...model.payable,
      model_multiplier: '0.13',
      price_version: 'retail-v1',
    },
  }
  function TablePrice() {
    const priceColumn = usePricingColumns({ tokenUnit: 'M' }).find(
      (column) => 'accessorKey' in column && column.accessorKey === 'price'
    )
    assert.ok(priceColumn && typeof priceColumn.cell === 'function')
    return priceColumn.cell({ row: { original: fixed } } as never)
  }
  for (const element of [
    <ModelCard
      key='card'
      model={fixed}
      onClick={() => {}}
      pricingDisplayMode='comparison'
    />,
    <TablePrice key='table' />,
    <ModelDetailsContent
      key='details'
      model={fixed}
      groupRatio={{ default: 1 }}
      usableGroup={{ default: { desc: '', ratio: 1 } }}
      endpointMap={{}}
      autoGroups={[]}
      priceRate={1}
      usdExchangeRate={7}
      tokenUnit='M'
    />,
  ]) {
    const window = new Window()
    try {
      window.document.body.innerHTML = renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <I18nextProvider i18n={i18n}>{element}</I18nextProvider>
        </QueryClientProvider>
      )
      const text = window.document.body.textContent ?? ''
      assert.match(text, /0\.13x/)
      assert.match(text, /Fixed retail price/)
      assert.doesNotMatch(
        text,
        /Current routed estimate|Pricing by Group|Dynamic Pricing/
      )
    } finally {
      window.close()
    }
  }
})

test('ACU cards give pricing its own width and show each capability only once', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  const window = new Window()
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ModelCard
          model={model}
          onClick={() => {}}
          pricingDisplayMode='comparison'
        />
      </I18nextProvider>
    )
    const card = window.document.querySelector('article')
    assert.ok(card)
    assert.equal(card.getAttribute('aria-label'), 'Claude Fable 5')
    assert.equal(card.querySelector('header table'), null)
    assert.ok(card.querySelector('table'))
    assert.ok(card.querySelector('footer button'))
    const text = card.textContent ?? ''
    for (const label of [
      'LUNA',
      'Messages',
      'Tool Call',
      'Reasoning',
      'ACU Auto',
    ]) {
      assert.equal(
        text.split(label).length - 1,
        1,
        `${label} should appear once`
      )
    }
    assert.doesNotMatch(text, /anthropic|default|\+3/)
    assert.match(text, /0\.083x/)
    assert.match(text, /¥5\.625.*¥28\.125/)
    assert.equal(
      card.querySelector('[aria-label="Copy"]')?.getAttribute('type'),
      'button'
    )
  } finally {
    window.close()
  }
})

test('a useful model description is preserved and long model names can wrap', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  const window = new Window()
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ModelCard
          model={{
            ...model,
            display_name: 'LongModelName'.repeat(8),
            description: 'Supports long conversations.',
          }}
          onClick={() => {}}
          pricingDisplayMode='comparison'
        />
      </I18nextProvider>
    )
    assert.match(
      window.document.body.textContent ?? '',
      /Supports long conversations\./
    )
    const heading = window.document.querySelector('h3')
    assert.ok(heading)
    assert.equal(heading.classList.contains('truncate'), false)
    assert.equal(heading.classList.contains('break-words'), true)
  } finally {
    window.close()
  }
})

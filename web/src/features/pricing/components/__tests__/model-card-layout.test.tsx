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

test('pricing cards and table rows omit an identical model ID subtitle but retain a distinct ID', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  const modelID = 'claude-sonnet-5-5'

  function TableModel(props: { model: PricingModel }) {
    const column = usePricingColumns().find(
      (item) => 'accessorKey' in item && item.accessorKey === 'model_name'
    )
    assert.ok(column && typeof column.cell === 'function')
    return column.cell({ row: { original: props.model } } as never)
  }

  const window = new Window()
  try {
    for (const displayName of [modelID, 'Claude Sonnet 5.5']) {
      const sonnet = {
        ...model,
        model_name: modelID,
        display_name: displayName,
      }
      for (const [surface, content] of [
        [
          'card',
          <ModelCard
            key='card'
            model={sonnet}
            onClick={() => {}}
            pricingDisplayMode='comparison'
          />,
        ],
        ['table', <TableModel key='table' model={sonnet} />],
      ] as const) {
        window.document.body.innerHTML = renderToStaticMarkup(
          <I18nextProvider i18n={i18n}>{content}</I18nextProvider>
        )
        const labels = Array.from(
          window.document.querySelectorAll('h3, header div, span'),
          (element) =>
            element.childElementCount === 0 ? element.textContent : null
        )
        assert.equal(
          labels.filter((label) => label === modelID).length,
          1,
          surface
        )
        assert.ok(labels.includes(displayName), surface)
      }
    }
  } finally {
    window.close()
  }
})

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
      assert.match(text, /0\.083x/)
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

test('video pricing card uses seconds and omits the token unit', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  const window = new Window()
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ModelCard
          model={{
            ...model,
            model_name: 'grok-imagine-video',
            display_name: 'Grok Video',
            supported_endpoint_types: ['openai-video'],
            quota_type: 1,
            model_price: 0.01,
            payable: undefined,
            acu_quote: undefined,
            description: undefined,
            tags: undefined,
          }}
          onClick={() => {}}
          pricingDisplayMode='comparison'
        />
      </I18nextProvider>
    )
    const text = window.document.body.textContent ?? ''
    assert.match(text, /Per second/)
    assert.match(text, /\/ second/)
    assert.doesNotMatch(text, /1M|1K|\/ request/)
  } finally {
    window.close()
  }
})

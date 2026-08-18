import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'
import React from 'react'

Object.defineProperty(globalThis, 'React', {
  configurable: true,
  value: React,
})

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Subscription: 'Subscription',
        'Deducted by subscription': 'Deducted by subscription',
        'Includes tool-call surcharge': 'Includes tool-call surcharge',
        'View official cost reference': 'View official cost reference',
        'Cost reference': 'Cost reference',
        'Actual charge': 'Actual charge',
        'Official reference': 'Official reference',
        'Channel discount': 'Channel discount',
        'Official unit prices': 'Official unit prices',
      },
    },
  },
})

const { LogCostDisplay } = await import('../log-cost-display')
const { formatLogQuota } = await import('@/lib/format')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

type RenderedCost = {
  container: HTMLDivElement
  root: ReturnType<typeof createRoot>
}

async function renderCost(
  props: React.ComponentProps<typeof LogCostDisplay>
): Promise<RenderedCost> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <LogCostDisplay {...props} />
      </I18nextProvider>
    )
  })

  return { container, root }
}

async function unmountCost(rendered: RenderedCost) {
  await act(async () => rendered.root.unmount())
  rendered.container.remove()
}

function normalizedText(value: string | null): string {
  return (value ?? '').replaceAll(/\s/g, '')
}

describe('log cost display', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the regular cost visible and adds an accessible surcharge marker', async () => {
    const rendered = await renderCost({
      quota: 12500,
      other: {
        tool_surcharges: [{ name: 'lookup_customer', count: 1, price: 5 }],
      },
    })

    assert.equal(
      normalizedText(rendered.container.textContent).includes(
        normalizedText(formatLogQuota(12500))
      ),
      true
    )
    const marker = rendered.container.querySelector(
      '[data-tool-surcharge-indicator="true"]'
    )
    assert.ok(marker)
    assert.equal(
      marker.getAttribute('aria-label'),
      'Includes tool-call surcharge'
    )
    assert.equal(marker.getAttribute('tabindex'), '0')

    await unmountCost(rendered)
  })

  test('preserves the subscription badge and adds the same legacy surcharge marker', async () => {
    const rendered = await renderCost({
      quota: 5000,
      other: {
        billing_source: 'subscription',
        web_search: true,
        web_search_call_count: 1,
        web_search_price: 10,
      },
    })

    assert.equal(rendered.container.textContent?.includes('Subscription'), true)
    assert.ok(
      rendered.container.querySelector('[data-tool-surcharge-indicator="true"]')
    )

    await unmountCost(rendered)
  })

  test('shows ACU actual CNY charge instead of the internal Quota equivalent', async () => {
    const rendered = await renderCost({
      quota: 848,
      other: { user_charge_cny: '0.0084818400' },
    })

    assert.equal(normalizedText(rendered.container.textContent), '¥0.00848184')
    assert.equal(
      rendered.container.textContent?.includes(formatLogQuota(848)),
      false
    )

    await unmountCost(rendered)
  })

  test('keeps zero-cost ACU records denominated in CNY', async () => {
    const rendered = await renderCost({
      quota: 0,
      other: { user_charge_cny: '0' },
    })

    assert.equal(normalizedText(rendered.container.textContent), '¥0.00000000')

    await unmountCost(rendered)
  })

  test('shows the official reference indicator without exposing internal billing', async () => {
    const rendered = await renderCost({
      quota: 848,
      other: {
        user_charge_cny: '0.0020000000',
        acu_cost_breakdown: {
          user_charge_cny: '0.0020000000',
          official_catalog_cost_usd: '0.0048250000',
          official_reference_cost_usd: '0.0048250000',
          official_input_price_per_million_usd: 5,
          official_cached_input_price_per_million_usd: 0.5,
          official_output_price_per_million_usd: 30,
          channel_discount_multiplier: '0.0829015544',
        },
        admin_info: {
          acu_cost_breakdown: {
            billing_multiplier: 0.12,
            provider_balance_charge: 0.001,
            provider_credit_cash_cost_cny: 1,
          },
        },
      },
    })

    assert.ok(
      rendered.container.querySelector('[data-cost-reference-indicator="true"]')
    )
    assert.equal(
      rendered.container.textContent?.includes('0.0048250000'),
      false
    )
    assert.equal(
      rendered.container
        .querySelector('[data-cost-reference-indicator="true"]')
        ?.getAttribute('aria-label'),
      'View official cost reference'
    )

    await unmountCost(rendered)
  })
})

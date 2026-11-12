import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import type { UsageLog } from '../../../data/schema'
import type { LogOtherData } from '../../../types'
import * as details from '../details-dialog'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

const log = { prompt_tokens: 90, completion_tokens: 51, quota: 0 } as UsageLog
const frozen = {
  retail_price_version: 'frozen-v1',
  retail_reference_type: 'platform',
  retail_reference_currency: 'CNY' as const,
  retail_reference_source: 'Frozen K3 catalog',
  retail_model_multiplier: '0.6000000001',
  retail_reference_amount_cny: '999999.0000000004',
  retail_reference_prices: {
    inputPricePerMillion: 4,
    outputPricePerMillion: 12,
  },
  retail_input_accounting_mode: 'includes_cached',
  retail_cache_creation_input_tokens: '0',
}

async function render(node: React.ReactNode): Promise<string> {
  const i18n = createInstance()
  await i18n
    .use(initReactI18next)
    .init({ lng: 'en', resources: { en: { translation: {} } } })
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
  )
}

describe('frozen static pricing details', () => {
  test('shows frozen reference type, currency, source and exact reference decimal', async () => {
    const html = await render(
      <details.AcuPricingDetails
        breakdown={frozen}
        modelId='k3'
        isAdmin={false}
      />
    )
    assert.match(html, /Platform reference/)
    assert.match(html, /CNY/)
    assert.match(html, /Frozen K3 catalog/)
    assert.match(html, /0\.6000000001x/)
    assert.match(html, /¥999999\.0000000004/)
    assert.doesNotMatch(html, /Official reference/)
  })

  for (const charge of ['0.0000000004', '999999.0000000004']) {
    test(`preserves original actual charge ${charge} in billing details`, async () => {
      const other: LogOtherData = {
        user_charge_cny: charge,
        acu_cost_breakdown: frozen,
      }
      const html = await render(
        <details.BillingBreakdown log={log} other={other} isAdmin={false} />
      )
      assert.ok(html.includes(`¥${charge}`))
    })
  }

  for (const [mode, write, billed] of [
    ['includes_cached', '0', 26],
    ['includes_cached', '10', 16],
    ['excludes_cached', '10', 90],
  ] as const) {
    test(`normalizes billed uncached input for frozen ${mode} with cache writes ${write}`, async () => {
      const other = {
        cached_input_tokens: 64,
        cache_creation_tokens: 999,
        acu_cost_breakdown: {
          ...frozen,
          retail_input_accounting_mode: mode,
          retail_cache_creation_input_tokens: write,
        },
      }
      const html = await render(
        <details.TokenBreakdown log={log} other={other} />
      )
      assert.match(
        html,
        new RegExp(
          `Billed Uncached Input Tokens</span><span[^>]*>${billed}</span>`
        )
      )
      assert.match(html, /Cache Read/)
      assert.doesNotMatch(html, /999/)
    })
  }

  for (const mode of [undefined, 'future_mode']) {
    test(`does not guess billed input for old or unknown mode ${mode}`, async () => {
      const other = {
        cached_input_tokens: 64,
        acu_cost_breakdown: { ...frozen, retail_input_accounting_mode: mode },
      }
      const html = await render(
        <details.TokenBreakdown log={log} other={other} />
      )
      assert.match(
        html,
        /Billed Uncached Input Tokens<\/span><span[^>]*>Unknown<\/span>/
      )
    })
  }

  test('does not infer a zero cache write count when the frozen count is missing', async () => {
    const other = {
      cached_input_tokens: 64,
      acu_cost_breakdown: {
        ...frozen,
        retail_cache_creation_input_tokens: undefined,
      },
    }
    const html = await render(
      <details.TokenBreakdown log={log} other={other} />
    )
    assert.match(
      html,
      /Billed Uncached Input Tokens<\/span><span[^>]*>Unknown<\/span>/
    )
  })

  test('does not show negative billed input when frozen cache counts exceed input', async () => {
    const other = { cached_input_tokens: 91, acu_cost_breakdown: frozen }
    const html = await render(
      <details.TokenBreakdown log={log} other={other} />
    )
    assert.match(
      html,
      /Billed Uncached Input Tokens<\/span><span[^>]*>Unknown<\/span>/
    )
  })

  test('uses the observed GPT excludes-cached input without subtracting cache reads again', async () => {
    const other = {
      cached_input_tokens: 768,
      acu_cost_breakdown: {
        ...frozen,
        retail_input_accounting_mode: 'excludes_cached',
      },
    }
    const html = await render(
      <details.TokenBreakdown
        log={{ ...log, prompt_tokens: 13 }}
        other={other}
      />
    )
    assert.match(
      html,
      /Billed Uncached Input Tokens<\/span><span[^>]*>13<\/span>/
    )
  })

  test('retains legacy token display without a frozen snapshot', async () => {
    const html = await render(
      <details.TokenBreakdown
        log={log}
        other={{ cache_tokens: 64, cache_creation_tokens: 10 }}
      />
    )
    assert.match(html, /Cache Write/)
    assert.doesNotMatch(html, /Billed Uncached Input Tokens/)
  })

  test('prefers settled cached input over a conflicting legacy cache alias in a snapshot', async () => {
    const other = {
      cached_input_tokens: 64,
      cache_tokens: 12,
      acu_cost_breakdown: frozen,
    }
    const html = await render(
      <details.TokenBreakdown log={log} other={other} />
    )
    assert.match(
      html,
      /Billed Uncached Input Tokens<\/span><span[^>]*>26<\/span>/
    )
  })

  test('does not assume missing cache read usage is zero for includes-cached billing', async () => {
    const html = await render(
      <details.TokenBreakdown
        log={log}
        other={{ acu_cost_breakdown: frozen }}
      />
    )
    assert.match(
      html,
      /Billed Uncached Input Tokens<\/span><span[^>]*>Unknown<\/span>/
    )
  })

  test('shows frozen cache-write-only usage even when input and output counts are zero', async () => {
    const other = {
      cached_input_tokens: 0,
      acu_cost_breakdown: {
        ...frozen,
        retail_input_accounting_mode: 'excludes_cached',
        retail_cache_creation_input_tokens: '10',
      },
    }
    const html = await render(
      <details.TokenBreakdown
        log={{ ...log, prompt_tokens: 0, completion_tokens: 0 }}
        other={other}
      />
    )
    assert.match(html, /Cache Write<\/span><span[^>]*>10<\/span>/)
  })
})

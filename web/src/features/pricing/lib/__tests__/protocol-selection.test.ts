import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { PricingModel } from '../../types'
import { getDynamicPricingSummary } from '../dynamic-price'
import { mediaPriceUnit } from '../model-helpers'
import {
  modelPricingProtocol,
  defaultACUPricingProtocol,
} from '../pricing-comparison'
import { PRICING_CURVE_PROTOCOL_OPTIONS } from '../selection-corridor'

test('Gemini-only models retain Gemini quotes and media prices use their actual unit', () => {
  const gemini = {
    model_name: 'gemini-test',
    supported_endpoint_types: ['gemini'],
  } as PricingModel
  assert.equal(modelPricingProtocol(gemini, 'responses'), 'gemini')
  assert.equal(
    defaultACUPricingProtocol({
      gemini: {
        input_cny_per_million: 1,
        output_cny_per_million: 2,
        status: 'verified',
        pricing_policy_version: 'test',
      },
    }),
    'gemini'
  )
  assert.equal(
    mediaPriceUnit({
      model_name: 'grok-imagine-video',
      supported_endpoint_types: ['openai-video'],
    } as PricingModel),
    'second'
  )
  assert.equal(
    mediaPriceUnit({
      model_name: 'image-test',
      supported_endpoint_types: ['image-generation'],
    } as PricingModel),
    'image'
  )
  assert.equal(
    mediaPriceUnit({
      model_name: 'other-video',
      supported_endpoint_types: ['openai-video'],
    } as PricingModel),
    'request'
  )
})

test('Gemini image pricing includes image output tokens in the primary price summary', () => {
  const summary = getDynamicPricingSummary(
    {
      model_name: 'gemini-image',
      supported_endpoint_types: ['image-generation', 'gemini'],
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("base", p * 0.1 + c * 0.5 + img_o * 9)',
    } as PricingModel,
    { tokenUnit: 'M' }
  )
  assert(
    summary?.primaryEntries.some(
      (entry) => entry.field === 'imageOutputPrice' && entry.value === 9
    )
  )
})

test('Pricing offers all four conversation protocols', () => {
  assert.deepEqual(
    PRICING_CURVE_PROTOCOL_OPTIONS.map((option) => option.id),
    ['chat_completions', 'responses', 'messages', 'gemini']
  )
  for (const language of ['en', 'zh']) {
    const resources = JSON.parse(
      readFileSync(
        new URL(`../../../../i18n/locales/${language}.json`, import.meta.url),
        'utf8'
      )
    ) as { translation: Record<string, string> }
    assert.deepEqual(
      PRICING_CURVE_PROTOCOL_OPTIONS.map(
        (option) => resources.translation[option.labelKey]
      ),
      ['Chat', 'Responses', 'Messages', 'Gemini']
    )
  }
})

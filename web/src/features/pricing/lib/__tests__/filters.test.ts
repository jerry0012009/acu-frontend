import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SORT_OPTIONS } from '../../constants'
import type { PricingModel } from '../../types'
import { sortModels } from '../filters'

const model = (model_name: string, model_ratio: number): PricingModel => ({
  id: 1,
  model_name,
  quota_type: 0,
  model_ratio,
  completion_ratio: 1,
  enable_groups: ['default'],
})

test('price sorting uses model name as a deterministic tie breaker', () => {
  const models = [
    model('gpt-6-sol', 1),
    model('gpt-5.6-luna', 1),
    model('gpt-5.6-sol', 2),
  ]

  assert.deepEqual(
    sortModels(models, SORT_OPTIONS.PRICE_LOW).map((item) => item.model_name),
    ['gpt-5.6-luna', 'gpt-6-sol', 'gpt-5.6-sol']
  )
  assert.deepEqual(
    sortModels(models, SORT_OPTIONS.PRICE_HIGH).map((item) => item.model_name),
    ['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-6-sol']
  )
})

test('unavailable ACU quotes sort after priced models in both price directions', () => {
  const unavailable = {
    ...model('unavailable', 0),
    acu_quote: {
      status: 'ready' as const,
      protocol: 'chat_completions' as const,
      routes: [],
    },
  }
  for (const order of [SORT_OPTIONS.PRICE_LOW, SORT_OPTIONS.PRICE_HIGH]) {
    assert.equal(
      sortModels([unavailable, model('priced', 2)], order)[1].model_name,
      'unavailable'
    )
  }
})

test('price sorting compares only matching billing units and keeps text first', () => {
  const image = {
    ...model('image', 0),
    quota_type: 1,
    model_price: 0.001,
    supported_endpoint_types: ['image-generation'],
  }
  const video = {
    ...model('grok-imagine-video', 0),
    quota_type: 1,
    model_price: 0.0001,
    supported_endpoint_types: ['openai-video'],
  }
  const secondImage = {
    ...image,
    model_name: 'image-expensive',
    model_price: 0.02,
  }
  assert.deepEqual(
    sortModels(
      [video, secondImage, model('text', 1), image],
      SORT_OPTIONS.PRICE_LOW
    ).map((m) => m.model_name),
    ['text', 'image', 'image-expensive', 'grok-imagine-video']
  )
  assert.deepEqual(
    sortModels(
      [video, image, model('text', 1), secondImage],
      SORT_OPTIONS.PRICE_HIGH
    ).map((m) => m.model_name),
    ['text', 'image-expensive', 'image', 'grok-imagine-video']
  )
})

test('token-priced images are not ranked by their text-input price', () => {
  const images = [
    {
      ...model('z-image', 0.001),
      supported_endpoint_types: ['image-generation', 'gemini'],
    },
    {
      ...model('a-image', 100),
      supported_endpoint_types: ['image-generation', 'gemini'],
    },
  ]
  for (const direction of [SORT_OPTIONS.PRICE_LOW, SORT_OPTIONS.PRICE_HIGH]) {
    assert.deepEqual(
      sortModels(images, direction).map((m) => m.model_name),
      ['a-image', 'z-image']
    )
  }
})

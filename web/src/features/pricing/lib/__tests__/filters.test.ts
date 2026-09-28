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

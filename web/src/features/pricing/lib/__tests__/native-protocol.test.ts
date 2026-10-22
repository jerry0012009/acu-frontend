import assert from 'node:assert/strict'
import test from 'node:test'

import type { PricingModel } from '../../types'
import { parseTags } from '../filters'
import {
  modelPricingProtocol,
  applyPricingPreview,
} from '../pricing-comparison'

const opus: PricingModel = {
  id: 1,
  model_name: 'claude-opus-5-5',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  enable_groups: ['default'],
  supported_endpoint_types: ['anthropic'],
  acu_protocol: 'Messages',
  acu_status: 'routing_active',
  price_currency: 'CNY',
  price_semantics: 'estimated_user_payable_price',
  description:
    'FRONTIER · Messages · Tool Call · Reasoning · ACU Auto · routing_active',
  tags: 'FRONTIER,Messages,Tool Call,Reasoning,ACU Auto,routing_active',
}

test('Messages-only models use Messages even when the page opens in Chat', () => {
  assert.equal(modelPricingProtocol(opus, 'chat_completions'), 'messages')
  assert.equal(modelPricingProtocol(opus, 'responses'), 'messages')
})

test('supported selected protocol is retained even if its price is missing', () => {
  assert.equal(
    modelPricingProtocol(
      {
        ...opus,
        supported_endpoint_types: ['openai', 'anthropic'],
        payable_by_protocol: {},
      },
      'chat_completions'
    ),
    'chat_completions'
  )
})

test('Responses-only models use Responses without relying on available prices', () => {
  assert.equal(
    modelPricingProtocol(
      {
        ...opus,
        supported_endpoint_types: ['openai-response'],
      },
      'chat_completions'
    ),
    'responses'
  )
})

test('internal availability labels do not contradict a missing current quote', () => {
  const [model] = applyPricingPreview([opus], undefined, 'messages', 'ready')
  assert.doesNotMatch(model.description ?? '', /routing_active/)
  assert.doesNotMatch(model.tags ?? '', /routing_active/)
  assert.equal(model.acu_status, 'temporarily_unavailable')
})

test('comma-separated capability labels retain words within a tag', () => {
  assert.deepEqual(
    parseTags('FRONTIER,Messages,Tool Call,Reasoning,ACU Auto'),
    ['FRONTIER', 'Messages', 'Tool Call', 'Reasoning', 'ACU Auto']
  )
})

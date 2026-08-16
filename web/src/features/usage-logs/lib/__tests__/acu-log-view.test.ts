import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { PricingModel } from '@/features/pricing/types'

import type { LogOtherData } from '../../types'
import {
  acuBreakdownForView,
  acuPriceComparisonRows,
  acuResolvedReasoningEffort,
  acuSuccessfulAttempt,
} from '../acu-log-view'

const other: LogOtherData = {
  reasoning_effort: 'medium',
  acu_cost_breakdown: {
    canonical_model: 'gpt-5.6-sol',
    reasoning_effort: 'high',
    channel_attempts: [
      { attempt_index: 1, status: 'error', latency_ms: 100 },
      { attempt_index: 2, status: 'success', latency_ms: 200 },
    ],
  },
  admin_info: {
    acu_cost_breakdown: {
      actual_provider: 'lucen',
      channel_id: '1537',
      billing_multiplier: 0.06,
      network_endpoint: 'https://secret.example',
      decision_summary: { resolved_reasoning_effort: 'xhigh' },
      channel_attempts: [
        {
          attempt_index: 1,
          provider: 'one',
          channel_id: '7737',
          execution_profile_id: 'profile-one',
          status: 'error',
        },
        {
          attempt_index: 2,
          provider: 'lucen',
          channel_id: '1537',
          execution_profile_id: 'profile-two',
          status: 'success',
        },
      ],
    },
  },
}

test('keeps public breakdown isolated from admin routing identity', () => {
  const breakdown = acuBreakdownForView(other, false)

  assert.equal(breakdown?.actual_provider, undefined)
  assert.equal(breakdown?.billing_multiplier, undefined)
  assert.equal(breakdown?.network_endpoint, undefined)
  assert.equal(breakdown?.channel_attempts?.length, 2)
  assert.equal(
    breakdown?.channel_attempts?.[0]?.execution_profile_id,
    undefined
  )
})

test('hydrates admin attempts only when public attempts lack internal identity', () => {
  const breakdown = acuBreakdownForView(other, true)

  assert.equal(breakdown?.channel_attempts?.length, 2)
  assert.equal(
    breakdown?.channel_attempts?.[0]?.execution_profile_id,
    'profile-one'
  )
  assert.equal(acuSuccessfulAttempt(breakdown)?.channel_id, '1537')
})

test('prefers resolved reasoning effort and falls back to model default', () => {
  const breakdown = acuBreakdownForView(other, true)

  assert.equal(acuResolvedReasoningEffort(other, breakdown), 'xhigh')
  assert.equal(acuResolvedReasoningEffort({}, {}), 'default')
})

test('calculates payable versus reference multipliers without hardcoded economics', () => {
  const model = {
    id: 1,
    model_name: 'gpt-5.6-sol',
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    enable_groups: ['default'],
    payable: {
      input_cny_per_million: 0.75,
      cached_input_cny_per_million: 0.075,
      output_cny_per_million: 4.5,
      status: 'verified',
      pricing_policy_version: 'pricing-v1',
    },
    reference: {
      input_cny_per_million: 36,
      cached_input_cny_per_million: 3.6,
      output_cny_per_million: 216,
      source_type: 'official',
      source_name: 'OpenAI official pricing',
      observed_at: '2026-08-16T00:00:00Z',
      original_currency: 'USD',
      fx_cny_per_usd: 7.2,
    },
  } satisfies PricingModel

  const rows = acuPriceComparisonRows(model, 'responses')

  assert.equal(rows.length, 3)
  assert.equal(rows[0]?.multiplier, 0.75 / 36)
  assert.equal(rows[0]?.savings, 1 - 0.75 / 36)
})

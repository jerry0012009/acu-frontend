import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { UsageLog } from '../../data/schema'
import {
  acuCacheReadTokens,
  acuDurationSeconds,
  acuFirstTokenMs,
  acuLogPresentation,
  parseLogOther,
} from '../format.ts'

const log: UsageLog = {
  id: 1,
  user_id: 1,
  created_at: 1,
  type: 2,
  content: '',
  username: '',
  token_name: '',
  model_name: 'gpt-5.6-sol',
  quota: 0,
  prompt_tokens: 13278,
  completion_tokens: 5,
  use_time: 0,
  is_stream: true,
  channel: 0,
  channel_name: '',
  token_id: 1,
  group: '',
  ip: '',
  other: '',
  request_id: '',
  upstream_request_id: '',
}

test('ACU logs use end-to-end latency and successful provider first token fallbacks', () => {
  const other = parseLogOther(
    JSON.stringify({
      cached_input_tokens: 12640,
      acu_cost_breakdown: {
        end_to_end_latency_ms: 36000,
        first_model_event_latency_ms: 310,
        channel_attempts: [
          { status: 'error', first_model_event_latency_ms: 100 },
          { status: 'success', first_model_event_latency_ms: 420 },
        ],
      },
    })
  )
  assert.equal(acuCacheReadTokens(other), 12640)
  assert.equal(acuDurationSeconds(log, other), 36)
  assert.equal(acuFirstTokenMs(other), 310)
})

test('ACU first response timing keeps legacy and attempt fallbacks', () => {
  assert.equal(acuFirstTokenMs({ frt: 250 }), 250)
  assert.equal(
    acuFirstTokenMs({
      acu_cost_breakdown: {
        channel_attempts: [
          { status: 'error', first_model_event_latency_ms: 100 },
          { status: 'success', first_model_event_latency_ms: 420 },
        ],
      },
    }),
    420
  )
  assert.equal(acuFirstTokenMs({}), undefined)
})

test('ACU presentation reads Judge status from decision summary and separates explicit requests', () => {
  const cases = [
    ['disk_cache', { judge_result_source: 'disk_cache' }, 'cache'],
    [
      'rules_strategy',
      { judge_result_source: 'rules_strategy' },
      'rules_fallback',
    ],
    ['failover', { judge_same_model_failover_used: true }, 'profile_failover'],
  ] as const
  for (const [, decision, expected] of cases) {
    const presentation = acuLogPresentation({
      acu_logical_request_id: 'req-1',
      acu_cost_breakdown: {
        requested_model: 'acu-auto',
        judge_model: 'gpt-5.6-sol',
        decision_summary: decision,
      },
    })
    assert.equal(presentation.judgeMode, expected)
    assert.equal(presentation.automaticRouting, true)
  }

  const explicit = acuLogPresentation({
    acu_logical_request_id: 'req-2',
    acu_cost_breakdown: { requested_model: 'gpt-5.6-sol' },
  })
  assert.equal(explicit.acuManaged, true)
  assert.equal(explicit.automaticRouting, false)
  assert.equal(explicit.judgeMode, 'not_required')
})

test('ACU presentation shows background Judge work as pending', () => {
  const presentation = acuLogPresentation({
    acu_logical_request_id: 'req-background-judge',
    acu_cost_breakdown: {
      requested_model: 'acu-auto',
      judge_pending: true,
    },
  })
  assert.equal(presentation.automaticRouting, true)
  assert.equal(presentation.judgeMode, 'pending')
})

test('ACU presentation accepts the admin breakdown used by administrator logs', () => {
  const presentation = acuLogPresentation(
    {
      acu_logical_request_id: 'req-admin-judge',
      acu_cost_breakdown: {
        requested_model: 'acu-auto',
        judge_pending: true,
      },
    },
    {
      requested_model: 'acu-auto',
      judge_pending: false,
      judge_model: 'gpt-5.6-sol',
      judge_cash_cost_cny: 0.0042,
    }
  )
  assert.equal(presentation.judgeMode, 'judge')
  assert.equal(presentation.judgeModel, 'gpt-5.6-sol')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { UsageLog } from '../../data/schema'
import {
  acuCacheReadTokens,
  acuDurationSeconds,
  acuFirstTokenMs,
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
        channel_attempts: [
          { status: 'error', first_model_event_latency_ms: 100 },
          { status: 'success', first_model_event_latency_ms: 420 },
        ],
      },
    })
  )
  assert.equal(acuCacheReadTokens(other), 12640)
  assert.equal(acuDurationSeconds(log, other), 36)
  assert.equal(acuFirstTokenMs(other), 420)
})

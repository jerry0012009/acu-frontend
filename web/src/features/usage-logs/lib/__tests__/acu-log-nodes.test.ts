import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { UsageLog } from '../../data/schema'
import { mergeACULogNodes } from '../acu-log-nodes'

function log(
  id: number,
  model: string,
  other: object,
  content: string
): UsageLog {
  return {
    id,
    user_id: 1,
    created_at: id,
    type: id === 2 ? 5 : 2,
    content,
    username: '',
    token_name: '',
    model_name: model,
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: true,
    channel: 0,
    channel_name: '',
    token_id: 1,
    group: '',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'same-request',
    upstream_request_id: '',
  }
}

test('merges the raw 524 and finalization into one logical request node', () => {
  const logs = mergeACULogNodes([
    log(2, 'acu-auto', {}, 'status_code=524'),
    log(
      1,
      'gpt-5.6-luna',
      { acu_logical_request_id: 'req_fixture' },
      'finalized'
    ),
  ])

  assert.equal(logs.length, 1)
  assert.equal(logs[0].model_name, 'gpt-5.6-luna')
  const other = JSON.parse(logs[0].other)
  assert.equal(other.acu_logical_request_id, 'req_fixture')
  assert.equal(other.acu_related_events.length, 1)
  assert.equal(other.acu_related_events[0].status, 524)
})

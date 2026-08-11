import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { UsageLog } from '../../../data/schema'
import type { LogOtherData } from '../../../types'
import {
  isFinalizedAcuUsageLog,
  shouldShowAcuInternalDetails,
} from '../details-dialog-model'

const finalizedLog: UsageLog = {
  id: 1,
  user_id: 7,
  created_at: 0,
  type: 2,
  content: 'ACU usage finalized',
  username: '',
  token_name: 'test-token',
  model_name: 'gpt-5.6-terra',
  quota: 12,
  prompt_tokens: 10,
  completion_tokens: 5,
  use_time: 1,
  is_stream: true,
  channel: 0,
  channel_name: '',
  token_id: 2,
  group: '',
  ip: '',
  other: '',
  request_id: 'request-1',
  upstream_request_id: '',
}

const finalizedOther: LogOtherData = {
  acu_billing_status: 'finalized',
  acu_logical_request_id: 'logical-1',
  actual_provider: 'provider-internal',
  actual_channel: 'channel-internal',
}

test('recognizes finalized ACU usage and hides internal details for ordinary users', () => {
  assert.equal(isFinalizedAcuUsageLog(finalizedLog, finalizedOther), true)
  assert.equal(
    shouldShowAcuInternalDetails(finalizedLog, finalizedOther, false),
    false
  )
})

test('keeps finalized ACU details available to admins', () => {
  assert.equal(
    shouldShowAcuInternalDetails(finalizedLog, finalizedOther, true),
    true
  )
})

test('does not hide internal details for non-finalized ACU usage', () => {
  const pendingLog = {
    ...finalizedLog,
    content: 'ACU usage pending settlement',
  }
  const pendingOther = {
    ...finalizedOther,
    acu_billing_status: 'unsettled',
  }

  assert.equal(isFinalizedAcuUsageLog(pendingLog, pendingOther), false)
  assert.equal(
    shouldShowAcuInternalDetails(pendingLog, pendingOther, false),
    true
  )
})

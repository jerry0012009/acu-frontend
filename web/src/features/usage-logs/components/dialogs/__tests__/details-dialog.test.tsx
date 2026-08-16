import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createInstance } from 'i18next'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'

import type { UsageLog } from '../../../data/schema'
import type { LogOtherData } from '../../../types'
import {
  AcuExecutionAttempts,
  AcuSessionTraceDisclosure,
} from '../details-dialog'
import {
  isFinalizedAcuUsageLog,
  shouldShowAcuInternalDetails,
} from '../details-dialog-model'

Object.defineProperty(globalThis, 'React', {
  configurable: true,
  value: React,
})

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

async function renderWithI18n(node: React.ReactNode): Promise<string> {
  const i18n = createInstance()
  await i18n
    .use(initReactI18next)
    .init({ lng: 'en', resources: { en: { translation: {} } } })
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
  )
}

test('keeps Session Trace collapsed and unmounted by default', async () => {
  const html = await renderWithI18n(
    <AcuSessionTraceDisclosure identifier='req-1' isAdmin />
  )

  assert.match(html, /View full Session Trace/)
  assert.doesNotMatch(html, /Loading ACU Session Trace/)
})

test('shows real attempts to admins and only alias attempts to ordinary users', async () => {
  const breakdown: NonNullable<LogOtherData['acu_cost_breakdown']> = {
    channel_attempts: [
      {
        attempt_index: 1,
        provider: 'one',
        channel_id: '7737',
        execution_profile_id: 'profile-one',
        network_endpoint: 'https://secret.example',
        status: 'error',
        error_category: 'slow_first_model_event',
      },
      {
        attempt_index: 2,
        provider: 'lucen',
        channel_id: '1537',
        execution_profile_id: 'profile-two',
        status: 'success',
      },
    ],
  }

  const admin = await renderWithI18n(
    <AcuExecutionAttempts breakdown={breakdown} isAdmin />
  )
  const ordinary = await renderWithI18n(
    <AcuExecutionAttempts breakdown={breakdown} isAdmin={false} />
  )

  assert.match(admin, /one · #7737/)
  assert.match(admin, /profile-one/)
  assert.match(admin, /slow_first_model_event/)
  assert.match(ordinary, new RegExp(publicChannelAlias('one', '7737')))
  assert.match(ordinary, new RegExp(publicChannelAlias('lucen', '1537')))
  assert.match(ordinary, /ACU 线路 \d{4}/)
  assert.doesNotMatch(ordinary, /ACU Route #1|ACU Route #2/)
  assert.doesNotMatch(ordinary, /ACU 线路 #1|ACU 线路 #2/)
  assert.doesNotMatch(ordinary, /\bone\b|\blucen\b|\b7737\b|\b1537\b/)
  assert.doesNotMatch(ordinary, /profile-one|profile-two|secret\.example/)
})

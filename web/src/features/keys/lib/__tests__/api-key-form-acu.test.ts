import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getApiKeyFormSchema,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
} from '../api-key-form.ts'
import { apiKeySchema, type ApiKey } from '../../types.ts'

test('legacy null Profile limits normalize to an empty array', () => {
  const result = apiKeySchema.parse({
    id: 1,
    key: 'masked',
    name: 'legacy-token',
    status: 1,
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    used_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: '',
    acu_profile_limits_enabled: false,
    acu_profile_limits: null,
    allow_ips: '',
  })
  assert.deepEqual(result.acu_profile_limits, [])
})

test('all verified mode disables existing Token ModelLimits', () => {
  const payload = transformFormDataToPayload({
    name: 'all-models',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: [],
    acu_model_scope_custom: false,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
  })
  assert.equal(payload.model_limits_enabled, false)
  assert.equal(payload.model_limits, '')
})

test('custom mode persists virtual ACU entry models without showing them as choices', () => {
  const payload = transformFormDataToPayload({
    name: 'custom-models',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: ['gpt-5.6-luna'],
    acu_model_scope_custom: true,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
  })
  assert.equal(payload.model_limits_enabled, true)
  assert.deepEqual(new Set(payload.model_limits.split(',')), new Set([
    'gpt-5.6-luna',
    'acu-auto',
    'acu-high',
  ]))

  const defaults = transformApiKeyToFormDefaults({
    id: 1,
    user_id: 1,
    key: 'masked',
    name: 'custom-models',
    status: 1,
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: true,
    model_limits: payload.model_limits,
    acu_profile_limits_enabled: false,
    acu_profile_limits: [],
    allow_ips: '',
    used_quota: 0,
    group: 'default',
    cross_group_retry: false,
  } as ApiKey)
  assert.deepEqual(defaults.model_limits, ['gpt-5.6-luna'])
  assert.equal(defaults.acu_model_scope_custom, true)
})

test('custom mode requires at least one real routing model', () => {
  const schema = getApiKeyFormSchema(((value: string) => value) as never)
  const result = schema.safeParse({
    name: 'empty-custom-scope',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: [],
    acu_model_scope_custom: true,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
  })
  assert.equal(result.success, false)
})

test('custom Profile mode persists exact execution Profile IDs', () => {
  const payload = transformFormDataToPayload({
    name: 'profile-scope',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: [],
    acu_model_scope_custom: false,
    acu_profile_scope_custom: true,
    acu_profile_limits: ['lucen:luna:responses', 'closeai:luna:responses'],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
  })
  assert.equal(payload.acu_profile_limits_enabled, true)
  assert.deepEqual(payload.acu_profile_limits, [
    'closeai:luna:responses',
    'lucen:luna:responses',
  ])
})

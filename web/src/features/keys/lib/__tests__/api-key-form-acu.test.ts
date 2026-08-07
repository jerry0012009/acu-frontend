import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiKeySchema, type ApiKey } from '../../types.ts'
import {
  getApiKeyFormSchema,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
} from '../api-key-form.ts'

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
    acu_routing_preference: 'balanced',
    acu_quality_mode: 'balanced',
    acu_quality_bias: 0,
    acu_supply_strategy: 'balanced',
    acu_allowed_candidate_ids: ['gpt-5.6-luna@max'],
    acu_candidate_preference_scores: { 'gpt-5.6-luna@max': 150 },
  })
  assert.equal(payload.model_limits_enabled, false)
  assert.equal(payload.model_limits, '')
  assert.deepEqual(payload.acu_allowed_candidate_ids, [])
  assert.deepEqual(payload.acu_candidate_preference_scores, {})
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
    acu_routing_preference: 'quality',
    acu_quality_mode: 'quality',
    acu_quality_bias: 0,
    acu_supply_strategy: 'balanced',
    acu_allowed_candidate_ids: ['gpt-5.6-luna', 'gpt-5.6-luna@max'],
    acu_candidate_preference_scores: { 'gpt-5.6-luna@max': 150 },
  })
  assert.equal(payload.model_limits_enabled, true)
  assert.deepEqual(
    new Set(payload.model_limits.split(',')),
    new Set(['gpt-5.6-luna', 'acu-auto', 'acu-high'])
  )

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
    acu_routing_preference: 'balanced',
    acu_quality_bias: null,
    acu_supply_strategy: 'balanced',
    acu_allowed_candidate_ids: ['gpt-5.6-luna', 'gpt-5.6-luna@max'],
    acu_candidate_preference_scores: { 'gpt-5.6-luna@max': 150 },
  } as ApiKey)
  assert.deepEqual(defaults.model_limits, ['gpt-5.6-luna'])
  assert.equal(defaults.acu_model_scope_custom, true)
  assert.deepEqual(defaults.acu_allowed_candidate_ids, [
    'gpt-5.6-luna',
    'gpt-5.6-luna@max',
  ])
  assert.deepEqual(defaults.acu_candidate_preference_scores, {
    'gpt-5.6-luna@max': 150,
  })
})

test('custom mode requires at least one routing candidate', () => {
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
    acu_routing_preference: 'economy',
    acu_quality_mode: 'economy',
    acu_quality_bias: 0,
    acu_supply_strategy: 'balanced',
    acu_allowed_candidate_ids: [],
    acu_candidate_preference_scores: {},
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
    acu_routing_preference: 'balanced',
    acu_quality_mode: 'balanced',
    acu_quality_bias: 0,
    acu_supply_strategy: 'balanced',
    acu_allowed_candidate_ids: [],
    acu_candidate_preference_scores: {},
  })
  assert.equal(payload.acu_profile_limits_enabled, true)
  assert.deepEqual(payload.acu_profile_limits, [
    'closeai:luna:responses',
    'lucen:luna:responses',
  ])
})

test('custom quality bias and supply strategy survive payload and clone defaults', () => {
  const payload = transformFormDataToPayload({
    name: 'custom-utility',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: [],
    acu_model_scope_custom: false,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
    acu_routing_preference: 'balanced',
    acu_quality_mode: 'custom',
    acu_quality_bias: -37,
    acu_supply_strategy: 'high_reliability',
    acu_allowed_candidate_ids: [],
    acu_candidate_preference_scores: {},
  })
  assert.equal(payload.acu_routing_preference, 'balanced')
  assert.equal(payload.acu_quality_bias, -37)
  assert.equal(payload.acu_supply_strategy, 'high_reliability')

  const defaults = transformApiKeyToFormDefaults({
    id: 7,
    name: 'custom-utility',
    key: 'masked',
    status: 1,
    remain_quota: 123,
    used_quota: 456,
    unlimited_quota: false,
    expired_time: -1,
    created_time: 1,
    accessed_time: 2,
    group: 'default',
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    acu_profile_limits_enabled: false,
    acu_profile_limits: [],
    acu_routing_preference: 'balanced',
    acu_quality_bias: -37,
    acu_supply_strategy: 'high_reliability',
    acu_allowed_candidate_ids: [],
    acu_candidate_preference_scores: {},
    allow_ips: '',
  })
  assert.equal(defaults.acu_quality_mode, 'custom')
  assert.equal(defaults.acu_quality_bias, -37)
  assert.equal(defaults.acu_supply_strategy, 'high_reliability')
})

test('preset quality mode clears custom bias', () => {
  const payload = transformFormDataToPayload({
    name: 'preset-utility',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: [],
    acu_model_scope_custom: false,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
    acu_routing_preference: 'balanced',
    acu_quality_mode: 'quality',
    acu_quality_bias: -37,
    acu_supply_strategy: 'lowest_cost',
    acu_allowed_candidate_ids: [],
    acu_candidate_preference_scores: {},
  })
  assert.equal(payload.acu_routing_preference, 'quality')
  assert.equal(payload.acu_quality_bias, null)
  assert.equal(payload.acu_supply_strategy, 'lowest_cost')
})

test('candidate allowlist and preferences round-trip sparsely for create, edit, and clone', () => {
  const payload = transformFormDataToPayload({
    name: 'preferences',
    remain_quota_dollars: 0,
    unlimited_quota: true,
    model_limits: ['gpt-5.6-luna', 'gpt-5.6-sol'],
    acu_model_scope_custom: true,
    acu_profile_scope_custom: false,
    acu_profile_limits: [],
    acu_allowed_candidate_ids: ['gpt-5.6-luna@max', 'gpt-5.6-sol@high'],
    acu_candidate_preference_scores: {
      'gpt-5.6-luna@max': 150,
      'gpt-5.6-sol@high': 100,
    },
    allow_ips: '',
    group: 'default',
    cross_group_retry: false,
    acu_routing_preference: 'balanced',
    acu_quality_mode: 'balanced',
    acu_quality_bias: 0,
    acu_supply_strategy: 'balanced',
  })
  assert.deepEqual(payload.acu_allowed_candidate_ids, [
    'gpt-5.6-luna@max',
    'gpt-5.6-sol@high',
  ])
  assert.deepEqual(payload.acu_candidate_preference_scores, {
    'gpt-5.6-luna@max': 150,
    'gpt-5.6-sol@high': 100,
  })
  assert.deepEqual(
    new Set(payload.model_limits.split(',')),
    new Set(['gpt-5.6-luna', 'gpt-5.6-sol', 'acu-auto', 'acu-high'])
  )

  const schema = getApiKeyFormSchema(((value: string) => value) as never)
  const invalid = schema.safeParse({
    ...transformApiKeyToFormDefaults({
      id: 1,
      name: 'preferences',
      key: 'masked',
      status: 1,
      remain_quota: 0,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 0,
      accessed_time: 0,
      group: 'default',
      cross_group_retry: false,
      model_limits_enabled: true,
      model_limits: 'gpt-5.6-luna',
      acu_profile_limits_enabled: false,
      acu_profile_limits: [],
      acu_routing_preference: 'balanced',
      acu_quality_bias: null,
      acu_supply_strategy: 'balanced',
      acu_allowed_candidate_ids: ['gpt-5.6-luna'],
      acu_candidate_preference_scores: { 'gpt-5.6-sol@high': 150 },
      allow_ips: '',
    }),
  })
  assert.equal(invalid.success, false)
})

test('fractional candidate preferences pass validation and remain fractional in the payload', () => {
  const values = {
    ...transformApiKeyToFormDefaults({
      id: 1,
      name: 'fractional-preference',
      key: 'masked',
      status: 1,
      remain_quota: 0,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 0,
      accessed_time: 0,
      group: 'default',
      cross_group_retry: false,
      model_limits_enabled: true,
      model_limits: 'gpt-5.6-luna',
      acu_profile_limits_enabled: false,
      acu_profile_limits: [],
      acu_routing_preference: 'balanced',
      acu_quality_bias: null,
      acu_supply_strategy: 'balanced',
      acu_allowed_candidate_ids: ['gpt-5.6-luna@max'],
      acu_candidate_preference_scores: { 'gpt-5.6-luna@max': 99.9 },
      allow_ips: '',
    }),
  }
  const schema = getApiKeyFormSchema(((value: string) => value) as never)

  const parsed = schema.parse(values)
  const payload = transformFormDataToPayload(parsed)

  assert.equal(
    payload.acu_candidate_preference_scores['gpt-5.6-luna@max'],
    99.9
  )
})

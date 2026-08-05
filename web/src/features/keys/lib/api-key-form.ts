/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'
import { z } from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import { DEFAULT_GROUP } from '../constants'
import type { ApiKeyFormData, ApiKey } from '../types'

// ============================================================================
// Form Schema
// ============================================================================

export function getApiKeyFormSchema(t: TFunction) {
  return z
    .object({
      name: z.string().min(1, t('Please enter a name')),
      remain_quota_dollars: z.number().optional(),
      expired_time: z.date().optional(),
      unlimited_quota: z.boolean(),
      model_limits: z.array(z.string()),
      acu_model_scope_custom: z.boolean(),
      acu_profile_scope_custom: z.boolean(),
      acu_profile_limits: z.array(z.string()),
      acu_routing_preference: z.enum(['economy', 'balanced', 'quality']),
      acu_quality_mode: z.enum(['economy', 'balanced', 'quality', 'custom']),
      acu_quality_bias: z.number().int().min(-100).max(100),
      acu_supply_strategy: z.enum([
        'lowest_cost',
        'balanced',
        'low_latency',
        'high_reliability',
      ]),
      acu_allowed_candidate_ids: z.array(z.string()),
      acu_candidate_preference_scores: z.record(
        z.string(),
        z.number().min(0).max(200)
      ),
      allow_ips: z.string().optional(),
      group: z.string().optional(),
      cross_group_retry: z.boolean().optional(),
      tokenCount: z.number().min(1).optional(),
    })
    .superRefine((data, ctx) => {
      if (
        data.acu_model_scope_custom &&
        data.acu_allowed_candidate_ids.length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['acu_allowed_candidate_ids'],
          message: t('Select at least one routing candidate'),
        })
      }
      if (
        data.acu_allowed_candidate_ids.length > 0 &&
        Object.keys(data.acu_candidate_preference_scores).some(
          (candidateId) => !data.acu_allowed_candidate_ids.includes(candidateId)
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['acu_candidate_preference_scores'],
          message: t('Candidate preferences must use allowed candidates'),
        })
      }
      if (
        data.acu_profile_scope_custom &&
        data.acu_profile_limits.length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['acu_profile_limits'],
          message: t('Select at least one execution Profile'),
        })
      }

      if (data.unlimited_quota) {
        return
      }

      if (
        data.remain_quota_dollars === undefined ||
        data.remain_quota_dollars < 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['remain_quota_dollars'],
          message: t('Quota must be zero or greater'),
        })
      }
    })
}

export type ApiKeyFormValues = z.infer<ReturnType<typeof getApiKeyFormSchema>>

// ============================================================================
// Form Defaults
// ============================================================================

export const API_KEY_FORM_DEFAULT_VALUES: ApiKeyFormValues = {
  name: '',
  remain_quota_dollars: 10,
  expired_time: undefined,
  unlimited_quota: true,
  model_limits: [],
  acu_model_scope_custom: false,
  acu_profile_scope_custom: false,
  acu_profile_limits: [],
  acu_routing_preference: 'balanced',
  acu_quality_mode: 'balanced',
  acu_quality_bias: 0,
  acu_supply_strategy: 'balanced',
  acu_allowed_candidate_ids: [],
  acu_candidate_preference_scores: {},
  allow_ips: '',
  group: DEFAULT_GROUP,
  cross_group_retry: true,
  tokenCount: 1,
}

export function getApiKeyFormDefaultValues(
  defaultUseAutoGroup: boolean
): ApiKeyFormValues {
  return {
    ...API_KEY_FORM_DEFAULT_VALUES,
    group: defaultUseAutoGroup ? 'auto' : DEFAULT_GROUP,
    cross_group_retry: defaultUseAutoGroup,
  }
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: ApiKeyFormValues
): ApiKeyFormData {
  return {
    name: data.name,
    remain_quota: data.unlimited_quota
      ? 0
      : parseQuotaFromDollars(data.remain_quota_dollars || 0),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : -1,
    unlimited_quota: data.unlimited_quota,
    model_limits_enabled: data.acu_model_scope_custom,
    model_limits: data.acu_model_scope_custom
      ? [
          ...new Set([
            ...data.acu_allowed_candidate_ids.map(
              (candidateId) => candidateId.split('@', 1)[0]
            ),
            'acu-auto',
            'acu-high',
          ]),
        ].join(',')
      : '',
    acu_profile_limits_enabled: data.acu_profile_scope_custom,
    acu_profile_limits: data.acu_profile_scope_custom
      ? [...new Set(data.acu_profile_limits)].sort()
      : [],
    acu_routing_preference:
      data.acu_quality_mode === 'custom' ? 'balanced' : data.acu_quality_mode,
    acu_quality_bias:
      data.acu_quality_mode === 'custom' ? data.acu_quality_bias : null,
    acu_supply_strategy: data.acu_supply_strategy,
    acu_allowed_candidate_ids: data.acu_model_scope_custom
      ? [...new Set(data.acu_allowed_candidate_ids)].sort()
      : [],
    acu_candidate_preference_scores: data.acu_model_scope_custom
      ? Object.fromEntries(
          Object.entries(data.acu_candidate_preference_scores)
            .filter(([, score]) => score !== 100)
            .sort(([left], [right]) => left.localeCompare(right))
        )
      : {},
    allow_ips: data.allow_ips || '',
    group: data.group || '',
    cross_group_retry: data.group === 'auto' ? !!data.cross_group_retry : false,
  }
}

/**
 * Transform API key data to form defaults
 */
export function transformApiKeyToFormDefaults(
  apiKey: ApiKey
): ApiKeyFormValues {
  return {
    name: apiKey.name,
    remain_quota_dollars: apiKey.unlimited_quota
      ? 0
      : quotaUnitsToDollars(apiKey.remain_quota),
    expired_time:
      apiKey.expired_time > 0
        ? new Date(apiKey.expired_time * 1000)
        : undefined,
    unlimited_quota: apiKey.unlimited_quota,
    model_limits: apiKey.model_limits
      ? apiKey.model_limits
          .split(',')
          .filter(
            (model) => model && model !== 'acu-auto' && model !== 'acu-high'
          )
      : [],
    acu_model_scope_custom: apiKey.model_limits_enabled,
    acu_profile_scope_custom: apiKey.acu_profile_limits_enabled,
    acu_profile_limits: apiKey.acu_profile_limits ?? [],
    acu_routing_preference: apiKey.acu_routing_preference || 'balanced',
    acu_quality_mode:
      apiKey.acu_quality_bias == null
        ? apiKey.acu_routing_preference || 'balanced'
        : 'custom',
    acu_quality_bias: apiKey.acu_quality_bias ?? 0,
    acu_supply_strategy: apiKey.acu_supply_strategy || 'balanced',
    acu_allowed_candidate_ids: apiKey.acu_allowed_candidate_ids ?? [],
    acu_candidate_preference_scores:
      apiKey.acu_candidate_preference_scores ?? {},
    allow_ips: apiKey.allow_ips || '',
    group: apiKey.group || DEFAULT_GROUP,
    cross_group_retry: !!apiKey.cross_group_retry,
    tokenCount: 1,
  }
}

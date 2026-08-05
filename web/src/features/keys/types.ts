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
import { z } from 'zod'

// ============================================================================
// API Key Schema & Types
// ============================================================================

export const apiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(),
  status: z.number(), // 1: enabled, 2: disabled, 3: expired, 4: exhausted
  remain_quota: z.number(),
  used_quota: z.number(),
  unlimited_quota: z.boolean(),
  expired_time: z.number(), // -1 for never expires
  created_time: z.number(),
  accessed_time: z.number(),
  group: z.string().nullish().default(''),
  cross_group_retry: z
    .preprocess((v) => {
      if (v === 1) return true
      if (v === 0) return false
      return v
    }, z.boolean())
    .optional()
    .default(false),
  model_limits_enabled: z.boolean(),
  model_limits: z.string().nullish().default(''),
  acu_profile_limits_enabled: z.boolean().optional().default(false),
  acu_profile_limits: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  acu_routing_preference: z
    .enum(['economy', 'balanced', 'quality'])
    .catch('balanced'),
  acu_quality_bias: z.number().int().min(-100).max(100).nullable().optional(),
  acu_supply_strategy: z
    .enum(['lowest_cost', 'balanced', 'low_latency', 'high_reliability'])
    .catch('balanced'),
  acu_allowed_candidate_ids: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  acu_candidate_preference_scores: z
    .record(z.string(), z.number().min(0).max(200))
    .nullish()
    .transform((value) => value ?? {}),
  allow_ips: z.string().nullish().default(''),
})

export type ApiKey = z.infer<typeof apiKeySchema>

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface GetApiKeysParams {
  p?: number
  size?: number
}

export interface GetApiKeysResponse {
  success: boolean
  message?: string
  data?: {
    items: ApiKey[]
    total: number
    page: number
    page_size: number
  }
}

export interface SearchApiKeysParams {
  keyword?: string
  token?: string
  p?: number
  size?: number
}

export interface ApiKeyFormData {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  acu_profile_limits_enabled: boolean
  acu_profile_limits: string[]
  acu_routing_preference: 'economy' | 'balanced' | 'quality'
  acu_quality_bias: number | null
  acu_supply_strategy:
    | 'lowest_cost'
    | 'balanced'
    | 'low_latency'
    | 'high_reliability'
  acu_allowed_candidate_ids: string[]
  acu_candidate_preference_scores: Record<string, number>
  allow_ips: string
  group: string
  cross_group_retry: boolean
}

// ============================================================================
// Dialog Types
// ============================================================================

export type ApiKeysDialogType =
  | 'create'
  | 'clone'
  | 'update'
  | 'delete'
  | 'batch-delete'
  | 'cc-switch'

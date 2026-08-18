/**
 * Type definitions for usage logs
 */
import type { UsageLog } from './data/schema'

// ============================================================================
// Log Category Types
// ============================================================================

/**
 * Log category for different log types
 */
export type LogCategory = 'common' | 'drawing' | 'task'

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Common filters (shared across all log types)
 */
export interface CommonFilters {
  startTime?: Date
  endTime?: Date
  channel?: string
}

/**
 * Common logs specific filters
 */
export interface CommonLogFilters extends CommonFilters {
  model?: string
  token?: string
  group?: string
  username?: string
  requestId?: string
  upstreamRequestId?: string
}

/**
 * Drawing logs specific filters
 */
export interface DrawingLogFilters extends CommonFilters {
  mjId?: string
}

/**
 * Task logs specific filters
 */
export interface TaskLogFilters extends CommonFilters {
  taskId?: string
}

/**
 * Union type for all log filters
 */
export type LogFilters = CommonLogFilters | DrawingLogFilters | TaskLogFilters

// ============================================================================
// Common Logs Additional Types
// ============================================================================

/**
 * Parsed data from the 'other' field in usage logs
 */
export interface ChannelAffinityInfo {
  rule_name?: string
  selected_group?: string
  key_source?: string
  key_path?: string
  key_key?: string
  key_hint?: string
  key_fp?: string
  using_group?: string
}

export const USAGE_BILLING_PATH = {
  LOCAL: 'local',
  UPSTREAM: 'upstream',
  OPENAI: 'billing-usage-openai',
  OPENAI_ESTIMATED: 'billing-usage-openai-estimated',
  ANTHROPIC: 'billing-usage-anthropic',
  ANTHROPIC_ESTIMATED: 'billing-usage-anthropic-estimated',
  GEMINI: 'billing-usage-gemini',
  GEMINI_ESTIMATED: 'billing-usage-gemini-estimated',
} as const

export type UsageBillingPath =
  (typeof USAGE_BILLING_PATH)[keyof typeof USAGE_BILLING_PATH]

export interface ToolSurchargeItem {
  name: string
  count: number
  price: number
}

export interface AcuRouteCandidateEstimate {
  candidateId?: string
  modelId?: string
  executionPresetId?: string
  reasoningEffort?: string
  displayName?: string
  estimatedQuality?: number
  expectedTotalCost?: number
  paretoEfficient?: boolean
  selectionReason?: string
  selected?: boolean
  [key: string]: unknown
}

export interface AcuRouteDecisionView {
  route_decision_id?: string
  phase?: string
  curve_version?: string
  price_version?: string
  routing_formula_version?: string
  difficulty?: number
  routing_preference?: string
  effective_quality_target?: number
  candidate_estimates?: AcuRouteCandidateEstimate[]
  pareto_frontier?: string[]
  selected_profile?: Record<string, unknown>
  route_explanation?: string
  excluded_profiles?: Array<{
    executionProfileId?: string
    reasons?: string[]
    exclusionReason?: string
    exclusionDetail?: string
  }>
  decision_snapshot?: {
    selectedModel?: string
    selectedCandidateId?: string
    selectedExecutionPresetId?: string
    resolvedReasoningEffort?: string
    selectedChannel?: string
    modelSelectionReason?: string
    channelSelectionReason?: string
    qualityCeilingModel?: string
    costReductionVsCeiling?: number
    candidates?: Array<{
      candidateId?: string
      modelId?: string
      displayName?: string
      executionPresetId?: string
      reasoningEffort?: string
      estimatedQuality?: number
      nominalCost?: number | null
      effectiveCashCost?: number | null
      valueScore?: number | null
      pareto?: boolean | null
      exclusionReason?: string | null
      selected?: boolean
    }>
    [key: string]: unknown
  }
  curves?: Record<
    string,
    Array<{
      difficulty: number
      estimatedQuality?: number
      estimated_quality?: number
    }>
  >
}

export interface AcuChannelAttempt {
  attempt_index?: number
  provider?: string
  channel?: string
  channel_id?: string
  channel_name?: string
  execution_profile_id?: string
  model?: string
  actual_model?: string
  protocol?: string
  endpoint?: string
  endpoint_host?: string
  network_endpoint?: string
  status?: string
  error_category?: string | null
  error_class?: string | null
  http_status?: number | null
  latency_ms?: number | null
  first_model_event_latency_ms?: number | null
  first_model_event_at?: string | null
  started_at?: string
  completed_at?: string | null
  nominal_cost_usd?: number
  effective_cost_cny?: number
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  input_price_per_million?: number
  output_price_per_million?: number
}

export interface AcuCostBreakdown {
  requested_model?: string
  protocol?: string
  routed_by_acu?: boolean
  session_id?: string
  task_id?: string
  segment_id?: string
  judge_trigger?: string
  judge_calls?: number
  judge_reused?: boolean
  reused_judge_evaluation_id?: string
  route_refresh_reason?: string
  judge?: string
  provider?: string
  usageSource?: string
  mode?: string
  difficulty?: number
  candidate_count?: number
  selected_model?: string
  route_reason?: string
  quality_upper_bound_model?: string
  estimated_cost_reduction_vs_quality_upper_bound_usd?: number
  estimated_cost_reduction_vs_quality_upper_bound_cny?: number
  reasoning_effort?: string
  routing_preference?: string
  canonical_model?: string
  provider_model?: string
  selected_provider?: string
  actual_provider?: string
  provider_selection_reason?: string
  model_selection_reason?: string
  routing_group?: string
  channel_id?: string
  channel_name?: string
  network_endpoint?: string
  fallback_chain?: string
  circuit_state?: string
  cooldown_until?: string
  error_class?: string
  recent_success_rate?: number
  effective_cost_status?: string
  billing_multiplier?: number
  channel_multiplier?: number
  retail_markup_multiplier?: number
  billing_version?: string
  billing_policy_version?: string
  nominal_provider_cost_usd?: number
  provider_balance_charge?: number
  provider_balance_currency?: string
  provider_credit_cash_cost_cny?: number
  effective_provider_cash_cost_cny?: number
  effective_cash_cost_cny?: number
  user_charge?: string
  user_charge_cny?: number | string
  official_catalog_cost_usd?: number | string
  official_reference_cost_usd?: number | string
  official_input_price_per_million_usd?: number
  official_output_price_per_million_usd?: number
  official_cached_input_price_per_million_usd?: number | null
  official_cache_write_price_per_million_usd?: number | null
  official_judge_reference_cost_usd?: number | string
  channel_discount_multiplier?: number | string
  actual_total_cash_cost_cny?: number
  judge_cash_cost_cny?: number
  judge_input_tokens?: number
  judge_output_tokens?: number
  judge_official_payg_equivalent_cost?: number
  judge_cost_currency?: string
  judge_cost_status?:
    | 'estimated_blended'
    | 'estimated_upper_bound'
    | 'verified'
    | 'mixed'
    | 'not_applicable'
  judge_cost_source?: string
  judge_provider?: string
  judge_model?: string
  judge_protocol?: string
  judge_reasoning_effort?: string
  judge_result_source?: string
  judge_status?: string
  decision_summary?: {
    judge_result_source?: string
    judge_status?: string
    judge_same_model_failover_used?: boolean
    resolved_reasoning_effort?: string
    preset_reasoning_effort?: string
    client_requested_reasoning_effort?: string
    profile_attempt_count?: number
    recovery_decision_reason?: string
  }
  failed_attempt_cash_cost_cny?: number
  counterfactual_quality_ceiling_cost_cny?: number
  reference_provider?: string
  reference_effective_cash_cost_cny?: number
  effective_savings_vs_reference_cny?: number
  effective_cost_source?: string
  effective_cost_version?: string
  client_declared_web_tool?: boolean
  web_intent?: 'required' | 'likely' | 'not_required'
  web_intent_source?: 'judge' | 'heuristic_fallback' | 'legacy_heuristic'
  web_actually_invoked?: boolean
  web_search_event_status?: string[]
  web_profile_verified?: boolean
  web_fallback_chain?: string[]
  web_tool_pruned?: boolean
  web_tool_prune_reason?: string
  phase?: string
  judge_explanation?: string
  route_decision?: AcuRouteDecisionView
  channel_attempts?: AcuChannelAttempt[]
  first_model_event_latency_ms?: number
  end_to_end_latency_ms?: number
  judge_latency_ms?: number
  provider_latency_ms?: number
}

export interface LogOtherData {
  admin_info?: {
    is_multi_key?: boolean
    multi_key_index?: number
    use_channel?: number[]
    local_count_tokens?: boolean
    usage_billing_path?: UsageBillingPath | string
    channel_affinity?: ChannelAffinityInfo
    // Top-up audit fields (type=1, admin only)
    payment_method?: string
    callback_payment_method?: string
    caller_ip?: string
    server_ip?: string
    version?: string
    node_name?: string
    // Operator identity for audit logs (type=3, admin only)
    admin_username?: string
    admin_id?: number | string
    admin_role?: number
    auth_method?: 'session' | 'access_token' | string
    acu_cost_breakdown?: AcuCostBreakdown
    actual_provider?: string
    actual_channel?: string
    // Quota saturation marker: set when a quota conversion clamped at the
    // int32 bound (overflow/underflow) or hit a NaN fallback while computing
    // this request's charge. Admin-only (nested under admin_info).
    quota_saturation?: {
      op: string
      kind: 'overflow' | 'underflow' | 'nan'
      original: number
      clamped: number
    }
  }
  // Language-independent operation descriptor (audit/login logs).
  // Frontend renders localized content from action + params via i18n templates.
  op?: {
    action?: string
    params?: Record<string, string | number | boolean | string[]>
  }
  // Operation audit details written by the admin-audit fallback in authHelper (type=3, admin only)
  audit_info?: {
    method?: string
    route?: string
    path?: string
    status?: number
    success?: boolean
    params?: Record<string, string>
  }
  // Login audit fields (type=7); visible to the log owner
  login_method?: string
  user_agent?: string
  request_path?: string
  request_conversion?: string[]
  ws?: boolean
  audio?: boolean
  audio_input?: number
  audio_output?: number
  text_input?: number
  text_output?: number
  cache_tokens?: number
  cache_creation_tokens?: number
  cache_creation_tokens_5m?: number
  cache_creation_tokens_1h?: number
  claude?: boolean
  model_ratio?: number
  completion_ratio?: number
  model_price?: number
  group_ratio?: number
  user_group_ratio?: number
  cache_ratio?: number
  cache_creation_ratio?: number
  cache_creation_ratio_5m?: number
  cache_creation_ratio_1h?: number
  is_model_mapped?: boolean
  upstream_model_name?: string
  audio_ratio?: number
  audio_completion_ratio?: number
  frt?: number
  // Tiered (expression-based) billing fields, set by backend when
  // billing_mode === 'tiered_expr'. expr_b64 is the base64-encoded billing
  // expression and matched_tier is the label of the tier that fired.
  billing_mode?: string
  expr_b64?: string
  matched_tier?: string
  reasoning_effort?: string
  image?: boolean
  image_ratio?: number
  image_output?: number
  web_search?: boolean
  web_search_call_count?: number
  web_search_price?: number
  file_search?: boolean
  file_search_call_count?: number
  file_search_price?: number
  tool_surcharges?: ToolSurchargeItem[]
  audio_input_seperate_price?: boolean
  audio_input_token_count?: number
  audio_input_price?: number
  image_generation_call?: boolean
  image_generation_call_price?: number
  image_generation_call_count?: number
  is_system_prompt_overwritten?: boolean
  po?: string[]
  billing_source?: string
  group?: string
  stream_status?: {
    status?: string
    end_reason?: string
    error_count?: number
    end_error?: string
    errors?: string[]
  }
  // Violation fee fields
  violation_fee?: boolean
  violation_fee_code?: string
  violation_fee_marker?: string
  fee_quota?: number
  // Reject / intercept reason (admin)
  reject_reason?: string
  // Task-related fields (for refund logs, type=6)
  is_task?: boolean
  task_id?: string
  reason?: string
  // Subscription billing fields
  subscription_plan_id?: string
  subscription_plan_title?: string
  subscription_id?: string
  subscription_pre_consumed?: number
  subscription_post_delta?: number
  subscription_consumed?: number
  subscription_remain?: number
  subscription_total?: number
  // ACU Router finalization fields. These describe the actual upstream route,
  // which can differ from the New API admission channel and requested model.
  acu_pending_finalize?: boolean
  acu_billing_status?: string
  acu_logical_request_id?: string
  acu_report_idempotency_key?: string
  acu_related_events?: Array<{
    id: number
    type: number
    status?: number
    content: string
    created_at: number
  }>
  actual_provider?: string
  actual_channel?: string
  cached_input_tokens?: number
  reasoning_tokens?: number
  judge_cost_usd?: string
  provider_cost_usd?: string
  failed_billed_cost_usd?: string
  final_user_cost_usd?: string
  nominal_provider_cost_usd?: string
  provider_balance_charge?: string
  provider_balance_currency?: string
  provider_credit_cash_cost_cny?: string
  effective_provider_cash_cost_cny?: string
  judge_cash_cost_cny?: string
  judge_input_tokens?: number
  judge_output_tokens?: number
  judge_official_payg_equivalent_cost?: string
  judge_cost_currency?: string
  judge_cost_status?:
    | 'estimated_blended'
    | 'estimated_upper_bound'
    | 'verified'
    | 'mixed'
    | 'not_applicable'
  judge_cost_source?: string
  judge_provider?: string
  judge_model?: string
  failed_attempt_cash_cost_cny?: string
  actual_total_cash_cost_cny?: string
  user_charge_cny?: string
  counterfactual_quality_ceiling_cost_cny?: string
  acu_cost_breakdown?: AcuCostBreakdown
}

/**
 * Log statistics data
 */
export interface LogStatistics {
  quota: number
  rpm: number
  tpm: number
}

// ============================================================================
// Drawing Logs (MjProxy) Types
// ============================================================================

export interface MidjourneyLog {
  id: number
  user_id: number
  channel_id: number
  code: number
  mj_id: string
  action: string // IMAGINE, UPSCALE, VARIATION, etc. (backend field name)
  submit_time: number // milliseconds
  finish_time?: number // milliseconds
  start_time?: number // milliseconds
  fail_reason?: string
  progress: string
  prompt: string
  prompt_en?: string
  description?: string
  buttons?: string
  properties?: string
  image_url?: string
  status: string // NOT_START, SUBMITTED, IN_PROGRESS, SUCCESS, FAILURE, MODAL
  other?: string
  created_at?: number
  updated_at?: number
}

// ============================================================================
// Task Logs Types
// ============================================================================

export interface TaskLog {
  id: number
  user_id: number
  username?: string
  platform: string // suno, kling, runway, etc.
  task_id: string
  action: string // MUSIC, LYRICS, GENERATE, TEXT_GENERATE, etc.
  channel_id: number
  submit_time: number // seconds
  finish_time?: number // seconds
  progress?: string
  progress_message_en?: string
  data?: string // JSON string
  fail_reason?: string
  status: string // NOT_START, SUBMITTED, IN_PROGRESS, SUCCESS, FAILURE, QUEUED, UNKNOWN
  other?: string
  created_at?: number
  updated_at?: number
}

// ============================================================================
// Common Log Types
// ============================================================================

export interface GetLogsParams {
  p?: number
  page_size?: number
  type?: number
  username?: string
  token_name?: string
  model_name?: string
  start_timestamp?: number
  end_timestamp?: number
  channel?: number
  group?: string
  request_id?: string
  upstream_request_id?: string
}

export interface GetLogsResponse {
  success: boolean
  message?: string
  data?: {
    items: UsageLog[] | MidjourneyLog[] | TaskLog[]
    total: number
    page: number
    page_size: number
  }
}

export interface GetLogStatsParams {
  type?: number
  username?: string
  token_name?: string
  model_name?: string
  start_timestamp?: number
  end_timestamp?: number
  channel?: number
  group?: string
  request_id?: string
  upstream_request_id?: string
}

export interface GetLogStatsResponse {
  success: boolean
  message?: string
  data?: LogStatistics
}

// ============================================================================
// Drawing Log Types
// ============================================================================

export interface GetMidjourneyLogsParams {
  p?: number
  page_size?: number
  channel_id?: string
  mj_id?: string
  start_timestamp?: number
  end_timestamp?: number
}

// ============================================================================
// Task Log Types
// ============================================================================

export interface GetTaskLogsParams {
  p?: number
  page_size?: number
  channel_id?: string
  task_id?: string
  start_timestamp?: number
  end_timestamp?: number
}

// ============================================================================
// Fetch Logs Configuration
// ============================================================================

/**
 * Configuration for fetching logs by category
 */
export interface FetchLogsConfig {
  logCategory: LogCategory
  isAdmin: boolean
  page: number
  pageSize: number
  searchParams: Record<string, unknown>
  columnFilters: Array<{ id: string; value: unknown }>
}

// ============================================================================
// User Info Types
// ============================================================================

export interface UserInfo {
  id: number
  username: string
  display_name?: string
  quota: number
  used_quota: number
  request_count: number
  group?: string
  aff_code?: string
  aff_count?: number
  aff_quota?: number
  remark?: string
}

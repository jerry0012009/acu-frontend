import { api } from '@/lib/api'

import { buildQueryParams } from './lib/query-params'
import type { ACUSessionTrace } from './session-trace-types'
import type {
  GetLogsParams,
  GetLogsResponse,
  GetLogStatsParams,
  GetLogStatsResponse,
  GetMidjourneyLogsParams,
  GetTaskLogsParams,
  UserInfo,
} from './types'

// ============================================================================
// Generic API Helpers
// ============================================================================

function buildApiPath(endpoint: string, isAdmin: boolean): string {
  const normalizedEndpoint = endpoint.replace(/\/+$/, '')
  return isAdmin ? `${normalizedEndpoint}/` : `${normalizedEndpoint}/self`
}

async function fetchLogs<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogsResponse> {
  const paramRecord = params as unknown as Record<string, unknown>
  const queryParams = buildQueryParams({
    p: paramRecord.p || 1,
    page_size: paramRecord.page_size || 20,
    ...params,
  })
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path}?${queryParams}`)
  return res.data
}

async function fetchLogStats<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogStatsResponse> {
  const queryParams = buildQueryParams(
    params as unknown as Record<string, unknown>
  )
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path.replace(/\/+$/, '')}/stat?${queryParams}`)
  return res.data
}

// ============================================================================
// Common Log APIs
// ============================================================================

export const getAllLogs = (params: GetLogsParams = {}) =>
  fetchLogs('/api/log', params, true)

export const getUserLogs = (
  params: Omit<GetLogsParams, 'username' | 'channel'> = {}
) => fetchLogs('/api/log', params, false)

export const getLogStats = (params: GetLogStatsParams = {}) =>
  fetchLogStats('/api/log', params, true)

export const getUserLogStats = (
  params: Omit<GetLogStatsParams, 'username' | 'channel'> = {}
) => fetchLogStats('/api/log', params, false)

export async function getACUSessionTrace(
  identifier: string,
  targetUserId?: number
) {
  const params = new URLSearchParams()
  if (targetUserId != null) params.set('user_id', String(targetUserId))
  const query = params.size ? `?${params.toString()}` : ''
  const res = await api.get(
    `/api/log/self/acu-session-trace/${encodeURIComponent(identifier)}${query}`,
    { skipErrorHandler: true }
  )
  return res.data as {
    success: boolean
    message?: string
    data?: ACUSessionTrace
  }
}

export type ACUWorkTimelineItem = {
  pointId: string
  pointType: 'judge' | 'execution'
  timestamp: number
  sequence: number
  userId?: number
  username?: string
  logicalRequestId: string
  sessionId: string
  taskId: string
  segmentId: string
  judgeCalled: boolean
  judgeReused: boolean
  judgeModel: string
  judgeBackupUsed: boolean
  difficulty: number
  difficultyRecorded: boolean
  difficultySource?: 'recorded' | 'reused_judge' | 'reused_segment'
  requestedModel: string
  actualModel: string
  provider: string
  channel: string
  protocol?: 'responses' | 'messages'
  status: string
  billingStatus: 'finalized' | 'unsettled' | 'pending'
  billingErrorCode?: string
  firstModelEventLatencyMs: number
  endToEndLatencyMs: number
  latencySource: 'reported' | 'unavailable'
  judgeLatencyMs: number
  providerLatencyMs: number
  userChargeCny?: number
  actualCashCostCny?: number
  actualCostCny?: number
  judgeCostCny?: number
  providerCostCny?: number
  failedAttemptCostCny?: number
  failedJudgeAttemptCostCny?: number
  providerUserChargeCny: number
  judgeUserChargeCny: number
  judgeProtocol?: string
  judgeReasoningEffort?: string
  judgeProfileSelection: {
    formulaVersion?: string
    supplyStrategy?: string
    candidateCount: number
    selectedExecutionProfileId?: string
    selectedProfileRank?: number
    selectedProfileUtility?: number
  }
  judgeAttempts: Array<{
    attemptIndex: number
    attemptRole: string
    model: string
    provider: string
    executionProfileId?: string
    channelId?: string
    status: string
    errorCategory?: string
    httpStatus?: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    latencyMs: number
    effectiveCostCny?: number
    costStatus: string
    usageStatus: string
  }>
  errorClass?: string
  cooldownUntil?: string
  workPhase: string
  workPhaseQualityTargetOffset: number
  routingQualityTarget?: number
  qualityComparison?: ACUTimelineQualityComparison
  judgeTrigger: string
  judgeStatus: string
  judgeResultSource: string
  judgeFirstAttemptSucceeded: boolean
  judgeFirstAttemptRecorded?: boolean
  judgeFallbackRecorded?: boolean
  judgeProfileAttemptCount: number
  judgeSameModelFailoverUsed: boolean
  selectedCandidateId: string
  selectedDisplayName: string
  selectedExecutionPresetId?: string
  clientRequestedReasoningEffort?: string
  presetReasoningEffort?: string
  resolvedReasoningEffort?: string
  reasoningMappingStatus?: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheHitRatio: number
  profileAttemptCount: number
  recoveryDecisionReason?: string
  routeRefreshReason?: string
  topCandidates: Array<{
    candidateId: string
    displayName: string
    estimatedQuality: number
    estimatedCallCost?: number
    valueUtility: number
    selected: boolean
  }>
  providerAttempts: Array<{
    attemptIndex: number
    provider: string
    channel: string
    channelId?: string
    channelName?: string
    executionProfileId: string
    model?: string
    protocol?: string
    endpointHost?: string
    status: string
    errorCategory?: string
    httpStatus?: number
    latencyMs: number
    startedAt?: string
    firstModelEventAt?: string
    firstModelEventLatencyMs?: number
    completedAt?: string
    effectiveCostCny?: number
    nominalCostUsd?: number
  }>
}

export type ACUTimelineQualityReference = {
  modelId: string
  displayName: string
  estimatedQuality: number
  officialCostCny: number
}

export type ACUTimelineQualityComparison = {
  estimatedQuality?: number
  qualityDifficulty?: number
  modelChargeCny?: number
  officialModelCostCny?: number
  sameBudget?: ACUTimelineQualityReference
  mostExpensive?: ACUTimelineQualityReference
  qualitySource?: string
  referenceCatalogVersion?: string
}

export type ACUWorkTimeline = {
  from: number
  to: number
  scope?: 'all'
  truncated?: boolean
  itemLimit?: number
  summary: {
    apiSteps: number
    executionSteps: number
    judgeEvaluations: number
    platformRetryCostCny?: number
    judgeFirstAttemptSuccessRate: number
    judgeFirstAttemptSuccessSamples?: number
    judgeCalledRequests?: number
    judgeRulesFallbackRate: number
    judgeRulesFallbackSamples?: number
    completionRate: number
    cacheHitRate: number
    totalUserChargeCny?: number
    totalActualCashCostCny?: number
    unsettledRequests: number
    actualTotalCostCny?: number
    p50FirstModelEventLatencyMs: number
    p95FirstModelEventLatencyMs: number
  }
  items: ACUWorkTimelineItem[]
}

export async function getACUWorkTimeline(
  from: number,
  to: number,
  targetUserId?: number,
  allUsers = false
) {
  const params = new URLSearchParams({
    from: String(from),
    to: String(to),
  })
  if (allUsers) params.set('scope', 'all')
  if (targetUserId != null) params.set('user_id', String(targetUserId))
  const res = await api.get(`/api/log/self/acu-work-timeline?${params}`)
  return res.data as {
    success: boolean
    message?: string
    data?: ACUWorkTimeline
  }
}

export type ACUChannelMonitorProfile = {
  rawCostUtility?: number | null
  rawSpeedUtility?: number | null
  rawReliabilityUtility?: number | null
  scoredProbeLatencyP50Ms?: number | null
  scoredProbeLatencyP90Ms?: number | null
  scoredProbeLatencySampleCount?: number | null
  fullPoolProbeLatencySampleCount?: number | null
  productionReliabilitySamples?: number | null
  productionReliabilitySuccesses?: number | null
  scoredProbeCount?: number | null
  scoredProbeSuccessCount?: number | null
  executionProfileId: string
  canonicalModel: string
  protocol: string[]
  provider: string
  channel: string
  publicNote: string
  endpointHost: string
  multiplier: number
  routingWeight: number
  effectivePriceMultiplier: number | null
  effectiveCostStatus: string
  routingEnabled: boolean
  explicitRoutingEligible?: boolean
  explicitRoutingEligibility?: string
  routingEligible: boolean
  routingEligibility: string
  state: string
  channelState: string
  profileState: string
  profileStateRaw: string
  channelStateRaw: string
  providerStateRaw: string
  probeStateRaw: string
  effectiveState: string
  blockingScope: string
  statusReason: string
  usageTrusted: boolean
  recentSuccessRate: number
  requestCount: number
  successCount: number
  errorCount: number
  judgeAttemptCount: number
  judgeSuccessCount: number
  firstEventSampleCount: number
  consecutiveFailures: number
  p50FirstModelEventLatencyMs: number
  p95FirstModelEventLatencyMs: number
  lastError: string
  lastSuccessAt: string
  cooldownUntil: string
  requiresFreshProbe: boolean
  lastProbeAt: string
  probeStatus: string
  probeLatencyMs: number
  probeCostCny: number
  nextRoutingEligibleAt: string
  probeFreshness: string
  probeDailySpendCny: number
  probeSuccessRate: number | null
  fullPoolProbeCount: number
  fullPoolProbeSuccessCount: number
  fullPoolProbeLatencyP50Ms: number
  fullPoolProbeLatencyP90Ms: number
  targetedProbeCount: number
  targetedProbeSuccessCount: number
  latestSuccessfulProbeAt: string | null
  latestFullPoolProbeAt: string | null
  latestTargetedProbeAt: string | null
  healthEvents: Array<{
    source:
      | 'production'
      | 'judge'
      | 'full_pool_probe'
      | 'targeted_probe'
      | 'historical_probe'
    result: 'success' | 'failed' | 'cooldown' | 'recovered'
    at: string
  }>
  supportedReasoningEfforts?: string[]
  reasoningControlMode?: string
  profileUtility: number | null
  profilePreferenceScore?: number | null
  profilePreferenceMultiplier?: number | null
  profileRank: number | null
  profileCandidateCount: number | null
  profileCost: number | null
  profileLatencyMs: number | null
  costUtility: number | null
  speedUtility: number | null
  reliabilityUtility: number | null
  costContribution: number | null
  speedContribution: number | null
  reliabilityContribution: number | null
  metricSource: string | null
  formulaVersion: string | null
  latestProbe?: ACUProbeHistoryRow
  probeBuckets?: ACUProbeBucket[]
}

export type ACUModelPoolEntry = {
  modelId: string
  vendor: string
  modelCategory: 'text_agent' | 'image' | 'audio' | 'realtime' | 'unsupported'
  capabilityTier: 'LUNA' | 'TERRA' | 'SOL' | 'FRONTIER'
  protocols: string[]
  verificationStatus:
    | 'discovered'
    | 'verified_provisional'
    | 'verified'
    | 'rejected'
  activeProfileCount: number
  healthyProfileCount: number
  independentProviderCount: number
  currentBestChannel: string | null
  currentMultiplier: number | null
  backupChannel: string | null
  autoRouteEnabled?: boolean
  routingEnabled?: boolean
  exclusionReason: string | null
  profiles: ACUChannelMonitorProfile[]
  routingCandidates?: Array<{
    candidateId: string
    modelId: string
    displayName: string
    kind: 'base' | 'preset'
    presetId?: string
    reasoningEffort?: string
    calibrationStatus?: string
    protocols: Array<'responses' | 'messages' | 'chat_completions'>
    responsesProfileCount: number
    messagesProfileCount: number
  }>
}

export type ACUTokenReferencePrices = {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  cachedInputUsdPerMillion?: number
  cacheWriteUsdPerMillion?: number
}

export type ACURoutingCatalog = {
  catalogVersion?: string
  models: Array<{
    modelId: string
    displayName?: string
    vendor: string
    modelCategory: 'text_agent'
    capabilityTier: 'LUNA' | 'TERRA' | 'SOL' | 'FRONTIER'
    protocols: string[]
    verificationStatus:
      | 'discovered'
      | 'verified_provisional'
      | 'verified'
      | 'rejected'
    autoRouteEnabled: boolean
    routingCandidates: Array<{
      candidateId: string
      modelId: string
      displayName: string
      kind: 'base' | 'preset'
      presetId?: string
      reasoningEffort?: string
      calibrationStatus?: string
      protocols: Array<'responses' | 'messages' | 'chat_completions'>
    }>
    curve?: Array<{
      difficultyScore: number
      estimatedQuality: number
    }>
    referencePricing?: {
      inputUsdPerMillion?: number
      outputUsdPerMillion?: number
      cachedInputUsdPerMillion?: number
      cacheWriteUsdPerMillion?: number
      contextTiers?: {
        thresholdTokens: number
        standard: ACUTokenReferencePrices
        longContext: ACUTokenReferencePrices
      }
    }
  }>
  profiles: Array<{
    executionProfileId: string
    canonicalModel: string
    protocol: string[]
    autoRouteEnabled: boolean
    supportedReasoningEfforts?: string[]
  }>
  defaultCandidatePreferenceScores: Record<string, number>
}

export async function getACURoutingCatalog() {
  const res = await api.get('/api/user/self/acu-routing-catalog')
  return res.data as {
    success: boolean
    message?: string
    data?: ACURoutingCatalog
  }
}

export type ACUChannelHistoryRow = {
  bucket: string
  scope_type: 'channel' | 'channel_model' | 'profile'
  scope_id: string
  execution_profile_id: string | null
  canonical_model: string | null
  provider: string
  channel: string
  request_count: number
  success_count: number
  error_count: number
  rate_limited_count: number
  server_error_count: number
  watchdog_count: number
  recovery_count: number
  p50_first_model_event_ms: number | null
  p95_first_model_event_ms: number | null
}

export type ACUChannelCooldownInterval = {
  channel: string
  provider: string | null
  execution_profile_id: string | null
  started_at: string
  ended_at: string
  reason: string
  error_class: string | null
  manual_pause: boolean
  half_open_probe: boolean
  probe_result: string | null
}

export type ACUProbeHistoryRow = {
  execution_profile_id: string
  channel_id: string
  provider_id: string
  canonical_model_id: string
  protocol: string
  status: string
  http_status: number | null
  error_class: string | null
  latency_ms: number | null
  input_tokens: number
  output_tokens: number
  actual_model: string | null
  usage_trusted: boolean
  cost_cny: number
  started_at: string
  completed_at: string | null
  metadata_json?: Record<string, unknown>
  probeMode: 'full_pool' | 'historical' | 'targeted'
  trigger: string
}

export type ACUProbeBucket = {
  bucket: string
  fullPoolCount: number
  targetedCount: number
  historicalCount: number
  successCount: number
  totalCount: number
  latestProbe?: ACUProbeHistoryRow
}

export type ACUMonitorRange = '1h' | '6h' | '24h' | '7d'
export type ACUProbeTimelineRange = '24h' | '48h' | '7d'
export type ACUSupplyStrategy =
  | 'balanced'
  | 'lowest_cost'
  | 'low_latency'
  | 'high_reliability'
export type ACUMonitorScenario = 'small' | 'standard' | 'long'

export type ACUChannelMonitor = {
  range: string
  supplyStrategy: ACUSupplyStrategy
  scenario: ACUMonitorScenario
  protocol: 'all' | 'responses' | 'messages' | 'chat_completions'
  generatedAt: string
  profiles: ACUChannelMonitorProfile[]
  history: ACUChannelHistoryRow[]
  cooldownIntervals: ACUChannelCooldownInterval[]
  probeHistory: ACUProbeHistoryRow[]
  supplyInventory: Array<Record<string, unknown>>
  modelPool: ACUModelPoolEntry[]
  defaultCandidatePreferenceScores: Record<string, number>
}

export type ACUExecutionProfile = {
  executionProfileId: string
  modelId: string
  providerModelId?: string
  actualModelAliases?: string[]
  provider: string
  channel: string
  channelId?: string
  routingGroupName?: string
  inputTokenAccountingMode?: 'includes_cached' | 'excludes_cached'
  protocols: Array<'responses' | 'messages' | 'chat_completions'>
  baseUrl?: string
  apiKeyConfigured?: boolean
  routingEnabled?: boolean
  authMode: 'bearer' | 'x-api-key'
  anthropicVersion?: string
  stripV1Path?: boolean
  economicsProviderId?: string
  observedBillingMultiplier?: number
  routingWeight?: number
  effectiveCostStatus?: 'verified' | 'estimated' | 'missing'
  billingPrice?: {
    inputPricePerMillion: number
    outputPricePerMillion: number
    cachedInputPricePerMillion?: number
    cacheWritePricePerMillion?: number
    currency: 'USD_CREDIT'
    source: string
    observedAt: string
    status: 'verified' | 'estimated'
  }
  toolCallSupport?: boolean
  supportedToolTypes?: string[]
  thinkingSupport?: boolean
  supportedReasoningEfforts?: string[]
  reasoningControlMode?: string
  contextWindow?: number
  canonicalAdvertisedContextWindow?: number
  modelVendor?: string
  modelCategory?: 'text_agent' | 'image' | 'audio' | 'realtime' | 'unsupported'
  capabilityTier?: 'LUNA' | 'TERRA' | 'SOL' | 'FRONTIER'
}

export type ACUExecutionProfilesResponse = {
  providerEconomics?: Array<{
    providerId: string
    balanceCurrency?: string
    rechargeCashCny: number | null
    creditsReceivedUsd: number | null
    creditsPerCny: number | null
    observedBillingMultiplier: number
    effectiveCostStatus?: string
  }>
  retailMarkupMultiplier?: number
  profiles: ACUExecutionProfile[]
  channels?: Record<
    string,
    { baseUrl: string; fallbackBaseUrls: string[]; apiKeyConfigured: boolean }
  >
  profileCount: number
  runningCommit: string
}

function requireACUSuccess<T extends { success: boolean; message?: string }>(
  response: T
): T {
  if (response.success === false) {
    throw new Error(response.message || 'ACU request failed')
  }
  return response
}

export type ACUExecutionProfileProbeResult = {
  probeAttemptId: string
  startedAt: string
  completedAt: string
  executionProfileId: string
  provider: string
  channel: string
  requestedModel: string
  actualModel: string | null
  protocol: string
  httpStatus: number | null
  success: boolean
  errorClass: string
  latencyMs: number | null
  firstEventLatencyMs: number | null
  inputTokens: string
  cachedInputTokens: string
  cacheCreationInputTokens: string
  outputTokens: string
  reasoningTokens: string
  inputTokenAccountingMode: 'includes_cached' | 'excludes_cached'
  usageTrusted: boolean
  costCny: number
  costBreakdown: Record<string, unknown>
  rawUsage: Record<string, unknown> | null
  providerRequestId: string | null
  errorDetail?: string
  savedConfigurationChanged: boolean
  productionRoutingChanged: boolean
}

export type ACUVeridropResult = {
  supported: boolean
  status: 'done' | 'unsupported'
  protocol: string
  mode?: 'quick' | 'standard' | 'full'
  requestedModel?: string
  targetModel?: string | null
  actualModel?: string | null
  verdict?: string
  score?: number | null
  detectors?: Array<Record<string, unknown>>
  performance?: Record<string, unknown>
  selfReportedIdentity?: string | null
  detectedBrands?: string[]
  summary?: string | null
  sample?: string
  completedAt?: string
  reason?: string
  routingImpact: 'none'
}

export type ACUGpttesticuResult = {
  supported: boolean
  status: 'done' | 'unsupported'
  protocol: string
  mode?: 'quick' | 'standard' | 'full'
  requestedModel?: string
  targetModel?: string | null
  actualModel?: string | null
  verdict?: string
  score?: number | null
  detectors?: Array<Record<string, unknown>>
  performance?: Record<string, unknown>
  sample?: string
  summary?: string | null
  completedAt?: string
  reason?: string
  routingImpact: 'none'
  billingMode?: 'user_token' | 'platform'
  ownerLabel?: 'me' | 'other'
  historyId?: number
  executionProfileId?: string
  createdAt?: string
  durationMs?: number
}

export type ACUQuickAddConnection = {
  providerName?: string
  baseUrl: string
  apiKey: string
  creditsPerCny: number
  defaultBillingMultiplier: number
}

export type ACUQuickAddDiscoveredModel = {
  providerModelId: string
  catalogKnown: boolean
  catalog?: {
    modelId: string
    displayName: string
    vendor: string
    inputPricePerMillion: number | null
    outputPricePerMillion: number | null
    cachedInputPricePerMillion: number | null
    cacheWritePricePerMillion: number | null
    contextWindow: number | null
    toolCallSupport: boolean
  }
}

export type ACUQuickAddDiscovery = {
  normalizedBaseUrl: string
  modelDirectoryUrl: string
  authMode: 'bearer' | 'x-api-key' | null
  httpStatus: number | null
  directoryAvailable: boolean
  authFailed: boolean
  providerId: string
  channelId: string
  routingGroupName: string
  connectionFingerprint: string
  existingProviderEconomics?: {
    creditsPerCny: number
    defaultBillingMultiplier: number
    displayName?: string
  }
  models: ACUQuickAddDiscoveredModel[]
  existingProfiles: Array<{
    executionProfileId: string
    modelId: string
    providerModelId: string
    protocols: Array<'responses' | 'messages' | 'chat_completions'>
  }>
  message?: string
}

export type ACUGlobalRoutingPolicy = {
  modelPolicy: 'all_routing_eligible' | 'custom_allowlist' | 'explicit_only'
  allowedModelIds: string[]
  modelAccess?: Record<string, 'disabled' | 'explicit' | 'auto'>
}

export async function getACUGlobalRoutingPolicy(): Promise<ACUGlobalRoutingPolicy> {
  const res = await api.get('/api/option/acu-routing-policy')
  return requireACUSuccess(res.data).data
}

export async function updateACUGlobalRoutingPolicy(
  policy: ACUGlobalRoutingPolicy
) {
  const res = await api.put('/api/option/acu-routing-policy', policy)
  return requireACUSuccess(res.data)
}

export async function updateACUGlobalProfileRouting(
  executionProfileId: string,
  enabled: boolean
) {
  const res = await api.put('/api/option/acu-routing-policy/profile', {
    executionProfileId,
    enabled,
  })
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUGlobalRoutingPolicy
    }
  )
}

export type ACURoutingUtilityConfig = {
  schemaVersion: 'acu-routing-utility-config-v1'
  qualityPresets: Record<'economy' | 'balanced' | 'quality', number>
  acuHighBiasOffset: number
  modelCostLogScale: number
  supplyPresets: Record<
    'lowest_cost' | 'balanced' | 'low_latency' | 'high_reliability',
    { cost: number; speed: number; reliability: number }
  >
  profileCostLogScale: number
  profileSpeedLogScale: number
  latency: {
    windowHours: number
    longContextThresholdTokens: number
    minimumSamples: number
    unknownLatencyMultiplier: number
  }
  reliability: {
    windowHours: number
    minimumSamples: number
    unknownDefault: number
    degradedMultiplier: number
  }
  workPhaseBiasOffsets: Record<
    | 'inspection'
    | 'general'
    | 'implementation'
    | 'verification'
    | 'planning'
    | 'recovery',
    number
  >
  defaultCandidatePreferenceScores: Record<string, number>
}

export async function getACURoutingUtilityConfig(): Promise<ACURoutingUtilityConfig> {
  const res = await api.get('/api/option/acu-routing-utility-config')
  return res.data.data
}

export async function updateACURoutingUtilityConfig(
  config: ACURoutingUtilityConfig
) {
  const res = await api.put('/api/option/acu-routing-utility-config', config)
  return res.data
}

export async function getACUChannelMonitor(
  range: ACUMonitorRange,
  supplyStrategy: ACUSupplyStrategy = 'balanced',
  scenario: ACUMonitorScenario = 'standard',
  probeRange: ACUProbeTimelineRange = '48h',
  protocol: 'all' | 'responses' | 'messages' | 'chat_completions' = 'responses'
) {
  const params = new URLSearchParams({
    range,
    supplyStrategy,
    scenario,
    probeRange,
    protocol,
  })
  const res = await api.get(`/api/log/acu-channel-monitor?${params.toString()}`)
  return res.data as {
    success: boolean
    message?: string
    data?: ACUChannelMonitor
  }
}

export async function pauseACUChannel(
  channelId: string,
  durationMinutes: 30 | 120
) {
  const res = await api.post('/api/log/acu-channel-monitor/pause', {
    channelId,
    durationMinutes,
  })
  return res.data as {
    success: boolean
    message?: string
    data?: { channelId: string; state: string; cooldownUntil: string }
  }
}

export type ACUTokenProfileRoutingScope = {
  tokenId: number
  custom: boolean
  globalProfileIds: string[]
  configuredProfileIds: string[]
  effectiveProfileIds: string[]
  globalWeights?: Record<string, number>
  configuredWeights?: Record<string, number>
  effectiveWeights?: Record<string, number>
}

export async function getACUTokenProfileRouting(tokenId: number) {
  const res = await api.get(`/api/token/${tokenId}/acu-profile-routing`)
  const response = res.data as {
    success: boolean
    message?: string
    data?: ACUTokenProfileRoutingScope
  }
  if (!response.success || !response.data) {
    throw new Error(response.message || 'Failed to load API key routing')
  }
  return response
}

export async function updateACUTokenProfileRouting(
  tokenId: number,
  executionProfileId: string,
  update: { enabled?: boolean; weight?: number; inheritWeight?: boolean }
) {
  const res = await api.put(`/api/token/${tokenId}/acu-profile-routing`, {
    executionProfileId,
    ...update,
  })
  const response = res.data as {
    success: boolean
    message?: string
    data?: ACUTokenProfileRoutingScope
  }
  if (!response.success || !response.data) {
    throw new Error(response.message || 'Failed to update API key routing')
  }
  return response
}

export async function updateACUProfilePublicNote(
  executionProfileId: string,
  note: string
) {
  const res = await api.put('/api/log/acu-channel-monitor/profile-note', {
    executionProfileId,
    note,
  })
  const response = res.data as {
    success: boolean
    message?: string
    data?: { executionProfileId: string; note: string }
  }
  if (!response.success || !response.data) {
    throw new Error(response.message || 'Failed to update Profile note')
  }
  return response
}

export async function getACUExecutionProfiles() {
  const res = await api.get('/api/log/acu-execution-profiles')
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUExecutionProfilesResponse
    }
  )
}

export async function createACUExecutionProfile(profile: ACUExecutionProfile) {
  const res = await api.post('/api/log/acu-execution-profiles', { profile })
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: Record<string, unknown>
    }
  )
}

export async function updateACUExecutionProfile(
  id: string,
  profile: ACUExecutionProfile
) {
  const res = await api.put(
    `/api/log/acu-execution-profiles/${encodeURIComponent(id)}`,
    { profile }
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: Record<string, unknown>
    }
  )
}

export async function updateACUChannelConnection(
  id: string,
  input: { baseUrl?: string; fallbackBaseUrls?: string[]; apiKey?: string }
) {
  const res = await api.patch(
    `/api/log/acu-execution-profiles/channels/${encodeURIComponent(id)}`,
    input
  )
  return requireACUSuccess(res.data as { success: boolean; message?: string })
}

export async function probeACUExecutionProfile(
  profile: ACUExecutionProfile,
  protocol: ACUExecutionProfile['protocols'][number]
) {
  const res = await api.post('/api/log/acu-execution-profiles/probe', {
    profile,
    protocol,
  })
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUExecutionProfileProbeResult
    }
  )
}

export async function probeACUExecutionProfileById(
  executionProfileId: string,
  protocol: ACUExecutionProfile['protocols'][number]
) {
  const res = await api.post('/api/log/acu-execution-profiles/probe', {
    executionProfileId,
    protocol,
  })
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUExecutionProfileProbeResult
    }
  )
}

export async function reconcileACUExecutionProfileCalibration(
  executionProfileId: string,
  input: {
    observedBillingMultiplier?: number
    creditsPerCny?: number
    routingWeight?: number
  }
) {
  const res = await api.patch(
    `/api/log/acu-execution-profiles/${encodeURIComponent(executionProfileId)}/calibration`,
    input
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: {
        status: string
        changed: {
          observedBillingMultiplier: boolean
          creditsPerCny: boolean
          routingWeight: boolean
        }
        executionProfileId: string
        economicsProviderId: string
        previousProfile?: ACUExecutionProfile
        profile?: ACUExecutionProfile
      }
    }
  )
}

export async function quickAddACUProviderDiscover(
  connection: ACUQuickAddConnection
) {
  const res = await api.post(
    '/api/log/acu-execution-profiles/quick-add/discover',
    connection
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUQuickAddDiscovery
    }
  )
}

export async function quickAddACUProviderProbe(input: {
  connection: ACUQuickAddConnection
  authMode: 'bearer' | 'x-api-key'
  model: {
    providerModelId: string
    modelId?: string
    billingPrice?: Record<string, number>
    observedBillingMultiplier?: number
  }
  protocol: 'responses' | 'messages' | 'chat_completions'
}) {
  const res = await api.post(
    '/api/log/acu-execution-profiles/quick-add/probe',
    input
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUExecutionProfileProbeResult & {
        profile?: Record<string, unknown>
        profileProbeIdentityDigest?: string
      }
    }
  )
}

export async function quickAddACUProviderSave(input: {
  connection: ACUQuickAddConnection
  authMode: 'bearer' | 'x-api-key'
  models: Array<{
    providerModelId: string
    modelId?: string
    protocols: Array<'responses' | 'messages' | 'chat_completions'>
    billingPrice?: Record<string, number>
    observedBillingMultiplier?: number
    routingEnabled?: boolean
  }>
}) {
  const res = await api.post(
    '/api/log/acu-execution-profiles/quick-add/save',
    input
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: {
        status: string
        created: string[]
        skippedDuplicates: string[]
        createdCount: number
        skippedDuplicateCount: number
      }
    }
  )
}

export async function runACUProfileVeridrop(
  executionProfileId: string,
  protocol: ACUExecutionProfile['protocols'][number]
) {
  const res = await api.post('/api/log/acu-channel-monitor/veridrop', {
    executionProfileId,
    protocol,
  })
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUVeridropResult
    }
  )
}

export async function runACUProfileGpttesticu(
  executionProfileId: string,
  tokenId?: number
) {
  const res = await api.post('/api/log/acu-channel-monitor/gpttesticu', {
    executionProfileId,
    ...(tokenId != null ? { tokenId } : {}),
  })
  const started = requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: { jobId: string; status: 'running' }
    }
  )
  const jobId = started.data?.jobId
  if (!jobId) throw new Error('gpttesticu did not return a job id')
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const statusResponse = await api.get(
      `/api/log/acu-channel-monitor/gpttesticu/${encodeURIComponent(jobId)}`
    )
    const status = requireACUSuccess(
      statusResponse.data as {
        success: boolean
        message?: string
        data?: {
          status: 'running' | 'done' | 'error'
          result?: ACUGpttesticuResult
          error?: string
        }
      }
    )
    if (status.data?.status === 'done' && status.data.result) {
      return {
        success: true,
        message: '',
        data: status.data.result,
      }
    }
    if (status.data?.status === 'error') {
      throw new Error(status.data.error || 'gpttesticu check failed')
    }
  }
  throw new Error('gpttesticu check timed out')
}

export async function getACUProfileGpttesticuHistory(
  executionProfileId: string
) {
  const res = await api.get(
    `/api/log/acu-channel-monitor/gpttesticu/history/${encodeURIComponent(
      executionProfileId
    )}`
  )
  return requireACUSuccess(
    res.data as {
      success: boolean
      message?: string
      data?: ACUGpttesticuResult[]
    }
  )
}

export async function getUserInfo(
  userId: number
): Promise<{ success: boolean; message?: string; data?: UserInfo }> {
  const res = await api.get(`/api/user/${userId}`)
  return res.data
}

// ============================================================================
// MjProxy (Drawing) Logs API
// ============================================================================

export const getAllMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, true)

export const getUserMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, false)

// ============================================================================
// Task Logs API
// ============================================================================

export const getAllTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, true)

export const getUserTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, false)

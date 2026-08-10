export interface ACUSessionTrace {
  session: {
    sessionId: string
    status: string
    startedAt: string
    lastActivityAt: string
  }
  task: { taskId: string; goalSummary: string; status: string }
  segments: ACUSessionTraceSegment[]
}

export interface ACUSessionTraceSegment {
  segmentId: string
  previousSegmentId?: string
  creationReason: string
  phase: string
  status: string
  startedAt: string
  completedAt?: string
  judgeStatusReason?: string
  workPhase?: string
  workPhaseQualityTargetOffset?: number
  judge?: {
    trigger: string
    judgeCalls: number
    judgeReused: boolean
    reusedJudgeEvaluationId?: string
    routeRefreshReason?: string
    evaluationId?: string
    model?: string
    provider?: string
    status: string
    resultSource?: string
    difficulty: number
    confidence: number
    explanation: string
    inputTokens: number
    outputTokens: number
    latencyMs: number
    attempts: Array<{
      role: string
      model: string
      provider: string
      status: string
      errorCategory?: string
      httpStatus?: number
      latencyMs: number
      backupReason?: string
    }>
  }
  route?: {
    routeDecisionId: string
    requestedModel: string
    selectedCanonicalModel: string
    selectedProvider: string
    selectedChannel: string
    modelSelectionReason: string
    channelSelectionReason: string
    candidateCount: number
    paretoFrontier: string[]
    selectedCandidateId?: string
    selectedDisplayName?: string
    selectedExecutionPresetId?: string
    clientRequestedReasoningEffort?: string
    presetReasoningEffort?: string
    targetCanonicalReasoningEffort?: string
    resolvedReasoningEffort?: string
    reasoningMappingStatus?: string
    effectiveQualityTarget?: number
    topCandidates?: Array<{
      candidateId: string
      displayName: string
      estimatedQuality: number
      estimatedCallCost?: number
      valueUtility: number
      selected: boolean
    }>
  }
  logicalRequests: Array<{
    logicalRequestId: string
    newApiLogId: string
    requestId: string
    requestedModel: string
    actualModel?: string
    status: string
    startedAt: string
    completedAt?: string
    totalLatencyMs: number
    firstTokenLatencyMs: number | null
    visibleOutputBytes: number
    userChargeCny?: number
    actualCashCostCny?: number
    actualCostCny?: number
    deliveryStatus?: string
    errorDiagnosis?: {
      errorSource: string
      endpoint: string
      cfRay?: string
      firstByteReceived: boolean
      visibleBytes: number
      recoveryEligible: boolean
      recoveryExecuted: boolean
      recoveryReason?: string
    }
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
  }>
  providerAttempts: Array<{
    attemptIndex: number
    model: string
    provider: string
    channel: string
    endpoint: string
    status: string
    httpStatus?: number
    errorCategory?: string
    startedAt: string
    completedAt?: string
    latencyMs: number
    firstTokenLatencyMs: number | null
    visibleOutputBytes: number
    recoveryReason?: string
  }>
}

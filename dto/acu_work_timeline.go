package dto

type ACUWorkTimeline struct {
	From    int64                  `json:"from"`
	To      int64                  `json:"to"`
	Summary ACUWorkTimelineSummary `json:"summary"`
	Items   []ACUWorkTimelineItem  `json:"items"`
}

type ACUWorkTimelineSummary struct {
	APISteps                        int     `json:"apiSteps"`
	ExecutionSteps                  int     `json:"executionSteps"`
	JudgeEvaluations                int     `json:"judgeEvaluations"`
	PlatformRetryCostCNY            float64 `json:"platformRetryCostCny,omitempty"`
	JudgeFirstAttemptSuccessRate    float64 `json:"judgeFirstAttemptSuccessRate"`
	JudgeFirstAttemptSuccessSamples int     `json:"judgeFirstAttemptSuccessSamples"`
	JudgeCalledRequests             int     `json:"judgeCalledRequests"`
	JudgeRulesFallbackRate          float64 `json:"judgeRulesFallbackRate"`
	JudgeRulesFallbackSamples       int     `json:"judgeRulesFallbackSamples"`
	CompletionRate                  float64 `json:"completionRate"`
	CacheHitRate                    float64 `json:"cacheHitRate"`
	TotalUserChargeCNY              float64 `json:"totalUserChargeCny"`
	TotalActualCashCostCNY          float64 `json:"totalActualCashCostCny,omitempty"`
	UnsettledRequests               int     `json:"unsettledRequests"`
	// ActualTotalCostCNY is retained for clients that have not migrated yet.
	// It means total user charge, with actual cash cost as the legacy fallback.
	ActualTotalCostCNY          float64 `json:"actualTotalCostCny,omitempty"`
	P50FirstModelEventLatencyMs int     `json:"p50FirstModelEventLatencyMs"`
	P95FirstModelEventLatencyMs int     `json:"p95FirstModelEventLatencyMs"`
}

type ACUWorkTimelineItem struct {
	PointID                  string   `json:"pointId"`
	PointType                string   `json:"pointType"`
	Timestamp                int64    `json:"timestamp"`
	Sequence                 int      `json:"sequence"`
	LogicalRequestID         string   `json:"logicalRequestId"`
	SessionID                string   `json:"sessionId"`
	TaskID                   string   `json:"taskId"`
	SegmentID                string   `json:"segmentId"`
	JudgeCalled              bool     `json:"judgeCalled"`
	JudgeReused              bool     `json:"judgeReused"`
	JudgeModel               string   `json:"judgeModel"`
	JudgeBackupUsed          bool     `json:"judgeBackupUsed"`
	Difficulty               float64  `json:"difficulty"`
	DifficultyRecorded       bool     `json:"difficultyRecorded"`
	RequestedModel           string   `json:"requestedModel"`
	ActualModel              string   `json:"actualModel"`
	Provider                 string   `json:"provider"`
	Channel                  string   `json:"channel"`
	Protocol                 string   `json:"protocol,omitempty"`
	Status                   string   `json:"status"`
	BillingStatus            string   `json:"billingStatus"`
	BillingErrorCode         string   `json:"billingErrorCode,omitempty"`
	FirstModelEventLatencyMs int      `json:"firstModelEventLatencyMs"`
	EndToEndLatencyMs        int      `json:"endToEndLatencyMs"`
	LatencySource            string   `json:"latencySource"`
	JudgeLatencyMs           int      `json:"judgeLatencyMs"`
	ProviderLatencyMs        int      `json:"providerLatencyMs"`
	UserChargeCNY            *float64 `json:"userChargeCny,omitempty"`
	ActualCashCostCNY        *float64 `json:"actualCashCostCny,omitempty"`
	// ActualCostCNY is retained for compatibility and means user charge,
	// falling back to actual cash cost for legacy records.
	ActualCostCNY                  float64                       `json:"actualCostCny,omitempty"`
	JudgeCostCNY                   float64                       `json:"judgeCostCny,omitempty"`
	ProviderCostCNY                float64                       `json:"providerCostCny,omitempty"`
	FailedAttemptCostCNY           float64                       `json:"failedAttemptCostCny,omitempty"`
	FailedJudgeAttemptCostCNY      float64                       `json:"failedJudgeAttemptCostCny,omitempty"`
	ProviderUserChargeCNY          float64                       `json:"providerUserChargeCny"`
	JudgeUserChargeCNY             float64                       `json:"judgeUserChargeCny"`
	JudgeProtocol                  string                        `json:"judgeProtocol,omitempty"`
	JudgeReasoningEffort           string                        `json:"judgeReasoningEffort,omitempty"`
	JudgeProfileSelection          ACUJudgeProfileSelection      `json:"judgeProfileSelection"`
	JudgeAttempts                  []ACUTimelineJudgeAttempt     `json:"judgeAttempts"`
	ErrorClass                     string                        `json:"errorClass,omitempty"`
	CooldownUntil                  string                        `json:"cooldownUntil,omitempty"`
	WorkPhase                      string                        `json:"workPhase"`
	WorkPhaseQualityTargetOffset   float64                       `json:"workPhaseQualityTargetOffset"`
	RoutingQualityTarget           *float64                      `json:"routingQualityTarget,omitempty"`
	JudgeTrigger                   string                        `json:"judgeTrigger"`
	JudgeStatus                    string                        `json:"judgeStatus"`
	JudgeResultSource              string                        `json:"judgeResultSource"`
	JudgeFirstAttemptSucceeded     bool                          `json:"judgeFirstAttemptSucceeded"`
	JudgeFirstAttemptRecorded      bool                          `json:"judgeFirstAttemptRecorded"`
	JudgeFallbackRecorded          bool                          `json:"judgeFallbackRecorded"`
	JudgeProfileAttemptCount       int                           `json:"judgeProfileAttemptCount"`
	JudgeSameModelFailoverUsed     bool                          `json:"judgeSameModelFailoverUsed"`
	SelectedCandidateID            string                        `json:"selectedCandidateId"`
	SelectedDisplayName            string                        `json:"selectedDisplayName"`
	SelectedExecutionPresetID      string                        `json:"selectedExecutionPresetId,omitempty"`
	ClientRequestedReasoningEffort string                        `json:"clientRequestedReasoningEffort,omitempty"`
	PresetReasoningEffort          string                        `json:"presetReasoningEffort,omitempty"`
	ResolvedReasoningEffort        string                        `json:"resolvedReasoningEffort,omitempty"`
	ReasoningMappingStatus         string                        `json:"reasoningMappingStatus,omitempty"`
	InputTokens                    int64                         `json:"inputTokens"`
	CachedInputTokens              int64                         `json:"cachedInputTokens"`
	OutputTokens                   int64                         `json:"outputTokens"`
	ReasoningTokens                int64                         `json:"reasoningTokens"`
	CacheHitRatio                  float64                       `json:"cacheHitRatio"`
	ProfileAttemptCount            int                           `json:"profileAttemptCount"`
	RecoveryDecisionReason         string                        `json:"recoveryDecisionReason,omitempty"`
	RouteRefreshReason             string                        `json:"routeRefreshReason,omitempty"`
	TopCandidates                  []ACUTimelineCandidateSummary `json:"topCandidates"`
	ProviderAttempts               []ACUTimelineProviderAttempt  `json:"providerAttempts"`
}

type ACUJudgeProfileSelection struct {
	FormulaVersion             string  `json:"formulaVersion,omitempty"`
	SupplyStrategy             string  `json:"supplyStrategy,omitempty"`
	CandidateCount             int     `json:"candidateCount"`
	SelectedExecutionProfileID string  `json:"selectedExecutionProfileId,omitempty"`
	SelectedProfileRank        int     `json:"selectedProfileRank,omitempty"`
	SelectedProfileUtility     float64 `json:"selectedProfileUtility,omitempty"`
}

type ACUTimelineJudgeAttempt struct {
	AttemptIndex       int     `json:"attemptIndex"`
	AttemptRole        string  `json:"attemptRole"`
	Model              string  `json:"model"`
	Provider           string  `json:"provider"`
	ExecutionProfileID string  `json:"executionProfileId,omitempty"`
	ChannelID          string  `json:"channelId,omitempty"`
	Status             string  `json:"status"`
	ErrorCategory      string  `json:"errorCategory,omitempty"`
	HTTPStatus         int     `json:"httpStatus,omitempty"`
	InputTokens        int64   `json:"inputTokens"`
	CachedInputTokens  int64   `json:"cachedInputTokens"`
	OutputTokens       int64   `json:"outputTokens"`
	LatencyMs          int     `json:"latencyMs"`
	EffectiveCostCNY   float64 `json:"effectiveCostCny,omitempty"`
	CostStatus         string  `json:"costStatus"`
	UsageStatus        string  `json:"usageStatus"`
}

type ACUTimelineCandidateSummary struct {
	CandidateID       string  `json:"candidateId"`
	DisplayName       string  `json:"displayName"`
	EstimatedQuality  float64 `json:"estimatedQuality"`
	EstimatedCallCost float64 `json:"estimatedCallCost,omitempty"`
	ValueUtility      float64 `json:"valueUtility"`
	Selected          bool    `json:"selected"`
}

type ACUTimelineProviderAttempt struct {
	AttemptIndex       int    `json:"attemptIndex"`
	Provider           string `json:"provider"`
	Channel            string `json:"channel"`
	ExecutionProfileID string `json:"executionProfileId"`
	Status             string `json:"status"`
	ErrorCategory      string `json:"errorCategory,omitempty"`
	HTTPStatus         int    `json:"httpStatus,omitempty"`
	LatencyMs          int    `json:"latencyMs"`
}

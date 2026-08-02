package dto

type ACUWorkTimeline struct {
	From    int64                  `json:"from"`
	To      int64                  `json:"to"`
	Summary ACUWorkTimelineSummary `json:"summary"`
	Items   []ACUWorkTimelineItem  `json:"items"`
}

type ACUWorkTimelineSummary struct {
	APISteps                     int     `json:"apiSteps"`
	JudgeFirstAttemptSuccessRate float64 `json:"judgeFirstAttemptSuccessRate"`
	JudgeRulesFallbackRate       float64 `json:"judgeRulesFallbackRate"`
	CompletionRate               float64 `json:"completionRate"`
	CacheHitRate                 float64 `json:"cacheHitRate"`
	ActualTotalCostCNY           float64 `json:"actualTotalCostCny"`
	P50FirstModelEventLatencyMs  int     `json:"p50FirstModelEventLatencyMs"`
	P95FirstModelEventLatencyMs  int     `json:"p95FirstModelEventLatencyMs"`
}

type ACUWorkTimelineItem struct {
	Timestamp                      int64                         `json:"timestamp"`
	Sequence                       int                           `json:"sequence"`
	LogicalRequestID               string                        `json:"logicalRequestId"`
	SessionID                      string                        `json:"sessionId"`
	TaskID                         string                        `json:"taskId"`
	SegmentID                      string                        `json:"segmentId"`
	JudgeCalled                    bool                          `json:"judgeCalled"`
	JudgeReused                    bool                          `json:"judgeReused"`
	JudgeModel                     string                        `json:"judgeModel"`
	JudgeBackupUsed                bool                          `json:"judgeBackupUsed"`
	Difficulty                     float64                       `json:"difficulty"`
	RequestedModel                 string                        `json:"requestedModel"`
	ActualModel                    string                        `json:"actualModel"`
	Provider                       string                        `json:"provider"`
	Channel                        string                        `json:"channel"`
	Status                         string                        `json:"status"`
	FirstModelEventLatencyMs       int                           `json:"firstModelEventLatencyMs"`
	EndToEndLatencyMs              int                           `json:"endToEndLatencyMs"`
	JudgeLatencyMs                 int                           `json:"judgeLatencyMs"`
	ProviderLatencyMs              int                           `json:"providerLatencyMs"`
	ActualCostCNY                  float64                       `json:"actualCostCny"`
	JudgeCostCNY                   float64                       `json:"judgeCostCny"`
	ProviderCostCNY                float64                       `json:"providerCostCny"`
	FailedAttemptCostCNY           float64                       `json:"failedAttemptCostCny"`
	ErrorClass                     string                        `json:"errorClass,omitempty"`
	CooldownUntil                  string                        `json:"cooldownUntil,omitempty"`
	WorkPhase                      string                        `json:"workPhase"`
	WorkPhaseQualityTargetOffset   float64                       `json:"workPhaseQualityTargetOffset"`
	JudgeTrigger                   string                        `json:"judgeTrigger"`
	JudgeStatus                    string                        `json:"judgeStatus"`
	JudgeResultSource              string                        `json:"judgeResultSource"`
	JudgeFirstAttemptSucceeded     bool                          `json:"judgeFirstAttemptSucceeded"`
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

type ACUTimelineCandidateSummary struct {
	CandidateID       string  `json:"candidateId"`
	DisplayName       string  `json:"displayName"`
	EstimatedQuality  float64 `json:"estimatedQuality"`
	EstimatedCallCost float64 `json:"estimatedCallCost"`
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

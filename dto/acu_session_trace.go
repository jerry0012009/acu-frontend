package dto

type ACUSessionTrace struct {
	Session  ACUSessionTraceSession   `json:"session"`
	Task     ACUSessionTraceTask      `json:"task"`
	Segments []ACUSessionTraceSegment `json:"segments"`
}

type ACUSessionTraceSession struct {
	SessionID      string `json:"sessionId"`
	Status         string `json:"status"`
	StartedAt      string `json:"startedAt"`
	LastActivityAt string `json:"lastActivityAt"`
}

type ACUSessionTraceTask struct {
	TaskID      string `json:"taskId"`
	GoalSummary string `json:"goalSummary"`
	Status      string `json:"status"`
}

type ACUSessionTraceSegment struct {
	SegmentID                    string                           `json:"segmentId"`
	PreviousSegmentID            string                           `json:"previousSegmentId,omitempty"`
	CreationReason               string                           `json:"creationReason"`
	Phase                        string                           `json:"phase"`
	Status                       string                           `json:"status"`
	StartedAt                    string                           `json:"startedAt"`
	CompletedAt                  string                           `json:"completedAt,omitempty"`
	Judge                        *ACUSessionTraceJudge            `json:"judge,omitempty"`
	Route                        *ACUSessionTraceRoute            `json:"route,omitempty"`
	LogicalRequests              []ACUSessionTraceLogicalRequest  `json:"logicalRequests"`
	ProviderAttempts             []ACUSessionTraceProviderAttempt `json:"providerAttempts"`
	JudgeStatusReason            string                           `json:"judgeStatusReason,omitempty"`
	WorkPhase                    string                           `json:"workPhase"`
	WorkPhaseQualityTargetOffset float64                          `json:"workPhaseQualityTargetOffset"`
}

type ACUSessionTraceJudge struct {
	Trigger                 string                        `json:"trigger"`
	JudgeCalls              int                           `json:"judgeCalls"`
	JudgeReused             bool                          `json:"judgeReused"`
	ReusedJudgeEvaluationID string                        `json:"reusedJudgeEvaluationId,omitempty"`
	RouteRefreshReason      string                        `json:"routeRefreshReason,omitempty"`
	EvaluationID            string                        `json:"evaluationId,omitempty"`
	Model                   string                        `json:"model,omitempty"`
	Provider                string                        `json:"provider,omitempty"`
	Status                  string                        `json:"status"`
	ResultSource            string                        `json:"resultSource"`
	Difficulty              float64                       `json:"difficulty"`
	Confidence              float64                       `json:"confidence"`
	Explanation             string                        `json:"explanation"`
	InputTokens             int64                         `json:"inputTokens"`
	OutputTokens            int64                         `json:"outputTokens"`
	LatencyMs               int                           `json:"latencyMs"`
	Attempts                []ACUSessionTraceJudgeAttempt `json:"attempts"`
}

type ACUSessionTraceJudgeAttempt struct {
	Role          string `json:"role"`
	Model         string `json:"model"`
	Provider      string `json:"provider"`
	Status        string `json:"status"`
	ErrorCategory string `json:"errorCategory,omitempty"`
	HTTPStatus    int    `json:"httpStatus,omitempty"`
	LatencyMs     int    `json:"latencyMs"`
	BackupReason  string `json:"backupReason,omitempty"`
}

type ACUSessionTraceRoute struct {
	RouteDecisionID                string                            `json:"routeDecisionId"`
	RequestedModel                 string                            `json:"requestedModel"`
	SelectedCanonicalModel         string                            `json:"selectedCanonicalModel"`
	SelectedProvider               string                            `json:"selectedProvider"`
	SelectedChannel                string                            `json:"selectedChannel"`
	ModelSelectionReason           string                            `json:"modelSelectionReason"`
	ChannelSelectionReason         string                            `json:"channelSelectionReason"`
	CandidateCount                 int                               `json:"candidateCount"`
	ParetoFrontier                 []string                          `json:"paretoFrontier"`
	SelectedCandidateID            string                            `json:"selectedCandidateId"`
	SelectedDisplayName            string                            `json:"selectedDisplayName"`
	SelectedExecutionPresetID      string                            `json:"selectedExecutionPresetId,omitempty"`
	ClientRequestedReasoningEffort string                            `json:"clientRequestedReasoningEffort,omitempty"`
	PresetReasoningEffort          string                            `json:"presetReasoningEffort,omitempty"`
	TargetCanonicalReasoningEffort string                            `json:"targetCanonicalReasoningEffort,omitempty"`
	ResolvedReasoningEffort        string                            `json:"resolvedReasoningEffort,omitempty"`
	ReasoningMappingStatus         string                            `json:"reasoningMappingStatus,omitempty"`
	TopCandidates                  []ACUSessionTraceCandidateSummary `json:"topCandidates"`
	EffectiveQualityTarget         *float64                          `json:"effectiveQualityTarget,omitempty"`
}

type ACUSessionTraceCandidateSummary struct {
	CandidateID       string  `json:"candidateId"`
	DisplayName       string  `json:"displayName"`
	EstimatedQuality  float64 `json:"estimatedQuality"`
	EstimatedCallCost float64 `json:"estimatedCallCost,omitempty"`
	ValueUtility      float64 `json:"valueUtility"`
	Selected          bool    `json:"selected"`
}

type ACUSessionTraceLogicalRequest struct {
	LogicalRequestID    string             `json:"logicalRequestId"`
	NewAPILogID         string             `json:"newApiLogId"`
	RequestID           string             `json:"requestId"`
	RequestedModel      string             `json:"requestedModel"`
	ActualModel         string             `json:"actualModel,omitempty"`
	Status              string             `json:"status"`
	StartedAt           string             `json:"startedAt"`
	CompletedAt         string             `json:"completedAt,omitempty"`
	TotalLatencyMs      int64              `json:"totalLatencyMs"`
	FirstTokenLatencyMs *int               `json:"firstTokenLatencyMs"`
	VisibleOutputBytes  int64              `json:"visibleOutputBytes"`
	UserChargeCNY       *float64           `json:"userChargeCny,omitempty"`
	ActualCashCostCNY   *float64           `json:"actualCashCostCny,omitempty"`
	ActualCostCNY       float64            `json:"actualCostCny,omitempty"`
	DeliveryStatus      string             `json:"deliveryStatus,omitempty"`
	ErrorDiagnosis      *ACUErrorDiagnosis `json:"errorDiagnosis,omitempty"`
	InputTokens         int64              `json:"inputTokens"`
	CachedInputTokens   int64              `json:"cachedInputTokens"`
	OutputTokens        int64              `json:"outputTokens"`
	ReasoningTokens     int64              `json:"reasoningTokens"`
}

type ACUErrorDiagnosis struct {
	ErrorSource       string `json:"errorSource"`
	Endpoint          string `json:"endpoint"`
	CFRay             string `json:"cfRay,omitempty"`
	FirstByteReceived bool   `json:"firstByteReceived"`
	VisibleBytes      int64  `json:"visibleBytes"`
	RecoveryEligible  bool   `json:"recoveryEligible"`
	RecoveryExecuted  bool   `json:"recoveryExecuted"`
	RecoveryReason    string `json:"recoveryReason,omitempty"`
}

type ACUSessionTraceProviderAttempt struct {
	AttemptIndex        int    `json:"attemptIndex"`
	Model               string `json:"model"`
	Provider            string `json:"provider"`
	Channel             string `json:"channel"`
	Endpoint            string `json:"endpoint"`
	Status              string `json:"status"`
	HTTPStatus          int    `json:"httpStatus,omitempty"`
	ErrorCategory       string `json:"errorCategory,omitempty"`
	StartedAt           string `json:"startedAt"`
	CompletedAt         string `json:"completedAt,omitempty"`
	LatencyMs           int    `json:"latencyMs"`
	FirstTokenLatencyMs *int   `json:"firstTokenLatencyMs"`
	VisibleOutputBytes  int64  `json:"visibleOutputBytes"`
	RecoveryReason      string `json:"recoveryReason,omitempty"`
}

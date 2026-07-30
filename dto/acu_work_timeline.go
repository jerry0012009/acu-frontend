package dto

type ACUWorkTimeline struct {
	From    int64                  `json:"from"`
	To      int64                  `json:"to"`
	Summary ACUWorkTimelineSummary `json:"summary"`
	Items   []ACUWorkTimelineItem  `json:"items"`
}

type ACUWorkTimelineSummary struct {
	APISteps                    int     `json:"apiSteps"`
	JudgeCalls                  int     `json:"judgeCalls"`
	JudgeReuseRate              float64 `json:"judgeReuseRate"`
	CompletionRate              float64 `json:"completionRate"`
	ActualTotalCostCNY          float64 `json:"actualTotalCostCny"`
	P50FirstModelEventLatencyMs int     `json:"p50FirstModelEventLatencyMs"`
	P95FirstModelEventLatencyMs int     `json:"p95FirstModelEventLatencyMs"`
}

type ACUWorkTimelineItem struct {
	Timestamp                int64   `json:"timestamp"`
	Sequence                 int     `json:"sequence"`
	LogicalRequestID         string  `json:"logicalRequestId"`
	SessionID                string  `json:"sessionId"`
	TaskID                   string  `json:"taskId"`
	SegmentID                string  `json:"segmentId"`
	JudgeCalled              bool    `json:"judgeCalled"`
	JudgeReused              bool    `json:"judgeReused"`
	JudgeModel               string  `json:"judgeModel"`
	JudgeBackupUsed          bool    `json:"judgeBackupUsed"`
	Difficulty               float64 `json:"difficulty"`
	RequestedModel           string  `json:"requestedModel"`
	ActualModel              string  `json:"actualModel"`
	Provider                 string  `json:"provider"`
	Channel                  string  `json:"channel"`
	Status                   string  `json:"status"`
	FirstModelEventLatencyMs int     `json:"firstModelEventLatencyMs"`
	TotalLatencyMs           int     `json:"totalLatencyMs"`
	ActualCostCNY            float64 `json:"actualCostCny"`
	JudgeCostCNY             float64 `json:"judgeCostCny"`
	ProviderCostCNY          float64 `json:"providerCostCny"`
	FailedAttemptCostCNY     float64 `json:"failedAttemptCostCny"`
	ErrorClass               string  `json:"errorClass,omitempty"`
	CooldownUntil            string  `json:"cooldownUntil,omitempty"`
}

package dto

type ACUChannelMonitor struct {
	Range             string                     `json:"range"`
	SupplyStrategy    string                     `json:"supplyStrategy"`
	Scenario          string                     `json:"scenario"`
	GeneratedAt       string                     `json:"generatedAt"`
	Profiles          []ACUChannelMonitorProfile `json:"profiles"`
	History           []map[string]interface{}   `json:"history"`
	CooldownIntervals []map[string]interface{}   `json:"cooldownIntervals"`
	ProbeHistory      []map[string]interface{}   `json:"probeHistory"`
	SupplyInventory   []map[string]interface{}   `json:"supplyInventory"`
	ModelPool         []map[string]interface{}   `json:"modelPool"`
}

type ACUChannelMonitorProfile struct {
	ExecutionProfileID          string                   `json:"executionProfileId"`
	CanonicalModel              string                   `json:"canonicalModel"`
	Protocol                    []string                 `json:"protocol"`
	Provider                    string                   `json:"provider"`
	Channel                     string                   `json:"channel"`
	EndpointHost                string                   `json:"endpointHost"`
	Multiplier                  float64                  `json:"multiplier"`
	EffectiveCostStatus         string                   `json:"effectiveCostStatus"`
	Enabled                     bool                     `json:"enabled"`
	AdministratorAllowed        bool                     `json:"administratorAllowed"`
	AutoRouteEnabled            bool                     `json:"autoRouteEnabled"`
	RoutingEligible             bool                     `json:"routingEligible"`
	RoutingEligibility          string                   `json:"routingEligibility"`
	State                       string                   `json:"state"`
	ChannelState                string                   `json:"channelState"`
	ProfileState                string                   `json:"profileState"`
	ProfileStateRaw             string                   `json:"profileStateRaw"`
	ChannelStateRaw             string                   `json:"channelStateRaw"`
	ProviderStateRaw            string                   `json:"providerStateRaw"`
	ProbeStateRaw               string                   `json:"probeStateRaw"`
	EffectiveState              string                   `json:"effectiveState"`
	BlockingScope               string                   `json:"blockingScope"`
	StatusReason                string                   `json:"statusReason"`
	UsageTrusted                bool                     `json:"usageTrusted"`
	RecentSuccessRate           float64                  `json:"recentSuccessRate"`
	RequestCount                int                      `json:"requestCount"`
	SuccessCount                int                      `json:"successCount"`
	ErrorCount                  int                      `json:"errorCount"`
	JudgeAttemptCount           int                      `json:"judgeAttemptCount"`
	JudgeSuccessCount           int                      `json:"judgeSuccessCount"`
	FirstEventSampleCount       int                      `json:"firstEventSampleCount"`
	ConsecutiveFailures         int                      `json:"consecutiveFailures"`
	P50FirstModelEventLatencyMs float64                  `json:"p50FirstModelEventLatencyMs"`
	P95FirstModelEventLatencyMs float64                  `json:"p95FirstModelEventLatencyMs"`
	LastError                   string                   `json:"lastError"`
	LastSuccessAt               string                   `json:"lastSuccessAt"`
	CooldownUntil               string                   `json:"cooldownUntil"`
	RequiresFreshProbe          bool                     `json:"requiresFreshProbe"`
	LastProbeAt                 string                   `json:"lastProbeAt"`
	ProbeStatus                 string                   `json:"probeStatus"`
	ProbeLatencyMs              float64                  `json:"probeLatencyMs"`
	ProbeCostCNY                float64                  `json:"probeCostCny"`
	NextEligibleProbeAt         string                   `json:"nextEligibleProbeAt"`
	ProbeFreshness              string                   `json:"probeFreshness"`
	ProbeDailySpendCNY          float64                  `json:"probeDailySpendCny"`
	ProbeSuccessRate            *float64                 `json:"probeSuccessRate"`
	FullPoolProbeCount          int                      `json:"fullPoolProbeCount"`
	FullPoolProbeSuccessCount   int                      `json:"fullPoolProbeSuccessCount"`
	RecoveryProbeCount          int                      `json:"recoveryProbeCount"`
	RecoveryProbeSuccessCount   int                      `json:"recoveryProbeSuccessCount"`
	LatestSuccessfulProbeAt     string                   `json:"latestSuccessfulProbeAt"`
	LatestFullPoolProbeAt       string                   `json:"latestFullPoolProbeAt"`
	HealthEvents                []map[string]interface{} `json:"healthEvents"`
	SupportedReasoningEfforts   []string                 `json:"supportedReasoningEfforts,omitempty"`
	ReasoningControlMode        string                   `json:"reasoningControlMode,omitempty"`
	ProfileUtility              *float64                 `json:"profileUtility"`
	ProfileRank                 *int                     `json:"profileRank"`
	ProfileCandidateCount       *int                     `json:"profileCandidateCount"`
	ProfileCost                 *float64                 `json:"profileCost"`
	ProfileLatencyMs            *float64                 `json:"profileLatencyMs"`
	CostUtility                 *float64                 `json:"costUtility"`
	SpeedUtility                *float64                 `json:"speedUtility"`
	ReliabilityUtility          *float64                 `json:"reliabilityUtility"`
	CostContribution            *float64                 `json:"costContribution"`
	SpeedContribution           *float64                 `json:"speedContribution"`
	ReliabilityContribution     *float64                 `json:"reliabilityContribution"`
	MetricSource                *string                  `json:"metricSource"`
	FormulaVersion              *string                  `json:"formulaVersion"`
}

type ACUChannelPauseRequest struct {
	ChannelID       string `json:"channelId" binding:"required"`
	DurationMinutes int    `json:"durationMinutes" binding:"required"`
}

type ACUChannelPauseResult struct {
	ChannelID     string `json:"channelId"`
	State         string `json:"state"`
	CooldownUntil string `json:"cooldownUntil"`
	Recovery      string `json:"recovery"`
}

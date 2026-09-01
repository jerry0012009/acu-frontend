package dto

import "encoding/json"

type ACUChannelMonitor struct {
	Range                            string                     `json:"range"`
	SupplyStrategy                   string                     `json:"supplyStrategy"`
	Scenario                         string                     `json:"scenario"`
	Protocol                         string                     `json:"protocol"`
	GeneratedAt                      string                     `json:"generatedAt"`
	Profiles                         []ACUChannelMonitorProfile `json:"profiles"`
	History                          []map[string]interface{}   `json:"history"`
	CooldownIntervals                []map[string]interface{}   `json:"cooldownIntervals"`
	ProbeHistory                     []map[string]interface{}   `json:"probeHistory"`
	SupplyInventory                  []map[string]interface{}   `json:"supplyInventory"`
	ModelPool                        []map[string]interface{}   `json:"modelPool"`
	DefaultCandidatePreferenceScores map[string]float64         `json:"defaultCandidatePreferenceScores"`
}

// ACURoutingCatalog is the user-safe subset required to configure an API
// token's ACU model/profile constraints. It intentionally excludes runtime
// supply, health, inventory, latency, and cost telemetry.
type ACURoutingCatalog struct {
	Models                           []ACURoutingCatalogModel   `json:"models"`
	Profiles                         []ACURoutingCatalogProfile `json:"profiles"`
	DefaultCandidatePreferenceScores map[string]float64         `json:"defaultCandidatePreferenceScores"`
}

type ACURoutingCatalogModel struct {
	ModelID            string                       `json:"modelId"`
	Vendor             string                       `json:"vendor"`
	ModelCategory      string                       `json:"modelCategory"`
	CapabilityTier     string                       `json:"capabilityTier"`
	Protocols          []string                     `json:"protocols"`
	VerificationStatus string                       `json:"verificationStatus"`
	AutoRouteEnabled   bool                         `json:"autoRouteEnabled"`
	RoutingCandidates  []ACURoutingCatalogCandidate `json:"routingCandidates"`
}

type ACURoutingCatalogCandidate struct {
	CandidateID       string   `json:"candidateId"`
	ModelID           string   `json:"modelId"`
	DisplayName       string   `json:"displayName"`
	Kind              string   `json:"kind"`
	PresetID          string   `json:"presetId,omitempty"`
	ReasoningEffort   string   `json:"reasoningEffort,omitempty"`
	CalibrationStatus string   `json:"calibrationStatus,omitempty"`
	Protocols         []string `json:"protocols"`
}

type ACURoutingCatalogProfile struct {
	ExecutionProfileID        string   `json:"executionProfileId"`
	CanonicalModel            string   `json:"canonicalModel"`
	Protocol                  []string `json:"protocol"`
	AutoRouteEnabled          bool     `json:"autoRouteEnabled"`
	SupportedReasoningEfforts []string `json:"supportedReasoningEfforts,omitempty"`
}

type ACUChannelMonitorProfile struct {
	ExecutionProfileID          string                   `json:"executionProfileId"`
	CanonicalModel              string                   `json:"canonicalModel"`
	Protocol                    []string                 `json:"protocol"`
	Provider                    string                   `json:"provider"`
	Channel                     string                   `json:"channel"`
	PublicNote                  string                   `json:"publicNote"`
	EndpointHost                string                   `json:"endpointHost"`
	Multiplier                  float64                  `json:"multiplier"`
	EffectivePriceMultiplier    *float64                 `json:"effectivePriceMultiplier"`
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
	NextRoutingEligibleAt       string                   `json:"nextRoutingEligibleAt"`
	ProbeFreshness              string                   `json:"probeFreshness"`
	ProbeDailySpendCNY          float64                  `json:"probeDailySpendCny"`
	ProbeSuccessRate            *float64                 `json:"probeSuccessRate"`
	FullPoolProbeCount          int                      `json:"fullPoolProbeCount"`
	FullPoolProbeSuccessCount   int                      `json:"fullPoolProbeSuccessCount"`
	FullPoolProbeLatencyP50Ms   float64                  `json:"fullPoolProbeLatencyP50Ms"`
	FullPoolProbeLatencyP90Ms   float64                  `json:"fullPoolProbeLatencyP90Ms"`
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

// Keep Monitor compatible with Router versions that predate the explicit
// availability flags. A present false value remains false.
func (profile *ACUChannelMonitorProfile) UnmarshalJSON(data []byte) error {
	type alias ACUChannelMonitorProfile
	var decoded alias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	if _, ok := fields["enabled"]; !ok {
		decoded.Enabled = true
	}
	if _, ok := fields["administratorAllowed"]; !ok {
		decoded.AdministratorAllowed = true
	}
	if _, ok := fields["autoRouteEnabled"]; !ok {
		decoded.AutoRouteEnabled = true
	}
	*profile = ACUChannelMonitorProfile(decoded)
	return nil
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

type ACUTokenProfileRoutingScope struct {
	TokenID              int      `json:"tokenId"`
	Custom               bool     `json:"custom"`
	GlobalProfileIDs     []string `json:"globalProfileIds"`
	ConfiguredProfileIDs []string `json:"configuredProfileIds"`
	EffectiveProfileIDs  []string `json:"effectiveProfileIds"`
}

type ACUTokenProfileRoutingUpdate struct {
	ExecutionProfileID string `json:"executionProfileId" binding:"required"`
	Enabled            bool   `json:"enabled"`
}

type ACUProfilePublicNoteUpdate struct {
	ExecutionProfileID string `json:"executionProfileId" binding:"required"`
	Note               string `json:"note"`
}

package dto

type ACUChannelMonitor struct {
	Range           string                     `json:"range"`
	GeneratedAt     string                     `json:"generatedAt"`
	Profiles        []ACUChannelMonitorProfile `json:"profiles"`
	History         []map[string]interface{}   `json:"history"`
	SupplyInventory []map[string]interface{}   `json:"supplyInventory"`
}

type ACUChannelMonitorProfile struct {
	ExecutionProfileID          string   `json:"executionProfileId"`
	CanonicalModel              string   `json:"canonicalModel"`
	Protocol                    []string `json:"protocol"`
	Provider                    string   `json:"provider"`
	Channel                     string   `json:"channel"`
	EndpointHost                string   `json:"endpointHost"`
	Multiplier                  float64  `json:"multiplier"`
	EffectiveCostStatus         string   `json:"effectiveCostStatus"`
	Enabled                     bool     `json:"enabled"`
	AdministratorAllowed        bool     `json:"administratorAllowed"`
	RoutingEligible             bool     `json:"routingEligible"`
	State                       string   `json:"state"`
	RecentSuccessRate           float64  `json:"recentSuccessRate"`
	ConsecutiveFailures         int      `json:"consecutiveFailures"`
	P50FirstModelEventLatencyMs float64  `json:"p50FirstModelEventLatencyMs"`
	P95FirstModelEventLatencyMs float64  `json:"p95FirstModelEventLatencyMs"`
	LastError                   string   `json:"lastError"`
	LastSuccessAt               string   `json:"lastSuccessAt"`
	CooldownUntil               string   `json:"cooldownUntil"`
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

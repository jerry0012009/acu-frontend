package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

var acuRoutingCandidateIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}(@[A-Za-z0-9][A-Za-z0-9._-]{0,31})?$`)

const (
	ACURoutingPolicyAll           = "all_routing_eligible"
	ACURoutingPolicyCustom        = "custom_allowlist"
	acuModelFormulaVersion        = "acu-model-utility-v2.2"
	acuProfileFormulaVersion      = "acu-profile-utility-v2.2"
	acuQualitySatisfactionVersion = "acu-quality-satisfaction-v1"
)

type ACURoutingScope struct {
	Policy            string   `json:"modelPolicy"`
	AllowedModelIDs   []string `json:"allowedModelIds"`
	ProfilePolicy     string   `json:"profilePolicy"`
	AllowedProfileIDs []string `json:"allowedProfileIds"`
}

type ACUEffectiveRoutingPolicy struct {
	RoutingPolicy             string
	AllowedModelIDs           []string
	AllowedProfileIDs         []string
	RoutingPreference         string
	RoutingPolicyVersion      string
	QualityBias               int
	QualityPresets            map[string]int
	SupplyStrategy            string
	SupplyCostWeight          int
	SupplySpeedWeight         int
	SupplyReliabilityWeight   int
	ACUHighBiasOffset         int
	ModelCostLogScale         float64
	ProfileCostLogScale       float64
	ProfileSpeedLogScale      float64
	LatencyPolicy             ACULatencyPolicy
	ReliabilityPolicy         ACUReliabilityPolicy
	WorkPhaseBiasOffsets      map[string]int
	RoutingUtilityVersion     string
	FormulaMode               string
	AllowedCandidateIDs       []string
	CandidatePreferenceScores map[string]float64
	ProfilePreferenceScores   map[string]float64
}

type ACUSupplyWeights struct {
	Cost        int `json:"cost"`
	Speed       int `json:"speed"`
	Reliability int `json:"reliability"`
}

type ACULatencyPolicy struct {
	WindowHours                int     `json:"windowHours"`
	LongContextThresholdTokens int     `json:"longContextThresholdTokens"`
	MinimumSamples             int     `json:"minimumSamples"`
	UnknownLatencyMultiplier   float64 `json:"unknownLatencyMultiplier"`
}

type ACUReliabilityPolicy struct {
	WindowHours        int     `json:"windowHours"`
	MinimumSamples     int     `json:"minimumSamples"`
	UnknownDefault     float64 `json:"unknownDefault"`
	DegradedMultiplier float64 `json:"degradedMultiplier"`
}

type ACURoutingUtilityConfig struct {
	SchemaVersion                    string                      `json:"schemaVersion"`
	FormulaMode                      string                      `json:"formulaMode"`
	QualityPresets                   map[string]int              `json:"qualityPresets"`
	ACUHighBiasOffset                int                         `json:"acuHighBiasOffset"`
	ModelCostLogScale                float64                     `json:"modelCostLogScale"`
	SupplyPresets                    map[string]ACUSupplyWeights `json:"supplyPresets"`
	ProfileCostLogScale              float64                     `json:"profileCostLogScale"`
	ProfileSpeedLogScale             float64                     `json:"profileSpeedLogScale"`
	Latency                          ACULatencyPolicy            `json:"latency"`
	Reliability                      ACUReliabilityPolicy        `json:"reliability"`
	WorkPhaseBiasOffsets             map[string]int              `json:"workPhaseBiasOffsets"`
	DefaultCandidatePreferenceScores map[string]float64          `json:"defaultCandidatePreferenceScores"`
	DefaultProfilePreferenceScores   map[string]float64          `json:"defaultProfilePreferenceScores"`
}

func defaultACUCandidatePreferenceScores() map[string]float64 {
	return map[string]float64{
		"gpt-5.6-luna":      99.7,
		"gpt-5.6-luna@max":  99.7,
		"gpt-5.6-sol@high":  99.8,
		"gpt-5.6-sol@xhigh": 97.5,
		"gpt-5.6-terra@max": 102,
		"claude-opus-4-8":   118,
		"claude-sonnet-5":   90,
		"claude-fable-5":    91,
	}
}

func defaultACURoutingUtilityConfig() ACURoutingUtilityConfig {
	return ACURoutingUtilityConfig{
		SchemaVersion: "acu-routing-utility-config-v1", FormulaMode: "legacy",
		QualityPresets:    map[string]int{"economy": -10, "balanced": 20, "quality": 70},
		ACUHighBiasOffset: 40, ModelCostLogScale: 0.75,
		SupplyPresets: map[string]ACUSupplyWeights{
			"lowest_cost":      {Cost: 100},
			"balanced":         {Cost: 40, Speed: 25, Reliability: 35},
			"low_latency":      {Cost: 10, Speed: 80, Reliability: 10},
			"high_reliability": {Cost: 10, Speed: 10, Reliability: 80},
		},
		ProfileCostLogScale: 2.5, ProfileSpeedLogScale: 2.5,
		Latency:                          ACULatencyPolicy{WindowHours: 24, LongContextThresholdTokens: 100000, MinimumSamples: 5, UnknownLatencyMultiplier: 1.2},
		Reliability:                      ACUReliabilityPolicy{WindowHours: 24, MinimumSamples: 5, UnknownDefault: 0.75, DegradedMultiplier: 0.85},
		WorkPhaseBiasOffsets:             map[string]int{"inspection": -10, "general": 0, "implementation": 0, "verification": 0, "planning": 10, "recovery": 20},
		DefaultCandidatePreferenceScores: defaultACUCandidatePreferenceScores(),
		DefaultProfilePreferenceScores:   map[string]float64{},
	}
}

func NormalizeACUSupplyStrategy(value string) (string, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "balanced", nil
	}
	if value != "lowest_cost" && value != "balanced" && value != "low_latency" && value != "high_reliability" {
		return "", fmt.Errorf("invalid ACU supply strategy")
	}
	return value, nil
}

func NormalizeACURoutingUtilityConfig(config ACURoutingUtilityConfig) (ACURoutingUtilityConfig, error) {
	if config.DefaultCandidatePreferenceScores == nil {
		config.DefaultCandidatePreferenceScores = defaultACUCandidatePreferenceScores()
	}
	if config.DefaultProfilePreferenceScores == nil {
		config.DefaultProfilePreferenceScores = map[string]float64{}
	}
	if config.SchemaVersion == "" {
		config.SchemaVersion = "acu-routing-utility-config-v1"
	}
	if config.SchemaVersion != "acu-routing-utility-config-v1" {
		return config, fmt.Errorf("invalid ACU routing utility schema version")
	}
	if config.FormulaMode != "legacy" && config.FormulaMode != "shadow" && config.FormulaMode != "active" {
		return config, fmt.Errorf("invalid ACU routing formula mode")
	}
	for _, name := range []string{"economy", "balanced", "quality"} {
		value, ok := config.QualityPresets[name]
		if !ok || value < -100 || value > 100 {
			return config, fmt.Errorf("invalid ACU quality preset %s", name)
		}
	}
	if config.ACUHighBiasOffset < 0 || config.ACUHighBiasOffset > 100 {
		return config, fmt.Errorf("invalid ACU high bias offset")
	}
	if config.ModelCostLogScale < 0.1 || config.ModelCostLogScale > 20 || config.ProfileCostLogScale < 0.1 || config.ProfileCostLogScale > 20 || config.ProfileSpeedLogScale < 0.1 || config.ProfileSpeedLogScale > 20 {
		return config, fmt.Errorf("invalid ACU routing log scale")
	}
	for _, name := range []string{"lowest_cost", "balanced", "low_latency", "high_reliability"} {
		weights, ok := config.SupplyPresets[name]
		if !ok || weights.Cost < 0 || weights.Cost > 100 || weights.Speed < 0 || weights.Speed > 100 || weights.Reliability < 0 || weights.Reliability > 100 || weights.Cost+weights.Speed+weights.Reliability != 100 {
			return config, fmt.Errorf("invalid ACU supply preset %s", name)
		}
	}
	if config.Latency.WindowHours < 1 || config.Latency.WindowHours > 168 || config.Latency.MinimumSamples < 3 || config.Latency.MinimumSamples > 1000 || config.Latency.LongContextThresholdTokens < 1 || config.Latency.UnknownLatencyMultiplier < 1 || config.Latency.UnknownLatencyMultiplier > 5 {
		return config, fmt.Errorf("invalid ACU latency policy")
	}
	if config.Reliability.WindowHours < 1 || config.Reliability.WindowHours > 168 || config.Reliability.MinimumSamples < 3 || config.Reliability.MinimumSamples > 1000 || config.Reliability.UnknownDefault < 0.5 || config.Reliability.UnknownDefault > 0.95 || config.Reliability.DegradedMultiplier < 0.5 || config.Reliability.DegradedMultiplier > 1 {
		return config, fmt.Errorf("invalid ACU reliability policy")
	}
	for _, phase := range []string{"inspection", "general", "implementation", "verification", "planning", "recovery"} {
		value, ok := config.WorkPhaseBiasOffsets[phase]
		if !ok || value < -100 || value > 100 {
			return config, fmt.Errorf("invalid ACU work phase bias offset %s", phase)
		}
	}
	_, normalizedDefaultScores, err := NormalizeACUCandidatePolicy(nil, config.DefaultCandidatePreferenceScores, nil, false)
	if err != nil {
		return config, fmt.Errorf("invalid default candidate preference scores: %w", err)
	}
	config.DefaultCandidatePreferenceScores = normalizedDefaultScores
	normalizedProfileScores, err := NormalizeACUProfilePreferenceScores(config.DefaultProfilePreferenceScores)
	if err != nil {
		return config, fmt.Errorf("invalid default Profile preference scores: %w", err)
	}
	config.DefaultProfilePreferenceScores = normalizedProfileScores
	return config, nil
}

func GetACURoutingUtilityConfig() (ACURoutingUtilityConfig, error) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["ACURoutingUtilityConfig"]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) == "" {
		return defaultACURoutingUtilityConfig(), nil
	}
	var config ACURoutingUtilityConfig
	if err := common.UnmarshalJsonStr(raw, &config); err != nil {
		return config, fmt.Errorf("invalid ACU routing utility config: %w", err)
	}
	return NormalizeACURoutingUtilityConfig(config)
}

func NormalizeACURoutingPreference(value string) (string, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "balanced", nil
	}
	if value != "economy" && value != "balanced" && value != "quality" {
		return "", fmt.Errorf("invalid ACU routing preference")
	}
	return value, nil
}

func normalizeACUScope(scope ACURoutingScope) (ACURoutingScope, error) {
	if scope.Policy == "" {
		scope.Policy = ACURoutingPolicyAll
	}
	if scope.ProfilePolicy == "" {
		scope.ProfilePolicy = ACURoutingPolicyAll
	}
	if scope.Policy != ACURoutingPolicyAll && scope.Policy != ACURoutingPolicyCustom {
		return scope, fmt.Errorf("invalid ACU model policy")
	}
	if scope.ProfilePolicy != ACURoutingPolicyAll && scope.ProfilePolicy != ACURoutingPolicyCustom {
		return scope, fmt.Errorf("invalid ACU profile policy")
	}
	scope.AllowedModelIDs = normalizeACUIDs(scope.AllowedModelIDs)
	scope.AllowedProfileIDs = normalizeACUIDs(scope.AllowedProfileIDs)
	if scope.Policy == ACURoutingPolicyAll {
		scope.AllowedModelIDs = []string{}
	}
	if scope.ProfilePolicy == ACURoutingPolicyAll {
		scope.AllowedProfileIDs = []string{}
	}
	if scope.Policy == ACURoutingPolicyCustom && len(scope.AllowedModelIDs) == 0 {
		return scope, fmt.Errorf("ACU custom model allowlist is empty")
	}
	if scope.ProfilePolicy == ACURoutingPolicyCustom && len(scope.AllowedProfileIDs) == 0 {
		return scope, fmt.Errorf("ACU custom profile allowlist is empty")
	}
	return scope, nil
}

func NormalizeACURoutingScope(scope ACURoutingScope) (ACURoutingScope, error) {
	return normalizeACUScope(scope)
}

// ACUCanonicalAllowedModelIDs removes New API's virtual compatibility entries
// before a model limit is sent to the Router policy layer.
func ACUCanonicalAllowedModelIDs(modelLimits string) []string {
	values := strings.Split(modelLimits, ",")
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || value == "acu-auto" || value == "acu-high" {
			continue
		}
		filtered = append(filtered, value)
	}
	return normalizeACUIDs(filtered)
}

func NormalizeACUCandidatePolicy(candidateIDs []string, scores map[string]float64, allowedModelIDs []string, customModelAllowlist bool) ([]string, map[string]float64, error) {
	allowedModels := make(map[string]struct{}, len(allowedModelIDs))
	for _, modelID := range allowedModelIDs {
		allowedModels[modelID] = struct{}{}
	}
	normalizedCandidateIDs := normalizeACUIDs(candidateIDs)
	allowedCandidates := make(map[string]struct{}, len(normalizedCandidateIDs))
	for _, candidateID := range normalizedCandidateIDs {
		modelID := strings.SplitN(candidateID, "@", 2)[0]
		if !acuRoutingCandidateIDPattern.MatchString(candidateID) || modelID == "acu-auto" || modelID == "acu-high" {
			return nil, nil, fmt.Errorf("invalid ACU routing candidate ID %q", candidateID)
		}
		if customModelAllowlist {
			if _, ok := allowedModels[modelID]; !ok {
				return nil, nil, fmt.Errorf("ACU routing candidate %q is outside the custom model allowlist", candidateID)
			}
		}
		allowedCandidates[candidateID] = struct{}{}
	}
	normalized := make(map[string]float64, len(scores))
	for rawCandidateID, score := range scores {
		candidateID := strings.TrimSpace(rawCandidateID)
		modelID := strings.SplitN(candidateID, "@", 2)[0]
		if !acuRoutingCandidateIDPattern.MatchString(candidateID) || modelID == "acu-auto" || modelID == "acu-high" {
			return nil, nil, fmt.Errorf("invalid ACU routing candidate ID %q", rawCandidateID)
		}
		if math.IsNaN(score) || math.IsInf(score, 0) || score < 0 || score > 200 {
			return nil, nil, fmt.Errorf("ACU candidate preference score for %q must be a number from 0 to 200", candidateID)
		}
		if customModelAllowlist {
			if _, ok := allowedModels[modelID]; !ok {
				return nil, nil, fmt.Errorf("ACU candidate preference %q is outside the custom model allowlist", candidateID)
			}
		}
		if len(allowedCandidates) > 0 {
			if _, ok := allowedCandidates[candidateID]; !ok {
				return nil, nil, fmt.Errorf("ACU candidate preference %q is outside the candidate allowlist", candidateID)
			}
		}
		// An explicit 100 overrides a non-neutral global default.
		normalized[candidateID] = score
	}
	return normalizedCandidateIDs, normalized, nil
}

func NormalizeACUProfilePreferenceScores(scores map[string]float64) (map[string]float64, error) {
	normalized := make(map[string]float64, len(scores))
	for rawProfileID, score := range scores {
		profileID := strings.TrimSpace(rawProfileID)
		if profileID == "" || len(profileID) > 256 || !acuRoutingCandidateIDPattern.MatchString(profileID) {
			return nil, fmt.Errorf("invalid ACU execution Profile ID %q", rawProfileID)
		}
		if math.IsNaN(score) || math.IsInf(score, 0) || score < 0 || score > 200 {
			return nil, fmt.Errorf("ACU Profile preference score for %q must be a number from 0 to 200", profileID)
		}
		if score != 100 {
			normalized[profileID] = score
		}
	}
	return normalized, nil
}

func ValidateACUCandidatePolicyAgainstPool(ctx context.Context, candidateIDs []string, scores map[string]float64) error {
	if len(candidateIDs) == 0 && len(scores) == 0 {
		return nil
	}
	monitor, err := GetACUChannelMonitor(ctx, "24h", "balanced", "standard", "48h", "all")
	if err != nil {
		if strings.Contains(err.Error(), "not configured") {
			return nil
		}
		return err
	}
	available := make(map[string]struct{})
	for _, item := range monitor.ModelPool {
		rawCandidates, _ := item["routingCandidates"].([]interface{})
		for _, rawCandidate := range rawCandidates {
			candidate, _ := rawCandidate.(map[string]interface{})
			if candidateID, ok := candidate["candidateId"].(string); ok {
				available[candidateID] = struct{}{}
			}
		}
	}
	for _, candidateID := range candidateIDs {
		if _, ok := available[candidateID]; !ok {
			return fmt.Errorf("ACU routing candidate %q is not present in the current Router candidate pool", candidateID)
		}
	}
	for candidateID := range scores {
		if _, ok := available[candidateID]; !ok {
			return fmt.Errorf("ACU candidate preference %q is not present in the current Router candidate pool", candidateID)
		}
	}
	return nil
}

func ValidateACUProfilePreferenceScoresAgainstPool(ctx context.Context, scores map[string]float64) error {
	if len(scores) == 0 {
		return nil
	}
	monitor, err := GetACUChannelMonitor(ctx, "24h", "balanced", "standard", "48h", "all")
	if err != nil {
		if strings.Contains(err.Error(), "not configured") {
			return nil
		}
		return err
	}
	available := make(map[string]struct{}, len(monitor.Profiles))
	for _, profile := range monitor.Profiles {
		available[profile.ExecutionProfileID] = struct{}{}
	}
	for profileID := range scores {
		if _, ok := available[profileID]; !ok {
			return fmt.Errorf("ACU Profile preference %q is not present in the current Router Profile pool", profileID)
		}
	}
	return nil
}

func GetACUGlobalRoutingScope() (ACURoutingScope, error) {
	return globalACURoutingScope()
}

func validateACURoutingScopeAgainstPool(
	ctx context.Context,
	scope ACURoutingScope,
	removeUnavailableProfiles bool,
) (ACURoutingScope, []string, error) {
	if scope.Policy != ACURoutingPolicyCustom && scope.ProfilePolicy != ACURoutingPolicyCustom {
		return scope, nil, nil
	}
	monitor, err := GetACUChannelMonitor(ctx, "24h", "balanced", "standard", "48h", "all")
	if err != nil {
		if strings.Contains(err.Error(), "not configured") {
			return scope, nil, nil
		}
		return scope, nil, err
	}
	models := make(map[string]struct{}, len(monitor.ModelPool))
	for _, item := range monitor.ModelPool {
		if modelID, ok := item["modelId"].(string); ok {
			models[modelID] = struct{}{}
		}
	}
	profiles := make(map[string]string, len(monitor.Profiles))
	for _, profile := range monitor.Profiles {
		if profile.ExecutionProfileID != "" &&
			profile.Enabled &&
			profile.AdministratorAllowed &&
			profile.AutoRouteEnabled {
			profiles[profile.ExecutionProfileID] = profile.CanonicalModel
		}
	}
	if scope.Policy == ACURoutingPolicyCustom {
		for _, modelID := range scope.AllowedModelIDs {
			if _, ok := models[modelID]; !ok {
				return scope, nil, fmt.Errorf("ACU model %q is not present in the current Router model pool", modelID)
			}
		}
	}
	removedProfileIDs := []string{}
	if scope.ProfilePolicy == ACURoutingPolicyCustom {
		availableProfileIDs := make([]string, 0, len(scope.AllowedProfileIDs))
		for _, profileID := range scope.AllowedProfileIDs {
			modelID, ok := profiles[profileID]
			if !ok {
				if removeUnavailableProfiles {
					removedProfileIDs = append(removedProfileIDs, profileID)
					continue
				}
				return scope, nil, fmt.Errorf("ACU Profile %q is not present in the current Router model pool", profileID)
			}
			if scope.Policy == ACURoutingPolicyCustom {
				if _, ok := models[modelID]; !ok {
					return scope, nil, fmt.Errorf("ACU Profile %q references unknown model %q", profileID, modelID)
				}
				allowed := false
				for _, allowedModel := range scope.AllowedModelIDs {
					if allowedModel == modelID {
						allowed = true
						break
					}
				}
				if !allowed {
					return scope, nil, fmt.Errorf("ACU Profile %q belongs to model %q outside the model allowlist", profileID, modelID)
				}
			}
			availableProfileIDs = append(availableProfileIDs, profileID)
		}
		if removeUnavailableProfiles {
			if len(availableProfileIDs) == 0 {
				return scope, removedProfileIDs, fmt.Errorf("ACU custom profile allowlist has no profiles in the current Router model pool")
			}
			scope.AllowedProfileIDs = normalizeACUIDs(availableProfileIDs)
		}
	}
	return scope, removedProfileIDs, nil
}

func ValidateACURoutingScopeAgainstPool(ctx context.Context, scope ACURoutingScope) error {
	_, _, err := validateACURoutingScopeAgainstPool(ctx, scope, false)
	return err
}

func SanitizeACUGlobalRoutingScopeAgainstPool(
	ctx context.Context,
	scope ACURoutingScope,
) (ACURoutingScope, []string, error) {
	return validateACURoutingScopeAgainstPool(ctx, scope, true)
}

func normalizeACUIDs(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func intersectACUIDs(left, right []string) []string {
	set := make(map[string]struct{}, len(left))
	for _, value := range left {
		set[value] = struct{}{}
	}
	result := make([]string, 0)
	for _, value := range right {
		if _, ok := set[value]; ok {
			result = append(result, value)
		}
	}
	return normalizeACUIDs(result)
}

func currentGlobalACUProfileIDs(ctx context.Context) ([]string, error) {
	monitor, err := GetACUChannelMonitor(ctx, "24h", "balanced", "standard", "48h", "all")
	if err != nil {
		return nil, err
	}
	scope, err := globalACURoutingScope()
	if err != nil {
		return nil, err
	}
	allowedModels := make(map[string]struct{}, len(scope.AllowedModelIDs))
	for _, modelID := range scope.AllowedModelIDs {
		allowedModels[modelID] = struct{}{}
	}
	allowedProfiles := make(map[string]struct{}, len(scope.AllowedProfileIDs))
	for _, profileID := range scope.AllowedProfileIDs {
		allowedProfiles[profileID] = struct{}{}
	}
	profileIDs := make([]string, 0, len(monitor.Profiles))
	for _, profile := range monitor.Profiles {
		if profile.ExecutionProfileID == "" ||
			!profile.Enabled ||
			!profile.AdministratorAllowed ||
			!profile.AutoRouteEnabled {
			continue
		}
		if scope.Policy == ACURoutingPolicyCustom {
			if _, ok := allowedModels[profile.CanonicalModel]; !ok {
				continue
			}
		}
		if scope.ProfilePolicy == ACURoutingPolicyCustom {
			if _, ok := allowedProfiles[profile.ExecutionProfileID]; !ok {
				continue
			}
		}
		profileIDs = append(profileIDs, profile.ExecutionProfileID)
	}
	return normalizeACUIDs(profileIDs), nil
}

func GetACUTokenProfileRoutingScope(
	ctx context.Context,
	userID int,
	tokenID int,
) (dto.ACUTokenProfileRoutingScope, error) {
	token, err := model.GetTokenByIds(tokenID, userID)
	if err != nil {
		return dto.ACUTokenProfileRoutingScope{}, err
	}
	globalProfileIDs, err := currentGlobalACUProfileIDs(ctx)
	if err != nil {
		return dto.ACUTokenProfileRoutingScope{}, err
	}
	effectiveProfileIDs := globalProfileIDs
	configuredProfileIDs := []string{}
	if token.ACUProfileLimitsEnabled {
		configuredProfileIDs = normalizeACUIDs(token.ACUProfileLimits)
		effectiveProfileIDs = intersectACUIDs(globalProfileIDs, configuredProfileIDs)
	}
	return dto.ACUTokenProfileRoutingScope{
		TokenID:              token.Id,
		Custom:               token.ACUProfileLimitsEnabled,
		GlobalProfileIDs:     globalProfileIDs,
		ConfiguredProfileIDs: configuredProfileIDs,
		EffectiveProfileIDs:  effectiveProfileIDs,
	}, nil
}

func UpdateACUTokenProfileRouting(
	ctx context.Context,
	userID int,
	tokenID int,
	input dto.ACUTokenProfileRoutingUpdate,
) (dto.ACUTokenProfileRoutingScope, error) {
	token, err := model.GetTokenByIds(tokenID, userID)
	if err != nil {
		return dto.ACUTokenProfileRoutingScope{}, err
	}
	globalProfileIDs, err := currentGlobalACUProfileIDs(ctx)
	if err != nil {
		return dto.ACUTokenProfileRoutingScope{}, err
	}
	globalSet := make(map[string]struct{}, len(globalProfileIDs))
	for _, profileID := range globalProfileIDs {
		globalSet[profileID] = struct{}{}
	}
	if _, ok := globalSet[input.ExecutionProfileID]; !ok {
		return dto.ACUTokenProfileRoutingScope{}, fmt.Errorf("ACU Profile is not allowed by global routing")
	}
	effectiveProfileIDs := append([]string(nil), globalProfileIDs...)
	if token.ACUProfileLimitsEnabled {
		effectiveProfileIDs = intersectACUIDs(globalProfileIDs, token.ACUProfileLimits)
	}
	selected := make(map[string]struct{}, len(effectiveProfileIDs))
	for _, profileID := range effectiveProfileIDs {
		selected[profileID] = struct{}{}
	}
	if input.Enabled {
		selected[input.ExecutionProfileID] = struct{}{}
	} else {
		delete(selected, input.ExecutionProfileID)
	}
	nextProfileIDs := make([]string, 0, len(selected))
	for profileID := range selected {
		nextProfileIDs = append(nextProfileIDs, profileID)
	}
	nextProfileIDs = normalizeACUIDs(nextProfileIDs)
	if len(nextProfileIDs) == 0 {
		return dto.ACUTokenProfileRoutingScope{}, fmt.Errorf("at least one ACU Profile must remain enabled")
	}
	if len(nextProfileIDs) == len(globalProfileIDs) {
		token.ACUProfileLimitsEnabled = false
		token.ACUProfileLimits = []string{}
	} else {
		token.ACUProfileLimitsEnabled = true
		token.ACUProfileLimits = nextProfileIDs
	}
	if err := token.Update(); err != nil {
		return dto.ACUTokenProfileRoutingScope{}, err
	}
	return GetACUTokenProfileRoutingScope(ctx, userID, tokenID)
}

func globalACURoutingScope() (ACURoutingScope, error) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["ACUGlobalRoutingPolicy"]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) == "" {
		return ACURoutingScope{Policy: ACURoutingPolicyAll, ProfilePolicy: ACURoutingPolicyAll}, nil
	}
	var scope ACURoutingScope
	if err := common.UnmarshalJsonStr(raw, &scope); err != nil {
		return scope, fmt.Errorf("invalid global ACU routing policy: %w", err)
	}
	return normalizeACUScope(scope)
}

func ResolveACUEffectiveRoutingPolicy(token *model.Token) (ACUEffectiveRoutingPolicy, error) {
	global, err := globalACURoutingScope()
	if err != nil {
		return ACUEffectiveRoutingPolicy{}, err
	}
	preference := "balanced"
	if token != nil {
		preference = token.ACURoutingPreference
	}
	preference, err = NormalizeACURoutingPreference(preference)
	if err != nil {
		return ACUEffectiveRoutingPolicy{}, err
	}
	utilityConfig, err := GetACURoutingUtilityConfig()
	if err != nil {
		return ACUEffectiveRoutingPolicy{}, err
	}
	supplyStrategy := "balanced"
	if token != nil {
		supplyStrategy = token.ACUSupplyStrategy
	}
	supplyStrategy, err = NormalizeACUSupplyStrategy(supplyStrategy)
	if err != nil {
		return ACUEffectiveRoutingPolicy{}, err
	}
	qualityBias := utilityConfig.QualityPresets[preference]
	if token != nil && token.ACUQualityBias != nil {
		if *token.ACUQualityBias < -100 || *token.ACUQualityBias > 100 {
			return ACUEffectiveRoutingPolicy{}, fmt.Errorf("invalid ACU quality bias")
		}
		qualityBias = *token.ACUQualityBias
	}
	supplyWeights := utilityConfig.SupplyPresets[supplyStrategy]
	tokenScope := ACURoutingScope{Policy: ACURoutingPolicyAll, ProfilePolicy: ACURoutingPolicyAll}
	if token != nil {
		if token.ModelLimitsEnabled {
			tokenScope.AllowedModelIDs = ACUCanonicalAllowedModelIDs(token.ModelLimits)
			if len(tokenScope.AllowedModelIDs) > 0 {
				tokenScope.Policy = ACURoutingPolicyCustom
			}
		}
		if token.ACUProfileLimitsEnabled {
			tokenScope.ProfilePolicy = ACURoutingPolicyCustom
			tokenScope.AllowedProfileIDs = token.ACUProfileLimits
		}
	}
	tokenScope, err = normalizeACUScope(tokenScope)
	if err != nil {
		return ACUEffectiveRoutingPolicy{}, err
	}
	allowedCandidateIDs := []string{}
	candidatePreferenceScores := make(map[string]float64, len(utilityConfig.DefaultCandidatePreferenceScores))
	for candidateID, score := range utilityConfig.DefaultCandidatePreferenceScores {
		candidatePreferenceScores[candidateID] = score
	}
	profilePreferenceScores := make(map[string]float64, len(utilityConfig.DefaultProfilePreferenceScores))
	for profileID, score := range utilityConfig.DefaultProfilePreferenceScores {
		profilePreferenceScores[profileID] = score
	}
	if token != nil {
		var tokenScores map[string]float64
		allowedCandidateIDs, tokenScores, err = NormalizeACUCandidatePolicy(
			token.ACUAllowedCandidateIDs,
			token.ACUCandidatePreferenceScores,
			tokenScope.AllowedModelIDs,
			tokenScope.Policy == ACURoutingPolicyCustom,
		)
		if err != nil {
			return ACUEffectiveRoutingPolicy{}, err
		}
		for candidateID, score := range tokenScores {
			candidatePreferenceScores[candidateID] = score
		}
	}
	result := ACUEffectiveRoutingPolicy{
		RoutingPolicy: ACURoutingPolicyAll, AllowedModelIDs: []string{}, AllowedProfileIDs: []string{}, RoutingPreference: preference,
		QualityBias: qualityBias, QualityPresets: map[string]int{
			"economy":  utilityConfig.QualityPresets["economy"],
			"balanced": utilityConfig.QualityPresets["balanced"],
			"quality":  utilityConfig.QualityPresets["quality"],
		}, SupplyStrategy: supplyStrategy,
		SupplyCostWeight: supplyWeights.Cost, SupplySpeedWeight: supplyWeights.Speed, SupplyReliabilityWeight: supplyWeights.Reliability,
		ACUHighBiasOffset: utilityConfig.ACUHighBiasOffset, ModelCostLogScale: utilityConfig.ModelCostLogScale,
		ProfileCostLogScale: utilityConfig.ProfileCostLogScale, ProfileSpeedLogScale: utilityConfig.ProfileSpeedLogScale,
		LatencyPolicy: utilityConfig.Latency, ReliabilityPolicy: utilityConfig.Reliability,
		WorkPhaseBiasOffsets: utilityConfig.WorkPhaseBiasOffsets, FormulaMode: utilityConfig.FormulaMode,
		AllowedCandidateIDs:       allowedCandidateIDs,
		CandidatePreferenceScores: candidatePreferenceScores,
		ProfilePreferenceScores:   profilePreferenceScores,
	}
	if len(result.AllowedCandidateIDs) > 0 {
		allowedCandidates := make(map[string]struct{}, len(result.AllowedCandidateIDs))
		for _, candidateID := range result.AllowedCandidateIDs {
			allowedCandidates[candidateID] = struct{}{}
		}
		for candidateID := range result.CandidatePreferenceScores {
			if _, ok := allowedCandidates[candidateID]; !ok {
				delete(result.CandidatePreferenceScores, candidateID)
			}
		}
	}
	if global.Policy == ACURoutingPolicyCustom && tokenScope.Policy == ACURoutingPolicyCustom {
		result.AllowedModelIDs = intersectACUIDs(global.AllowedModelIDs, tokenScope.AllowedModelIDs)
	} else if global.Policy == ACURoutingPolicyCustom {
		result.AllowedModelIDs = global.AllowedModelIDs
	} else if tokenScope.Policy == ACURoutingPolicyCustom {
		result.AllowedModelIDs = normalizeACUIDs(tokenScope.AllowedModelIDs)
	}
	if len(result.AllowedModelIDs) > 0 {
		result.RoutingPolicy = ACURoutingPolicyCustom
	} else if global.Policy == ACURoutingPolicyCustom || tokenScope.Policy == ACURoutingPolicyCustom {
		return result, fmt.Errorf("ACU model allowlist intersection is empty")
	}
	if result.RoutingPolicy == ACURoutingPolicyCustom {
		allowedModels := make(map[string]struct{}, len(result.AllowedModelIDs))
		for _, modelID := range result.AllowedModelIDs {
			allowedModels[modelID] = struct{}{}
		}
		effectiveCandidateIDs := make([]string, 0, len(result.AllowedCandidateIDs))
		for _, candidateID := range result.AllowedCandidateIDs {
			if _, ok := allowedModels[strings.SplitN(candidateID, "@", 2)[0]]; ok {
				effectiveCandidateIDs = append(effectiveCandidateIDs, candidateID)
			}
		}
		if len(result.AllowedCandidateIDs) > 0 && len(effectiveCandidateIDs) == 0 {
			return result, fmt.Errorf("ACU candidate allowlist intersection is empty")
		}
		result.AllowedCandidateIDs = effectiveCandidateIDs
		for candidateID := range result.CandidatePreferenceScores {
			if _, ok := allowedModels[strings.SplitN(candidateID, "@", 2)[0]]; !ok {
				delete(result.CandidatePreferenceScores, candidateID)
			}
		}
	}
	if global.ProfilePolicy == ACURoutingPolicyCustom && tokenScope.ProfilePolicy == ACURoutingPolicyCustom {
		result.AllowedProfileIDs = intersectACUIDs(global.AllowedProfileIDs, tokenScope.AllowedProfileIDs)
	} else if global.ProfilePolicy == ACURoutingPolicyCustom {
		result.AllowedProfileIDs = global.AllowedProfileIDs
	} else if tokenScope.ProfilePolicy == ACURoutingPolicyCustom {
		result.AllowedProfileIDs = normalizeACUIDs(tokenScope.AllowedProfileIDs)
	}
	if len(result.AllowedProfileIDs) == 0 && (global.ProfilePolicy == ACURoutingPolicyCustom || tokenScope.ProfilePolicy == ACURoutingPolicyCustom) {
		return result, fmt.Errorf("ACU profile allowlist intersection is empty")
	}
	if len(result.AllowedProfileIDs) > 0 {
		allowedProfiles := make(map[string]struct{}, len(result.AllowedProfileIDs))
		for _, profileID := range result.AllowedProfileIDs {
			allowedProfiles[profileID] = struct{}{}
		}
		for profileID := range result.ProfilePreferenceScores {
			if _, ok := allowedProfiles[profileID]; !ok {
				delete(result.ProfilePreferenceScores, profileID)
			}
		}
	}
	digest := sha256.Sum256([]byte(result.RoutingPolicy + "\n" + strings.Join(result.AllowedModelIDs, ",") + "\n" + strings.Join(result.AllowedProfileIDs, ",") + "\n" + strings.Join(result.AllowedCandidateIDs, ",") + "\n" + result.RoutingPreference))
	result.RoutingPolicyVersion = "acu-user-policy-v2-" + hex.EncodeToString(digest[:8])
	utilityRaw, err := common.Marshal(map[string]interface{}{
		"schemaVersion": utilityConfig.SchemaVersion, "qualityBias": result.QualityBias,
		"modelFormulaVersion": acuModelFormulaVersion, "profileFormulaVersion": acuProfileFormulaVersion,
		"qualitySatisfactionVersion": acuQualitySatisfactionVersion,
		"normalizationVersion":       "acu-benefit-range-v1",
		"supplyStrategy":             result.SupplyStrategy, "supplyWeights": supplyWeights,
		"acuHighBiasOffset": result.ACUHighBiasOffset, "modelCostLogScale": result.ModelCostLogScale,
		"profileCostLogScale": result.ProfileCostLogScale, "profileSpeedLogScale": result.ProfileSpeedLogScale,
		"latency": result.LatencyPolicy, "reliability": result.ReliabilityPolicy,
		"workPhaseBiasOffsets": result.WorkPhaseBiasOffsets, "formulaMode": result.FormulaMode,
		"candidatePreferenceScores": result.CandidatePreferenceScores,
		"profilePreferenceScores":   result.ProfilePreferenceScores,
	})
	if err != nil {
		return result, err
	}
	utilityDigest := sha256.Sum256(utilityRaw)
	result.RoutingUtilityVersion = "acu-routing-utility-v1-" + hex.EncodeToString(utilityDigest[:8])
	return result, nil
}

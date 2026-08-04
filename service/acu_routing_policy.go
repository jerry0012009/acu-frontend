package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	ACURoutingPolicyAll    = "all_routing_eligible"
	ACURoutingPolicyCustom = "custom_allowlist"
)

type ACURoutingScope struct {
	Policy            string   `json:"modelPolicy"`
	AllowedModelIDs   []string `json:"allowedModelIds"`
	ProfilePolicy     string   `json:"profilePolicy"`
	AllowedProfileIDs []string `json:"allowedProfileIds"`
}

type ACUEffectiveRoutingPolicy struct {
	RoutingPolicy        string
	AllowedModelIDs      []string
	AllowedProfileIDs    []string
	RoutingPreference    string
	RoutingPolicyVersion string
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

func GetACUGlobalRoutingScope() (ACURoutingScope, error) {
	return globalACURoutingScope()
}

func ValidateACURoutingScopeAgainstPool(ctx context.Context, scope ACURoutingScope) error {
	if scope.Policy != ACURoutingPolicyCustom && scope.ProfilePolicy != ACURoutingPolicyCustom {
		return nil
	}
	monitor, err := GetACUChannelMonitor(ctx, "24h")
	if err != nil {
		if strings.Contains(err.Error(), "not configured") {
			return nil
		}
		return err
	}
	models := make(map[string]struct{}, len(monitor.ModelPool))
	for _, item := range monitor.ModelPool {
		if modelID, ok := item["modelId"].(string); ok {
			models[modelID] = struct{}{}
		}
	}
	profiles := make(map[string]string, len(monitor.Profiles))
	for _, profile := range monitor.Profiles {
		if profile.ExecutionProfileID != "" {
			profiles[profile.ExecutionProfileID] = profile.CanonicalModel
		}
	}
	for _, modelID := range scope.AllowedModelIDs {
		if _, ok := models[modelID]; !ok {
			return fmt.Errorf("ACU model %q is not present in the current Router model pool", modelID)
		}
	}
	for _, profileID := range scope.AllowedProfileIDs {
		modelID, ok := profiles[profileID]
		if !ok {
			return fmt.Errorf("ACU Profile %q is not present in the current Router model pool", profileID)
		}
		if scope.Policy == ACURoutingPolicyCustom {
			if _, ok := models[modelID]; !ok {
				return fmt.Errorf("ACU Profile %q references unknown model %q", profileID, modelID)
			}
			allowed := false
			for _, allowedModel := range scope.AllowedModelIDs {
				if allowedModel == modelID {
					allowed = true
					break
				}
			}
			if !allowed {
				return fmt.Errorf("ACU Profile %q belongs to model %q outside the model allowlist", profileID, modelID)
			}
		}
	}
	return nil
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
	result := ACUEffectiveRoutingPolicy{RoutingPolicy: ACURoutingPolicyAll, AllowedModelIDs: []string{}, AllowedProfileIDs: []string{}, RoutingPreference: preference}
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
	digest := sha256.Sum256([]byte(result.RoutingPolicy + "\n" + strings.Join(result.AllowedModelIDs, ",") + "\n" + strings.Join(result.AllowedProfileIDs, ",") + "\n" + result.RoutingPreference))
	result.RoutingPolicyVersion = "acu-user-policy-v2-" + hex.EncodeToString(digest[:8])
	return result, nil
}

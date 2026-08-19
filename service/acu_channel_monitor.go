package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func acuRouterAdminRequest(ctx context.Context, method, path string, body []byte, headers ...map[string]string) (*http.Response, error) {
	return acuRouterAdminRequestWithTimeout(ctx, 20*time.Second, method, path, body, headers...)
}

func acuRouterAdminRequestWithTimeout(
	ctx context.Context,
	timeout time.Duration,
	method, path string,
	body []byte,
	headers ...map[string]string,
) (*http.Response, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("ACU_ROUTER_INTERNAL_URL")), "/")
	token := strings.TrimSpace(os.Getenv("ACU_ADMIN_TRACE_TOKEN"))
	if baseURL == "" || token == "" {
		return nil, errors.New("ACU Channel Monitor is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if len(headers) > 0 {
		for name, value := range headers[0] {
			req.Header.Set(name, value)
		}
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: timeout}).Do(req)
}

func GetACUChannelMonitor(ctx context.Context, rangeValue, supplyStrategy, scenario, probeRange string) (dto.ACUChannelMonitor, error) {
	if rangeValue != "1h" && rangeValue != "6h" && rangeValue != "24h" && rangeValue != "7d" {
		rangeValue = "24h"
	}
	if supplyStrategy != "balanced" && supplyStrategy != "lowest_cost" && supplyStrategy != "low_latency" && supplyStrategy != "high_reliability" {
		supplyStrategy = "balanced"
	}
	if scenario != "small" && scenario != "standard" && scenario != "long" {
		scenario = "standard"
	}
	if probeRange != "24h" && probeRange != "48h" && probeRange != "7d" {
		probeRange = "48h"
	}
	query := url.Values{}
	query.Set("range", rangeValue)
	query.Set("supplyStrategy", supplyStrategy)
	query.Set("scenario", scenario)
	query.Set("probeRange", probeRange)
	config, err := GetACURoutingUtilityConfig()
	if err != nil {
		return dto.ACUChannelMonitor{}, err
	}
	utilityPolicy, err := common.Marshal(map[string]interface{}{
		"formulaMode": config.FormulaMode, "qualityBias": config.QualityPresets["balanced"],
		"supplyStrategy": supplyStrategy, "supplyWeights": config.SupplyPresets[supplyStrategy],
		"acuHighBiasOffset": config.ACUHighBiasOffset, "modelCostLogScale": config.ModelCostLogScale,
		"profileCostLogScale": config.ProfileCostLogScale, "profileSpeedLogScale": config.ProfileSpeedLogScale,
		"latency": config.Latency, "reliability": config.Reliability,
		"allowedCandidateIds": []string{}, "candidatePreferenceScores": map[string]int{},
		"profilePreferenceScores": config.DefaultProfilePreferenceScores,
		"routingUtilityVersion":   config.SchemaVersion, "workPhaseBiasOffsets": config.WorkPhaseBiasOffsets,
	})
	if err != nil {
		return dto.ACUChannelMonitor{}, err
	}
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/channel-monitor?"+query.Encode(),
		nil,
		map[string]string{"X-ACU-Monitor-Routing-Utility-Policy": string(utilityPolicy)},
	)
	if err != nil {
		return dto.ACUChannelMonitor{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUChannelMonitor{}, fmt.Errorf("ACU Channel Monitor returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUChannelMonitor
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return result, err
	}
	result.DefaultCandidatePreferenceScores = config.DefaultCandidatePreferenceScores
	return result, nil
}

func GetACURoutingCatalog(ctx context.Context) (dto.ACURoutingCatalog, error) {
	monitor, err := GetACUChannelMonitor(ctx, "24h", "balanced", "standard", "48h")
	if err != nil {
		return dto.ACURoutingCatalog{}, err
	}
	models := make([]dto.ACURoutingCatalogModel, 0, len(monitor.ModelPool))
	for _, value := range monitor.ModelPool {
		if stringValue(value, "modelCategory") != "text_agent" ||
			!boolValue(value, "autoRouteEnabled") ||
			!isRoutingCatalogVerificationStatus(stringValue(value, "verificationStatus")) {
			continue
		}
		models = append(models, dto.ACURoutingCatalogModel{
			ModelID:            stringValue(value, "modelId"),
			Vendor:             stringValue(value, "vendor"),
			ModelCategory:      stringValue(value, "modelCategory"),
			CapabilityTier:     stringValue(value, "capabilityTier"),
			Protocols:          stringSlice(value["protocols"]),
			VerificationStatus: stringValue(value, "verificationStatus"),
			AutoRouteEnabled:   boolValue(value, "autoRouteEnabled"),
			RoutingCandidates:  routingCatalogCandidates(value["routingCandidates"]),
		})
	}
	profiles := make([]dto.ACURoutingCatalogProfile, 0, len(monitor.Profiles))
	for _, profile := range monitor.Profiles {
		if !profile.Enabled || !profile.AdministratorAllowed || !profile.AutoRouteEnabled {
			continue
		}
		profiles = append(profiles, dto.ACURoutingCatalogProfile{
			ExecutionProfileID:        profile.ExecutionProfileID,
			CanonicalModel:            profile.CanonicalModel,
			Protocol:                  append([]string(nil), profile.Protocol...),
			SupportedReasoningEfforts: append([]string(nil), profile.SupportedReasoningEfforts...),
		})
	}
	return dto.ACURoutingCatalog{
		Models:                           models,
		Profiles:                         profiles,
		DefaultCandidatePreferenceScores: monitor.DefaultCandidatePreferenceScores,
	}, nil
}

func isRoutingCatalogVerificationStatus(value string) bool {
	return value == "verified" || value == "verified_provisional"
}

func stringSlice(value interface{}) []string {
	values, ok := value.([]interface{})
	if !ok {
		if typed, typedOK := value.([]string); typedOK {
			return append([]string(nil), typed...)
		}
		return []string{}
	}
	result := make([]string, 0, len(values))
	for _, item := range values {
		if text, ok := item.(string); ok && text != "" {
			result = append(result, text)
		}
	}
	return result
}

func routingCatalogCandidates(value interface{}) []dto.ACURoutingCatalogCandidate {
	values, ok := value.([]interface{})
	if !ok {
		return []dto.ACURoutingCatalogCandidate{}
	}
	result := make([]dto.ACURoutingCatalogCandidate, 0, len(values))
	for _, item := range values {
		candidate, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		result = append(result, dto.ACURoutingCatalogCandidate{
			CandidateID:       stringValue(candidate, "candidateId"),
			ModelID:           stringValue(candidate, "modelId"),
			DisplayName:       stringValue(candidate, "displayName"),
			Kind:              stringValue(candidate, "kind"),
			PresetID:          stringValue(candidate, "presetId"),
			ReasoningEffort:   stringValue(candidate, "reasoningEffort"),
			CalibrationStatus: stringValue(candidate, "calibrationStatus"),
			Protocols:         stringSlice(candidate["protocols"]),
		})
	}
	return result
}

func normalizedACUSelectionProtocol(protocol string) string {
	if protocol == "messages" {
		return "messages"
	}
	return "responses"
}

func buildACUSelectionCorridorBody(inputTokens, expectedOutputTokens int, policy *ACUEffectiveRoutingPolicy, includeCandidatePreferenceScores bool, protocols ...string) ([]byte, error) {
	protocol := "responses"
	if len(protocols) > 0 {
		protocol = normalizedACUSelectionProtocol(protocols[0])
	}
	payload := map[string]interface{}{
		"inputTokens": inputTokens, "expectedOutputTokens": expectedOutputTokens,
		"protocol":        protocol,
		"allowedModelIds": policy.AllowedModelIDs, "allowedProfileIds": policy.AllowedProfileIDs,
		"allowedCandidateIds": policy.AllowedCandidateIDs,
		"routingPreference":   policy.RoutingPreference, "qualityBias": policy.QualityBias,
		"qualityPresets":    policy.QualityPresets,
		"supplyStrategy":    policy.SupplyStrategy,
		"supplyWeights":     ACUSupplyWeights{Cost: policy.SupplyCostWeight, Speed: policy.SupplySpeedWeight, Reliability: policy.SupplyReliabilityWeight},
		"acuHighBiasOffset": policy.ACUHighBiasOffset, "modelCostLogScale": policy.ModelCostLogScale,
		"profileCostLogScale": policy.ProfileCostLogScale, "profileSpeedLogScale": policy.ProfileSpeedLogScale,
		"latencyPolicy": policy.LatencyPolicy, "reliabilityPolicy": policy.ReliabilityPolicy,
		"workPhaseBiasOffsets": policy.WorkPhaseBiasOffsets,
		"routeMode":            "acu-auto", "routingUtilityVersion": policy.RoutingUtilityVersion,
		"formulaMode":             policy.FormulaMode,
		"profilePreferenceScores": policy.ProfilePreferenceScores,
	}
	if includeCandidatePreferenceScores {
		payload["candidatePreferenceScores"] = policy.CandidatePreferenceScores
	}
	return common.Marshal(payload)
}

func GetACUSelectionCorridor(ctx context.Context, inputTokens, expectedOutputTokens int, policy *ACUEffectiveRoutingPolicy, protocols ...string) (map[string]interface{}, error) {
	protocol := "responses"
	if len(protocols) > 0 {
		protocol = normalizedACUSelectionProtocol(protocols[0])
	}
	path := fmt.Sprintf(
		"/internal/admin/selection-corridor?inputTokens=%d&expectedOutputTokens=%d&protocol=%s",
		inputTokens,
		expectedOutputTokens,
		protocol,
	)
	method := http.MethodGet
	var body []byte
	if policy != nil {
		method = http.MethodPost
		var err error
		body, err = buildACUSelectionCorridorBody(inputTokens, expectedOutputTokens, policy, true, protocol)
		if err != nil {
			return nil, err
		}
	}
	response, err := acuRouterAdminRequestWithTimeout(
		ctx,
		45*time.Second,
		method,
		path,
		body,
	)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, readErr
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ACU selection corridor returned HTTP %d", response.StatusCode)
	}
	result := map[string]interface{}{}
	if err := common.DecodeJson(bytes.NewReader(responseBody), &result); err != nil {
		return nil, err
	}
	return result, nil
}

func PauseACUChannel(ctx context.Context, input dto.ACUChannelPauseRequest, actor string) (dto.ACUChannelPauseResult, error) {
	if input.DurationMinutes != 30 && input.DurationMinutes != 120 {
		return dto.ACUChannelPauseResult{}, errors.New("pause duration must be 30 or 120 minutes")
	}
	payload, err := common.Marshal(map[string]interface{}{"channelId": input.ChannelID, "durationMinutes": input.DurationMinutes, "actor": actor})
	if err != nil {
		return dto.ACUChannelPauseResult{}, err
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodPost, "/internal/admin/channel-monitor", payload)
	if err != nil {
		return dto.ACUChannelPauseResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUChannelPauseResult{}, fmt.Errorf("ACU Channel pause returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUChannelPauseResult
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return result, err
	}
	return result, nil
}

func acuExecutionProfileRequest(
	ctx context.Context,
	method string,
	path string,
	payload map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequestWithTimeout(ctx, 20*time.Second, method, path, payload)
}

func acuExecutionProfileRequestWithTimeout(
	ctx context.Context,
	timeout time.Duration,
	method string,
	path string,
	payload map[string]interface{},
) (map[string]interface{}, error) {
	var body []byte
	var err error
	if payload != nil {
		body, err = common.Marshal(payload)
		if err != nil {
			return nil, err
		}
	}
	response, err := acuRouterAdminRequestWithTimeout(ctx, timeout, method, path, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var failure struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if common.DecodeJson(bytes.NewReader(responseBody), &failure) == nil &&
			strings.TrimSpace(failure.Error.Message) != "" {
			return nil, errors.New(failure.Error.Message)
		}
		return nil, fmt.Errorf("ACU execution profile request returned HTTP %d", response.StatusCode)
	}
	result := map[string]interface{}{}
	if err := common.DecodeJson(bytes.NewReader(responseBody), &result); err != nil {
		return nil, err
	}
	return result, nil
}

func GetACUExecutionProfiles(ctx context.Context) (map[string]interface{}, error) {
	return acuExecutionProfileRequest(ctx, http.MethodGet, "/internal/admin/execution-profiles", nil)
}

func CreateACUExecutionProfile(
	ctx context.Context,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequest(ctx, http.MethodPost, "/internal/admin/execution-profiles", input)
}

func UpdateACUExecutionProfile(
	ctx context.Context,
	id string,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequest(
		ctx,
		http.MethodPut,
		"/internal/admin/execution-profiles/"+url.PathEscape(id),
		input,
	)
}

func ProbeACUExecutionProfile(
	ctx context.Context,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequest(
		ctx,
		http.MethodPost,
		"/internal/admin/execution-profiles/probe",
		input,
	)
}

func ApplyACUExecutionProfiles(ctx context.Context) (map[string]interface{}, error) {
	return acuExecutionProfileRequest(
		ctx,
		http.MethodPost,
		"/internal/admin/execution-profiles/apply",
		nil,
	)
}

func QuickAddACUProviderDiscover(
	ctx context.Context,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequestWithTimeout(
		ctx,
		20*time.Second,
		http.MethodPost,
		"/internal/admin/execution-profiles/quick-add/discover",
		input,
	)
}

func QuickAddACUProviderProbe(
	ctx context.Context,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequestWithTimeout(
		ctx,
		60*time.Second,
		http.MethodPost,
		"/internal/admin/execution-profiles/quick-add/probe",
		input,
	)
}

func QuickAddACUProviderSave(
	ctx context.Context,
	input map[string]interface{},
) (map[string]interface{}, error) {
	return acuExecutionProfileRequestWithTimeout(
		ctx,
		20*time.Second,
		http.MethodPost,
		"/internal/admin/execution-profiles/quick-add/save",
		input,
	)
}

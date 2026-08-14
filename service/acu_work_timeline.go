package service

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

func GetOwnedACUWorkTimeline(userID int, from, to int64) (dto.ACUWorkTimeline, error) {
	logs, err := model.GetUserACUTimelineLogs(userID, from, to)
	if err != nil {
		return dto.ACUWorkTimeline{}, err
	}
	return buildACUWorkTimeline(logs, from, to), nil
}

func buildACUWorkTimeline(logs []*model.Log, from, to int64) dto.ACUWorkTimeline {
	byRequest := map[string]dto.ACUWorkTimelineItem{}
	for _, log := range logs {
		var other map[string]interface{}
		if common.Unmarshal([]byte(log.Other), &other) != nil {
			continue
		}
		logicalID := stringValue(other, "acu_logical_request_id")
		breakdown, _ := other["acu_cost_breakdown"].(map[string]interface{})
		if logicalID == "" || breakdown == nil {
			continue
		}
		breakdown = timelineBreakdownWithJudgeTelemetry(breakdown, mapValue(mapValue(other, "admin_info"), "acu_cost_breakdown"))
		billingStatus := stringValue(other, "acu_billing_status")
		attempts, _ := breakdown["channel_attempts"].([]interface{})
		decision := mapValue(breakdown, "decision_summary")
		firstLatency, totalLatency, errorClass, cooldown := attemptFields(attempts)
		status := stringValue(breakdown, "logical_request_status")
		if status == "success" {
			status = "completed"
		}
		if status == "error" {
			status = "failed"
		}
		if status == "" {
			status = "completed"
			if log.Type == model.LogTypeError {
				status = "failed"
			}
		}
		hasFailure, hasSuccess := attemptTerminalStates(attempts)
		if status == "completed" && hasFailure && hasSuccess {
			status = "completed_with_recovery"
		}
		judgeModel := stringValue(breakdown, "judge_model")
		userCharge, userChargeFound := preferredNumber(other, breakdown, "user_charge_cny")
		if billingStatus == "" {
			if userChargeFound {
				billingStatus = "finalized"
			} else {
				billingStatus = "pending"
			}
		}
		actualCashCost, actualCashCostFound := preferredNumber(other, breakdown, "actual_total_cash_cost_cny")
		judgeCost, _ := preferredNumber(other, breakdown, "judge_cash_cost_cny")
		providerCost, _ := preferredNumber(other, breakdown, "effective_provider_cash_cost_cny")
		failedAttemptCost, _ := preferredNumber(other, breakdown, "failed_attempt_cash_cost_cny")
		failedJudgeAttemptCost, _ := preferredNumber(other, breakdown, "failed_judge_attempt_cash_cost_cny")
		providerUserCharge, _ := preferredNumber(other, breakdown, "provider_user_charge_cny")
		judgeUserCharge, _ := preferredNumber(other, breakdown, "judge_user_charge_cny")
		judgeAttempts, _ := breakdown["judge_attempts"].([]interface{})
		routeDecision := mapValue(breakdown, "route_decision")
		routingQualityTarget := numberPointer(routeDecision, "effective_quality_target")
		legacyCost := 0.0
		if userChargeFound {
			legacyCost = userCharge
		} else if actualCashCostFound {
			legacyCost = actualCashCost
		}
		var userChargeValue, actualCashCostValue *float64
		if userChargeFound {
			userChargeValue = &userCharge
		}
		if actualCashCostFound {
			actualCashCostValue = &actualCashCost
		}
		endToEndLatency, latencySource := reportedLatency(breakdown)
		_, judgeFirstAttemptRecorded := boolValueOf(decision["judge_first_attempt_succeeded"])
		judgeStatus := stringValue(decision, "judge_status")
		judgeResultSource := stringValue(decision, "judge_result_source")
		difficulty, difficultyRecorded := numberValueOf(breakdown["difficulty"])
		item := dto.ACUWorkTimelineItem{
			Timestamp: log.CreatedAt, LogicalRequestID: logicalID,
			SessionID: stringValue(breakdown, "session_id"), TaskID: stringValue(breakdown, "task_id"), SegmentID: stringValue(breakdown, "segment_id"),
			JudgeCalled: numberValue(breakdown, "judge_calls") > 0, JudgeReused: boolValue(breakdown, "judge_reused"),
			PointID: logicalID + ":execution", PointType: "execution",
			JudgeModel: judgeModel,
			Difficulty: difficulty, DifficultyRecorded: difficultyRecorded, RequestedModel: stringValue(breakdown, "requested_model"),
			ActualModel: firstTimelineValue(stringValue(breakdown, "canonical_model"), log.ModelName),
			Provider:    firstTimelineValue(stringValue(breakdown, "actual_provider"), stringValue(other, "actual_provider")),
			Channel:     firstTimelineValue(stringValue(breakdown, "channel_id"), stringValue(other, "actual_channel")),
			Protocol:    stringValue(breakdown, "protocol"), Status: status,
			BillingStatus: billingStatus, BillingErrorCode: stringValue(other, "acu_finalize_error_code"),
			FirstModelEventLatencyMs:  firstLatency,
			EndToEndLatencyMs:         endToEndLatency,
			LatencySource:             latencySource,
			JudgeLatencyMs:            int(numberValue(breakdown, "judge_latency_ms")),
			ProviderLatencyMs:         firstPositiveInt(int(numberValue(breakdown, "provider_latency_ms")), totalLatency),
			UserChargeCNY:             userChargeValue,
			ActualCashCostCNY:         actualCashCostValue,
			ActualCostCNY:             legacyCost,
			JudgeCostCNY:              judgeCost,
			ProviderCostCNY:           providerCost,
			FailedAttemptCostCNY:      failedAttemptCost,
			FailedJudgeAttemptCostCNY: failedJudgeAttemptCost,
			ProviderUserChargeCNY:     providerUserCharge, JudgeUserChargeCNY: judgeUserCharge,
			JudgeProtocol: stringValue(breakdown, "judge_protocol"), JudgeReasoningEffort: stringValue(breakdown, "judge_reasoning_effort"),
			JudgeProfileSelection: timelineJudgeProfileSelection(mapValue(breakdown, "judge_profile_selection")),
			JudgeAttempts:         timelineJudgeAttempts(judgeAttempts),
			ErrorClass:            errorClass, CooldownUntil: cooldown,
			WorkPhase:                    firstTimelineValue(stringValue(decision, "work_phase"), stringValue(breakdown, "phase")),
			WorkPhaseQualityTargetOffset: numberValue(decision, "work_phase_quality_target_offset"),
			RoutingQualityTarget:         routingQualityTarget,
			JudgeTrigger:                 firstTimelineValue(stringValue(decision, "judge_trigger"), stringValue(breakdown, "judge_trigger")),
			JudgeStatus:                  judgeStatus, JudgeResultSource: judgeResultSource,
			JudgeFirstAttemptSucceeded:     boolValue(decision, "judge_first_attempt_succeeded"),
			JudgeFirstAttemptRecorded:      judgeFirstAttemptRecorded,
			JudgeFallbackRecorded:          judgeResultSource != "" || judgeStatus != "",
			JudgeProfileAttemptCount:       int(numberValue(decision, "judge_profile_attempt_count")),
			JudgeSameModelFailoverUsed:     boolValue(decision, "judge_same_model_failover_used"),
			SelectedCandidateID:            firstTimelineValue(stringValue(decision, "selected_candidate_id"), stringValue(breakdown, "selected_model")),
			SelectedDisplayName:            firstTimelineValue(stringValue(decision, "selected_display_name"), stringValue(breakdown, "selected_model")),
			SelectedExecutionPresetID:      stringValue(decision, "selected_execution_preset_id"),
			ClientRequestedReasoningEffort: stringValue(decision, "client_requested_reasoning_effort"),
			PresetReasoningEffort:          stringValue(decision, "preset_reasoning_effort"),
			ResolvedReasoningEffort:        firstTimelineValue(stringValue(decision, "resolved_reasoning_effort"), stringValue(breakdown, "reasoning_effort")),
			ReasoningMappingStatus:         stringValue(decision, "reasoning_mapping_status"),
			InputTokens:                    int64(log.PromptTokens), CachedInputTokens: int64(numberValue(other, "cached_input_tokens")),
			OutputTokens: int64(log.CompletionTokens), ReasoningTokens: int64(numberValue(other, "reasoning_tokens")),
			CacheHitRatio:          numberValue(decision, "cache_hit_ratio"),
			ProfileAttemptCount:    int(numberValue(decision, "profile_attempt_count")),
			RecoveryDecisionReason: stringValue(decision, "recovery_decision_reason"),
			RouteRefreshReason:     firstTimelineValue(stringValue(decision, "route_refresh_reason"), stringValue(breakdown, "route_refresh_reason")),
			TopCandidates:          timelineCandidates(decision), ProviderAttempts: timelineAttempts(attempts),
		}
		if previous, exists := byRequest[logicalID]; !exists || timelineItemIsMoreFinal(item, previous, log.Type) {
			byRequest[logicalID] = item
		}
	}
	items := make([]dto.ACUWorkTimelineItem, 0, len(byRequest)*2)
	for _, item := range byRequest {
		createJudgePoint := item.JudgeProtocol != "" && !item.JudgeReused &&
			(item.JudgeCalled || item.JudgeResultSource == "disk_cache" || item.JudgeResultSource == "rules_strategy")
		if createJudgePoint {
			judge := item
			judgeModel, judgeProvider, judgeChannel, judgeProfile := judgeIdentity(item.JudgeAttempts)
			judge.PointID = item.LogicalRequestID + ":judge"
			judge.PointType = "judge"
			if judgeModel != "" {
				judge.JudgeModel = judgeModel
				judge.ActualModel = judgeModel
			}
			if judgeProvider != "" {
				judge.Provider = judgeProvider
			}
			if judgeChannel != "" {
				judge.Channel = judgeChannel
			}
			if judgeProfile != "" {
				judge.JudgeProfileSelection.SelectedExecutionProfileID = judgeProfile
			}
			judge.UserChargeCNY = floatPointer(item.JudgeUserChargeCNY)
			judge.ActualCashCostCNY = floatPointer(item.JudgeCostCNY)
			judge.Status = judgePointStatus(item)
			judge.EndToEndLatencyMs = item.JudgeLatencyMs
			judge.ProviderLatencyMs = 0
			judge.FirstModelEventLatencyMs = 0
			judge.ProviderAttempts = nil
			judge.TopCandidates = nil
			judge.InputTokens = int64(sumJudgeTokens(item.JudgeAttempts, "input"))
			judge.CachedInputTokens = int64(sumJudgeTokens(item.JudgeAttempts, "cached"))
			judge.OutputTokens = int64(sumJudgeTokens(item.JudgeAttempts, "output"))
			judge.CacheHitRatio = floatRatio(judge.CachedInputTokens, judge.InputTokens)
			items = append(items, judge)
		}
		if item.JudgeProtocol != "" {
			item.UserChargeCNY = floatPointer(item.ProviderUserChargeCNY)
			item.ActualCashCostCNY = floatPointer(item.ProviderCostCNY + item.FailedAttemptCostCNY)
			item.EndToEndLatencyMs = item.ProviderLatencyMs
		}
		item.JudgeAttempts = nil
		item.JudgeProfileSelection = dto.ACUJudgeProfileSelection{}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Timestamp != items[j].Timestamp {
			return items[i].Timestamp < items[j].Timestamp
		}
		if items[i].LogicalRequestID != items[j].LogicalRequestID {
			return items[i].LogicalRequestID < items[j].LogicalRequestID
		}
		return items[i].PointType == "judge" && items[j].PointType == "execution"
	})
	latencies := make([]int, 0, len(items))
	completed, judgeCalls, executionSteps, judgeEvaluations := 0, 0, 0, 0
	judgeFirstSuccess, judgeFirstSamples := 0, 0
	rulesFallback, rulesFallbackSamples := 0, 0
	totalUserCharge, totalActualCashCost, legacyTotalCost := 0.0, 0.0, 0.0
	unsettledRequests := 0
	totalInput, totalCached := int64(0), int64(0)
	sequenceByTask := map[string]int{}
	for i := range items {
		sequenceByTask[items[i].TaskID]++
		items[i].Sequence = sequenceByTask[items[i].TaskID]
		if items[i].PointType == "execution" {
			legacyTotalCost += items[i].ActualCostCNY
		}
		if items[i].BillingStatus == "finalized" && items[i].UserChargeCNY != nil {
			totalUserCharge += *items[i].UserChargeCNY
		}
		if items[i].PointType == "execution" && items[i].BillingStatus == "unsettled" {
			unsettledRequests++
		}
		if items[i].ActualCashCostCNY != nil {
			totalActualCashCost += *items[i].ActualCashCostCNY
		}
		if items[i].PointType == "execution" {
			executionSteps++
		}
		isJudgeEvaluation := items[i].PointType == "judge" || (items[i].JudgeProtocol == "" && items[i].JudgeCalled)
		if isJudgeEvaluation {
			judgeEvaluations++
		}
		if items[i].PointType == "execution" && (items[i].Status == "completed" || items[i].Status == "completed_with_recovery") {
			completed++
		}
		if isJudgeEvaluation {
			judgeCalls++
			if items[i].JudgeFirstAttemptRecorded {
				judgeFirstSamples++
				if items[i].JudgeFirstAttemptSucceeded {
					judgeFirstSuccess++
				}
			}
			if items[i].JudgeFallbackRecorded {
				rulesFallbackSamples++
				if items[i].JudgeResultSource == "rules_strategy" || items[i].JudgeStatus == "rules_fallback" {
					rulesFallback++
				}
			}
		}
		if items[i].PointType == "execution" {
			totalInput += items[i].InputTokens
			totalCached += items[i].CachedInputTokens
		}
		if items[i].FirstModelEventLatencyMs > 0 {
			latencies = append(latencies, items[i].FirstModelEventLatencyMs)
		}
	}
	sort.Ints(latencies)
	return dto.ACUWorkTimeline{From: from, To: to, Items: items, Summary: dto.ACUWorkTimelineSummary{
		APISteps: executionSteps, ExecutionSteps: executionSteps, JudgeEvaluations: judgeEvaluations,
		PlatformRetryCostCNY: itemsPlatformRetryCost(items), JudgeFirstAttemptSuccessRate: ratio(judgeFirstSuccess, judgeFirstSamples),
		JudgeFirstAttemptSuccessSamples: judgeFirstSamples, JudgeCalledRequests: judgeCalls,
		JudgeRulesFallbackRate: ratio(rulesFallback, rulesFallbackSamples), JudgeRulesFallbackSamples: rulesFallbackSamples,
		CompletionRate: ratio(completed, executionSteps), CacheHitRate: floatRatio(totalCached, totalInput),
		TotalUserChargeCNY: totalUserCharge, TotalActualCashCostCNY: totalActualCashCost, UnsettledRequests: unsettledRequests,
		ActualTotalCostCNY: legacyTotalCost, P50FirstModelEventLatencyMs: percentile(latencies, .5), P95FirstModelEventLatencyMs: percentile(latencies, .95),
	}}
}

// PublicACUWorkTimeline projects the internally built timeline for a regular
// user's /self response. Ownership is enforced before this projection.
func PublicACUWorkTimeline(timeline dto.ACUWorkTimeline) dto.ACUWorkTimeline {
	for index := range timeline.Items {
		item := &timeline.Items[index]
		item.Provider = ""
		item.Channel = ""
		item.JudgeModel = ""
		item.ActualCashCostCNY = nil
		item.ActualCostCNY = 0
		item.JudgeCostCNY = 0
		item.ProviderCostCNY = 0
		item.FailedAttemptCostCNY = 0
		item.FailedJudgeAttemptCostCNY = 0
		item.ProviderUserChargeCNY = 0
		item.JudgeUserChargeCNY = 0
		item.JudgeProfileSelection = dto.ACUJudgeProfileSelection{}
		item.JudgeAttempts = nil
		item.ProviderAttempts = nil
		for candidateIndex := range item.TopCandidates {
			item.TopCandidates[candidateIndex].EstimatedCallCost = 0
		}
	}
	timeline.Summary.ActualTotalCostCNY = 0
	timeline.Summary.PlatformRetryCostCNY = 0
	timeline.Summary.TotalActualCashCostCNY = 0
	return timeline
}

func judgeIdentity(values []dto.ACUTimelineJudgeAttempt) (string, string, string, string) {
	var last dto.ACUTimelineJudgeAttempt
	for _, attempt := range values {
		last = attempt
		if attempt.Status == "success" {
			return attempt.Model, attempt.Provider, attempt.ChannelID, attempt.ExecutionProfileID
		}
	}
	return last.Model, last.Provider, last.ChannelID, last.ExecutionProfileID
}

func floatPointer(value float64) *float64 { return &value }

func judgePointStatus(item dto.ACUWorkTimelineItem) string {
	if item.JudgeResultSource == "rules_strategy" || item.JudgeStatus == "rules_fallback" {
		return "rules_fallback"
	}
	for _, attempt := range item.JudgeAttempts {
		if attempt.Status == "success" {
			return "completed"
		}
	}
	if item.JudgeResultSource == "disk_cache" {
		return "completed"
	}
	return "failed"
}

func sumJudgeTokens(attempts []dto.ACUTimelineJudgeAttempt, kind string) int {
	total := int64(0)
	for _, attempt := range attempts {
		switch kind {
		case "input":
			total += attempt.InputTokens
		case "cached":
			total += attempt.CachedInputTokens
		case "output":
			total += attempt.OutputTokens
		}
	}
	return int(total)
}

func itemsPlatformRetryCost(items []dto.ACUWorkTimelineItem) float64 {
	total := 0.0
	for _, item := range items {
		if item.PointType == "execution" {
			total += item.FailedAttemptCostCNY + item.FailedJudgeAttemptCostCNY
		}
	}
	return total
}

func mapValue(value map[string]interface{}, key string) map[string]interface{} {
	result, _ := value[key].(map[string]interface{})
	return result
}

func timelineBreakdownWithJudgeTelemetry(public, admin map[string]interface{}) map[string]interface{} {
	if admin == nil {
		return public
	}
	result := make(map[string]interface{}, len(public)+5)
	for key, value := range public {
		result[key] = value
	}
	for _, key := range []string{
		"judge_model", "judge_protocol", "judge_reasoning_effort",
		"judge_profile_selection", "judge_attempts",
	} {
		if _, exists := result[key]; !exists {
			if value, available := admin[key]; available {
				result[key] = value
			}
		}
	}
	adminDecision := mapValue(admin, "decision_summary")
	if adminDecision == nil {
		return result
	}
	publicDecision := mapValue(public, "decision_summary")
	decision := make(map[string]interface{}, len(publicDecision)+5)
	for key, value := range publicDecision {
		decision[key] = value
	}
	for _, key := range []string{
		"judge_status", "judge_result_source", "judge_first_attempt_succeeded",
		"judge_profile_attempt_count", "judge_same_model_failover_used",
	} {
		if _, exists := decision[key]; !exists {
			if value, available := adminDecision[key]; available {
				decision[key] = value
			}
		}
	}
	result["decision_summary"] = decision
	return result
}

func timelineCandidates(decision map[string]interface{}) []dto.ACUTimelineCandidateSummary {
	values, _ := decision["top_candidates"].([]interface{})
	result := make([]dto.ACUTimelineCandidateSummary, 0, len(values))
	for _, value := range values {
		candidate, _ := value.(map[string]interface{})
		if candidate == nil {
			continue
		}
		result = append(result, dto.ACUTimelineCandidateSummary{
			CandidateID: stringValue(candidate, "candidateId"), DisplayName: stringValue(candidate, "displayName"),
			EstimatedQuality: numberValue(candidate, "estimatedQuality"), EstimatedCallCost: numberValue(candidate, "estimatedCallCost"),
			ValueUtility: numberValue(candidate, "valueUtility"), Selected: boolValue(candidate, "selected"),
		})
	}
	return result
}
func timelineAttempts(values []interface{}) []dto.ACUTimelineProviderAttempt {
	result := make([]dto.ACUTimelineProviderAttempt, 0, len(values))
	for _, value := range values {
		attempt, _ := value.(map[string]interface{})
		if attempt == nil {
			continue
		}
		result = append(result, dto.ACUTimelineProviderAttempt{
			AttemptIndex: int(numberValue(attempt, "attempt_index")), Provider: stringValue(attempt, "provider"), Channel: stringValue(attempt, "channel"),
			ExecutionProfileID: stringValue(attempt, "execution_profile_id"), Status: stringValue(attempt, "status"),
			ErrorCategory: firstTimelineValue(stringValue(attempt, "error_category"), stringValue(attempt, "error_class")),
			HTTPStatus:    int(numberValue(attempt, "http_status")), LatencyMs: int(numberValue(attempt, "latency_ms")),
		})
	}
	return result
}

func timelineJudgeProfileSelection(value map[string]interface{}) dto.ACUJudgeProfileSelection {
	return dto.ACUJudgeProfileSelection{
		FormulaVersion: stringValue(value, "formulaVersion"), SupplyStrategy: stringValue(value, "supplyStrategy"),
		CandidateCount: int(numberValue(value, "candidateCount")), SelectedExecutionProfileID: stringValue(value, "selectedExecutionProfileId"),
		SelectedProfileRank: int(numberValue(value, "selectedProfileRank")), SelectedProfileUtility: numberValue(value, "selectedProfileUtility"),
	}
}

func timelineJudgeAttempts(values []interface{}) []dto.ACUTimelineJudgeAttempt {
	result := make([]dto.ACUTimelineJudgeAttempt, 0, len(values))
	for _, value := range values {
		attempt, _ := value.(map[string]interface{})
		if attempt == nil {
			continue
		}
		result = append(result, dto.ACUTimelineJudgeAttempt{
			AttemptIndex: int(numberValue(attempt, "attempt_index")), AttemptRole: stringValue(attempt, "attempt_role"),
			Model: stringValue(attempt, "model"), Provider: stringValue(attempt, "provider"), ExecutionProfileID: stringValue(attempt, "execution_profile_id"), ChannelID: stringValue(attempt, "channel_id"),
			Status: stringValue(attempt, "status"), ErrorCategory: stringValue(attempt, "error_category"), HTTPStatus: int(numberValue(attempt, "http_status")),
			InputTokens: int64(numberValue(attempt, "input_tokens")), CachedInputTokens: int64(numberValue(attempt, "cached_input_tokens")), OutputTokens: int64(numberValue(attempt, "output_tokens")),
			LatencyMs: int(numberValue(attempt, "latency_ms")), EffectiveCostCNY: numberValue(attempt, "effective_cost_cny"), CostStatus: stringValue(attempt, "cost_status"), UsageStatus: stringValue(attempt, "usage_status"),
		})
	}
	return result
}
func floatRatio(value, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(value) / float64(total)
}

func attemptTerminalStates(values []interface{}) (bool, bool) {
	hasFailure, hasSuccess := false, false
	for _, value := range values {
		attempt, _ := value.(map[string]interface{})
		switch stringValue(attempt, "status") {
		case "error", "failed":
			hasFailure = true
		case "success", "completed":
			hasSuccess = true
		}
	}
	return hasFailure, hasSuccess
}

func timelineItemIsMoreFinal(current, previous dto.ACUWorkTimelineItem, logType int) bool {
	if current.Status == "completed" || current.Status == "completed_with_recovery" || current.Status == "cancelled" {
		return true
	}
	return previous.Status == "" || logType == model.LogTypeConsume
}

func firstPositiveInt(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func preferredNumber(primary, fallback map[string]interface{}, key string) (float64, bool) {
	if value, exists := primary[key]; exists {
		if number, valid := numberValueOf(value); valid {
			return number, true
		}
	}
	if value, exists := fallback[key]; exists {
		if number, valid := numberValueOf(value); valid {
			return number, true
		}
	}
	return 0, false
}

func numberPointer(value map[string]interface{}, key string) *float64 {
	if value == nil {
		return nil
	}
	number, valid := numberValueOf(value[key])
	if !valid {
		return nil
	}
	return &number
}

func numberValueOf(value interface{}) (float64, bool) {
	switch value := value.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	case json.Number:
		parsed, err := value.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func reportedLatency(breakdown map[string]interface{}) (int, string) {
	latency, valid := numberValueOf(breakdown["end_to_end_latency_ms"])
	if !valid || latency <= 0 {
		return 0, "unavailable"
	}
	return int(latency), "reported"
}

func attemptFields(values []interface{}) (int, int, string, string) {
	first, total, errorClass, cooldown := 0, 0, "", ""
	for _, value := range values {
		attempt, _ := value.(map[string]interface{})
		if attempt == nil {
			continue
		}
		latency := int(numberValue(attempt, "latency_ms"))
		total += latency
		if first == 0 {
			first = int(numberValue(attempt, "first_model_event_latency_ms"))
		}
		if v := stringValue(attempt, "error_class"); v != "" {
			errorClass = v
		}
		if v := stringValue(attempt, "cooldown_until"); v != "" {
			cooldown = v
		}
	}
	return first, total, errorClass, cooldown
}
func stringValue(value map[string]interface{}, key string) string {
	if v, ok := value[key].(string); ok {
		return v
	}
	return ""
}
func numberValue(value map[string]interface{}, key string) float64 {
	v, _ := numberValueOf(value[key])
	return v
}
func boolValue(value map[string]interface{}, key string) bool { v, _ := value[key].(bool); return v }
func boolValueOf(value interface{}) (bool, bool) {
	result, valid := value.(bool)
	return result, valid
}
func firstTimelineValue(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
func ratio(value, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(value) / float64(total)
}
func percentile(values []int, p float64) int {
	if len(values) == 0 {
		return 0
	}
	index := int(float64(len(values)-1)*p + .5)
	return values[index]
}

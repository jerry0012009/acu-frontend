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
		actualCashCost, actualCashCostFound := preferredNumber(other, breakdown, "actual_total_cash_cost_cny")
		judgeCost, _ := preferredNumber(other, breakdown, "judge_cash_cost_cny")
		providerCost, _ := preferredNumber(other, breakdown, "effective_provider_cash_cost_cny")
		failedAttemptCost, _ := preferredNumber(other, breakdown, "failed_attempt_cash_cost_cny")
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
			JudgeModel: judgeModel, JudgeBackupUsed: strings.Contains(strings.ToLower(judgeModel), "deepseek"),
			Difficulty: difficulty, DifficultyRecorded: difficultyRecorded, RequestedModel: stringValue(breakdown, "requested_model"),
			ActualModel: firstTimelineValue(stringValue(breakdown, "canonical_model"), log.ModelName),
			Provider:    firstTimelineValue(stringValue(breakdown, "actual_provider"), stringValue(other, "actual_provider")),
			Channel:     firstTimelineValue(stringValue(breakdown, "channel_id"), stringValue(other, "actual_channel")), Status: status,
			FirstModelEventLatencyMs: firstLatency,
			EndToEndLatencyMs:        endToEndLatency,
			LatencySource:            latencySource,
			JudgeLatencyMs:           int(numberValue(breakdown, "judge_latency_ms")),
			ProviderLatencyMs:        firstPositiveInt(int(numberValue(breakdown, "provider_latency_ms")), totalLatency),
			UserChargeCNY:            userChargeValue,
			ActualCashCostCNY:        actualCashCostValue,
			ActualCostCNY:            legacyCost,
			JudgeCostCNY:             judgeCost,
			ProviderCostCNY:          providerCost,
			FailedAttemptCostCNY:     failedAttemptCost,
			ErrorClass:               errorClass, CooldownUntil: cooldown,
			WorkPhase:                    firstTimelineValue(stringValue(decision, "work_phase"), stringValue(breakdown, "phase")),
			WorkPhaseQualityTargetOffset: numberValue(decision, "work_phase_quality_target_offset"),
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
	items := make([]dto.ACUWorkTimelineItem, 0, len(byRequest))
	for _, item := range byRequest {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Timestamp < items[j].Timestamp })
	latencies := make([]int, 0, len(items))
	completed, judgeCalls := 0, 0
	judgeFirstSuccess, judgeFirstSamples := 0, 0
	rulesFallback, rulesFallbackSamples := 0, 0
	totalUserCharge, totalActualCashCost, legacyTotalCost := 0.0, 0.0, 0.0
	totalInput, totalCached := int64(0), int64(0)
	sequenceByTask := map[string]int{}
	for i := range items {
		sequenceByTask[items[i].TaskID]++
		items[i].Sequence = sequenceByTask[items[i].TaskID]
		legacyTotalCost += items[i].ActualCostCNY
		if items[i].UserChargeCNY != nil {
			totalUserCharge += *items[i].UserChargeCNY
		}
		if items[i].ActualCashCostCNY != nil {
			totalActualCashCost += *items[i].ActualCashCostCNY
		}
		if items[i].Status == "completed" || items[i].Status == "completed_with_recovery" {
			completed++
		}
		if items[i].JudgeCalled {
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
		totalInput += items[i].InputTokens
		totalCached += items[i].CachedInputTokens
		if items[i].FirstModelEventLatencyMs > 0 {
			latencies = append(latencies, items[i].FirstModelEventLatencyMs)
		}
	}
	sort.Ints(latencies)
	return dto.ACUWorkTimeline{From: from, To: to, Items: items, Summary: dto.ACUWorkTimelineSummary{
		APISteps: len(items), JudgeFirstAttemptSuccessRate: ratio(judgeFirstSuccess, judgeFirstSamples),
		JudgeFirstAttemptSuccessSamples: judgeFirstSamples, JudgeCalledRequests: judgeCalls,
		JudgeRulesFallbackRate: ratio(rulesFallback, rulesFallbackSamples), JudgeRulesFallbackSamples: rulesFallbackSamples,
		CompletionRate: ratio(completed, len(items)), CacheHitRate: floatRatio(totalCached, totalInput),
		TotalUserChargeCNY: totalUserCharge, TotalActualCashCostCNY: totalActualCashCost,
		ActualTotalCostCNY: legacyTotalCost, P50FirstModelEventLatencyMs: percentile(latencies, .5), P95FirstModelEventLatencyMs: percentile(latencies, .95),
	}}
}

func mapValue(value map[string]interface{}, key string) map[string]interface{} {
	result, _ := value[key].(map[string]interface{})
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

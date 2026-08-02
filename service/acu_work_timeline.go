package service

import (
	"sort"
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
		userCharge := numberValue(breakdown, "user_charge_cny")
		if _, exists := breakdown["user_charge_cny"]; !exists {
			userCharge = numberValue(breakdown, "actual_total_cash_cost_cny")
		}
		item := dto.ACUWorkTimelineItem{
			Timestamp: log.CreatedAt, LogicalRequestID: logicalID,
			SessionID: stringValue(breakdown, "session_id"), TaskID: stringValue(breakdown, "task_id"), SegmentID: stringValue(breakdown, "segment_id"),
			JudgeCalled: numberValue(breakdown, "judge_calls") > 0, JudgeReused: boolValue(breakdown, "judge_reused"),
			JudgeModel: judgeModel, JudgeBackupUsed: strings.Contains(strings.ToLower(judgeModel), "deepseek"),
			Difficulty: numberValue(breakdown, "difficulty"), RequestedModel: stringValue(breakdown, "requested_model"),
			ActualModel: firstTimelineValue(stringValue(breakdown, "canonical_model"), log.ModelName),
			Provider:    firstTimelineValue(stringValue(breakdown, "actual_provider"), stringValue(other, "actual_provider")),
			Channel:     firstTimelineValue(stringValue(breakdown, "channel_id"), stringValue(other, "actual_channel")), Status: status,
			FirstModelEventLatencyMs: firstLatency,
			EndToEndLatencyMs:        firstPositiveInt(int(numberValue(breakdown, "end_to_end_latency_ms")), totalLatency+int(numberValue(breakdown, "judge_latency_ms"))),
			JudgeLatencyMs:           int(numberValue(breakdown, "judge_latency_ms")),
			ProviderLatencyMs:        firstPositiveInt(int(numberValue(breakdown, "provider_latency_ms")), totalLatency),
			ActualCostCNY:            userCharge,
			ErrorClass:               errorClass, CooldownUntil: cooldown,
			WorkPhase:                    firstTimelineValue(stringValue(decision, "work_phase"), stringValue(breakdown, "phase")),
			WorkPhaseQualityTargetOffset: numberValue(decision, "work_phase_quality_target_offset"),
			JudgeTrigger:                 firstTimelineValue(stringValue(decision, "judge_trigger"), stringValue(breakdown, "judge_trigger")),
			JudgeStatus:                  stringValue(decision, "judge_status"), JudgeResultSource: stringValue(decision, "judge_result_source"),
			JudgeFirstAttemptSucceeded:     boolValue(decision, "judge_first_attempt_succeeded"),
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
	completed, judgeCalls, judgeFirstSuccess, rulesFallback := 0, 0, 0, 0
	totalCost := 0.0
	totalInput, totalCached := int64(0), int64(0)
	sequenceByTask := map[string]int{}
	for i := range items {
		sequenceByTask[items[i].TaskID]++
		items[i].Sequence = sequenceByTask[items[i].TaskID]
		totalCost += items[i].ActualCostCNY
		if items[i].Status == "completed" || items[i].Status == "completed_with_recovery" {
			completed++
		}
		if items[i].JudgeCalled {
			judgeCalls++
			if items[i].JudgeFirstAttemptSucceeded {
				judgeFirstSuccess++
			}
			if items[i].JudgeResultSource == "rules_strategy" || items[i].JudgeStatus == "rules_fallback" {
				rulesFallback++
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
		APISteps: len(items), JudgeFirstAttemptSuccessRate: ratio(judgeFirstSuccess, judgeCalls),
		JudgeRulesFallbackRate: ratio(rulesFallback, judgeCalls), CompletionRate: ratio(completed, len(items)),
		CacheHitRate:       floatRatio(totalCached, totalInput),
		ActualTotalCostCNY: totalCost, P50FirstModelEventLatencyMs: percentile(latencies, .5), P95FirstModelEventLatencyMs: percentile(latencies, .95),
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
	if v, ok := value[key].(float64); ok {
		return v
	}
	return 0
}
func boolValue(value map[string]interface{}, key string) bool { v, _ := value[key].(bool); return v }
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

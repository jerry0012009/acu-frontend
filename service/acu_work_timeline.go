package service

import (
	"encoding/json"
	"sort"
	"strings"

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
		if json.Unmarshal([]byte(log.Other), &other) != nil {
			continue
		}
		logicalID := stringValue(other, "acu_logical_request_id")
		breakdown, _ := other["acu_cost_breakdown"].(map[string]interface{})
		if logicalID == "" || breakdown == nil {
			continue
		}
		attempts, _ := breakdown["channel_attempts"].([]interface{})
		firstLatency, totalLatency, errorClass, cooldown := attemptFields(attempts)
		status := "completed"
		if errorClass != "" || log.Type == model.LogTypeError {
			status = "error"
		}
		judgeModel := stringValue(breakdown, "judge_model")
		item := dto.ACUWorkTimelineItem{
			Timestamp: log.CreatedAt, LogicalRequestID: logicalID,
			SessionID: stringValue(breakdown, "session_id"), TaskID: stringValue(breakdown, "task_id"), SegmentID: stringValue(breakdown, "segment_id"),
			JudgeCalled: numberValue(breakdown, "judge_calls") > 0, JudgeReused: boolValue(breakdown, "judge_reused"),
			JudgeModel: judgeModel, JudgeBackupUsed: strings.Contains(strings.ToLower(judgeModel), "deepseek"),
			Difficulty: numberValue(breakdown, "difficulty"), RequestedModel: stringValue(breakdown, "requested_model"),
			ActualModel: firstTimelineValue(stringValue(breakdown, "canonical_model"), log.ModelName),
			Provider:    firstTimelineValue(stringValue(breakdown, "actual_provider"), stringValue(other, "actual_provider")),
			Channel:     firstTimelineValue(stringValue(breakdown, "channel_id"), stringValue(other, "actual_channel")), Status: status,
			FirstModelEventLatencyMs: firstLatency, TotalLatencyMs: totalLatency,
			ActualCostCNY: numberValue(breakdown, "actual_total_cash_cost_cny"), JudgeCostCNY: numberValue(breakdown, "judge_cash_cost_cny"),
			ProviderCostCNY: numberValue(breakdown, "effective_provider_cash_cost_cny"), FailedAttemptCostCNY: numberValue(breakdown, "failed_attempt_cash_cost_cny"),
			ErrorClass: errorClass, CooldownUntil: cooldown,
		}
		byRequest[logicalID] = item
	}
	items := make([]dto.ACUWorkTimelineItem, 0, len(byRequest))
	for _, item := range byRequest {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Timestamp < items[j].Timestamp })
	latencies := make([]int, 0, len(items))
	completed, judgeCalls, reused := 0, 0, 0
	totalCost := 0.0
	for i := range items {
		items[i].Sequence = i + 1
		totalCost += items[i].ActualCostCNY
		if items[i].Status == "completed" {
			completed++
		}
		if items[i].JudgeCalled {
			judgeCalls++
		}
		if items[i].JudgeReused {
			reused++
		}
		if items[i].FirstModelEventLatencyMs > 0 {
			latencies = append(latencies, items[i].FirstModelEventLatencyMs)
		}
	}
	sort.Ints(latencies)
	denom := judgeCalls + reused
	return dto.ACUWorkTimeline{From: from, To: to, Items: items, Summary: dto.ACUWorkTimelineSummary{
		APISteps: len(items), JudgeCalls: judgeCalls, JudgeReuseRate: ratio(reused, denom), CompletionRate: ratio(completed, len(items)),
		ActualTotalCostCNY: totalCost, P50FirstModelEventLatencyMs: percentile(latencies, .5), P95FirstModelEventLatencyMs: percentile(latencies, .95),
	}}
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

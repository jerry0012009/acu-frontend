package service

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildACUWorkTimelineCompactsLogicalRequests(t *testing.T) {
	logs := []*model.Log{
		{CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.4-mini", Other: `{"acu_logical_request_id":"req-1","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-1","judge_calls":1,"judge_reused":false,"judge_model":"mimo-v2.5-pro","difficulty":22,"requested_model":"acu-auto","canonical_model":"gpt-5.4-mini","actual_provider":"lucen","channel_id":"lucen-a","actual_total_cash_cost_cny":0.01,"user_charge_cny":0.0125,"judge_cash_cost_cny":0.002,"effective_provider_cash_cost_cny":0.008,"channel_attempts":[{"latency_ms":1000,"first_model_event_latency_ms":500}]}}`},
		{CreatedAt: 110, Type: model.LogTypeError, ModelName: "gpt-5.6-luna", Other: `{"acu_logical_request_id":"req-2","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-2","judge_calls":1,"judge_reused":false,"judge_model":"deepseek-v4-flash","difficulty":68,"requested_model":"acu-auto","canonical_model":"gpt-5.6-luna","actual_provider":"lucen","channel_id":"lucen-b","actual_total_cash_cost_cny":0.02,"failed_attempt_cash_cost_cny":0.01,"channel_attempts":[{"latency_ms":45000,"error_class":"provider_edge_timeout","cooldown_until":"2026-07-31T00:00:00Z"}]}}`},
		{CreatedAt: 120, Type: model.LogTypeConsume, ModelName: "gpt-5.6-terra", Other: `{"acu_logical_request_id":"req-3","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-2","judge_calls":0,"judge_reused":true,"judge_model":"mimo-v2.5-pro","difficulty":68,"requested_model":"acu-auto","canonical_model":"gpt-5.6-terra","actual_provider":"blackai","channel_id":"blackai-a","actual_total_cash_cost_cny":0.03,"channel_attempts":[{"latency_ms":2000,"first_model_event_latency_ms":700}]}}`},
		{CreatedAt: 130, Type: model.LogTypeError, ModelName: "gpt-5.6-luna", Other: `{"acu_logical_request_id":"req-4","acu_cost_breakdown":{"logical_request_status":"failed","session_id":"ses-1","task_id":"task-2","segment_id":"seg-3","canonical_model":"gpt-5.6-luna","channel_attempts":[{"status":"error","latency_ms":45000,"error_class":"provider_edge_timeout"}]}}`},
		{CreatedAt: 131, Type: model.LogTypeConsume, ModelName: "gpt-5.6-luna", Other: `{"acu_logical_request_id":"req-4","acu_cost_breakdown":{"logical_request_status":"completed_with_recovery","end_to_end_latency_ms":51000,"judge_latency_ms":1000,"provider_latency_ms":50000,"session_id":"ses-1","task_id":"task-2","segment_id":"seg-3","canonical_model":"gpt-5.6-luna","channel_attempts":[{"status":"error","latency_ms":45000,"error_class":"provider_edge_timeout"},{"status":"success","latency_ms":5000,"first_model_event_latency_ms":600}]}}`},
	}
	result := buildACUWorkTimeline(logs, 0, 200)
	require.Len(t, result.Items, 4)
	assert.Equal(t, 4, result.Summary.APISteps)
	assert.Equal(t, 0.0, result.Summary.JudgeFirstAttemptSuccessRate)
	assert.True(t, result.Items[2].JudgeReused)
	assert.True(t, result.Items[1].JudgeBackupUsed)
	assert.Equal(t, "provider_edge_timeout", result.Items[1].ErrorClass)
	assert.NotEmpty(t, result.Items[1].CooldownUntil)
	assert.NotEqual(t, result.Items[0].ActualModel, result.Items[2].ActualModel)
	assert.Equal(t, "completed_with_recovery", result.Items[3].Status)
	assert.Equal(t, 51000, result.Items[3].EndToEndLatencyMs)
	assert.Equal(t, "reported", result.Items[3].LatencySource)
	assert.Equal(t, 1000, result.Items[3].JudgeLatencyMs)
	assert.Equal(t, 50000, result.Items[3].ProviderLatencyMs)
	assert.Equal(t, 0.0125, result.Items[0].ActualCostCNY)
	require.NotNil(t, result.Items[0].UserChargeCNY)
	require.NotNil(t, result.Items[0].ActualCashCostCNY)
	assert.Equal(t, 0.0125, *result.Items[0].UserChargeCNY)
	assert.Equal(t, 0.01, *result.Items[0].ActualCashCostCNY)
	assert.Equal(t, 0.002, result.Items[0].JudgeCostCNY)
	assert.Equal(t, 0.008, result.Items[0].ProviderCostCNY)
	assert.Equal(t, 0.01, result.Items[1].FailedAttemptCostCNY)
	assert.Equal(t, 2, result.Summary.JudgeCalledRequests)
	assert.Equal(t, 0, result.Summary.JudgeFirstAttemptSuccessSamples)
	assert.Equal(t, 0, result.Summary.JudgeRulesFallbackSamples)
	assert.Equal(t, 0.0125, result.Summary.TotalUserChargeCNY)
	assert.Equal(t, 0.06, result.Summary.TotalActualCashCostCNY)
	assert.Equal(t, 0.0625, result.Summary.ActualTotalCostCNY)
}

func TestBuildACUWorkTimelineMapsV2DecisionSummary(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.6-luna", PromptTokens: 1000, CompletionTokens: 200,
		Other: `{"acu_logical_request_id":"req-v2","cached_input_tokens":600,"reasoning_tokens":120,"acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-v2","segment_id":"seg-v2","judge_calls":1,"difficulty":72,"canonical_model":"gpt-5.6-luna","channel_id":"blackai","logical_request_status":"completed_with_recovery","decision_summary":{"work_phase":"inspection","work_phase_quality_target_offset":-4,"judge_trigger":"human_message","judge_status":"rules_fallback","judge_result_source":"rules_strategy","judge_first_attempt_succeeded":false,"judge_profile_attempt_count":3,"judge_same_model_failover_used":true,"selected_candidate_id":"gpt-5.6-luna@max","selected_display_name":"GPT-5.6 Luna · Max","selected_execution_preset_id":"gpt-5.6-luna:max","client_requested_reasoning_effort":"high","preset_reasoning_effort":"max","resolved_reasoning_effort":"max","reasoning_mapping_status":"exact","profile_attempt_count":2,"recovery_decision_reason":"same_model_profile_retry","cache_hit_ratio":0.6,"top_candidates":[{"candidateId":"gpt-5.6-luna@max","displayName":"GPT-5.6 Luna · Max","estimatedQuality":91.5,"estimatedCallCost":0.02,"valueUtility":0.9,"selected":true}]},"channel_attempts":[{"attempt_index":1,"channel":"a","execution_profile_id":"profile-a","status":"error","latency_ms":1000},{"attempt_index":2,"channel":"b","execution_profile_id":"profile-b","status":"success","latency_ms":500}]}}`,
	}}
	result := buildACUWorkTimeline(logs, 0, 200)
	require.Len(t, result.Items, 1)
	item := result.Items[0]
	assert.Equal(t, "inspection", item.WorkPhase)
	assert.Equal(t, -4.0, item.WorkPhaseQualityTargetOffset)
	assert.Equal(t, "rules_strategy", item.JudgeResultSource)
	assert.Equal(t, "gpt-5.6-luna@max", item.SelectedCandidateID)
	assert.Equal(t, "gpt-5.6-luna:max", item.SelectedExecutionPresetID)
	assert.Equal(t, int64(600), item.CachedInputTokens)
	assert.Equal(t, 0.6, item.CacheHitRatio)
	require.Len(t, item.TopCandidates, 1)
	require.Len(t, item.ProviderAttempts, 2)
	assert.Equal(t, 1.0, result.Summary.JudgeRulesFallbackRate)
	assert.Equal(t, 1, result.Summary.JudgeFirstAttemptSuccessSamples)
	assert.Equal(t, 1, result.Summary.JudgeRulesFallbackSamples)
	assert.Equal(t, 0.6, result.Summary.CacheHitRate)
	assert.Equal(t, 0, item.EndToEndLatencyMs)
	assert.Equal(t, "unavailable", item.LatencySource)
}

func TestBuildACUWorkTimelineUsesAuthoritativeSettledCosts(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-5.6-luna",
		Other: `{
			"acu_logical_request_id":"req-cost",
			"user_charge_cny":"0.125",
			"actual_total_cash_cost_cny":"0.0875",
			"judge_cash_cost_cny":"0.0125",
			"effective_provider_cash_cost_cny":"0.07",
			"failed_attempt_cash_cost_cny":"0.005",
			"acu_cost_breakdown":{
				"session_id":"ses-1",
				"task_id":"task-1",
				"segment_id":"seg-1",
				"user_charge_cny":999,
				"actual_total_cash_cost_cny":999,
				"judge_cash_cost_cny":999,
				"effective_provider_cash_cost_cny":999,
				"failed_attempt_cash_cost_cny":999
			}
		}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200)
	require.Len(t, result.Items, 1)
	item := result.Items[0]
	require.NotNil(t, item.UserChargeCNY)
	require.NotNil(t, item.ActualCashCostCNY)
	assert.Equal(t, 0.125, *item.UserChargeCNY)
	assert.Equal(t, 0.0875, *item.ActualCashCostCNY)
	assert.Equal(t, 0.0125, item.JudgeCostCNY)
	assert.Equal(t, 0.07, item.ProviderCostCNY)
	assert.Equal(t, 0.005, item.FailedAttemptCostCNY)
	assert.Equal(t, 0.125, item.ActualCostCNY)
	assert.Equal(t, 0.125, result.Summary.TotalUserChargeCNY)
	assert.Equal(t, 0.0875, result.Summary.TotalActualCashCostCNY)
}

func TestBuildACUWorkTimelineDoesNotInventMissingCostSemantics(t *testing.T) {
	logs := []*model.Log{
		{
			CreatedAt: 100,
			Type:      model.LogTypeConsume,
			Other:     `{"acu_logical_request_id":"req-charge","acu_cost_breakdown":{"task_id":"task-1","user_charge_cny":0.2}}`,
		},
		{
			CreatedAt: 101,
			Type:      model.LogTypeConsume,
			Other:     `{"acu_logical_request_id":"req-cash","acu_cost_breakdown":{"task_id":"task-1","actual_total_cash_cost_cny":0.1}}`,
		},
	}

	result := buildACUWorkTimeline(logs, 0, 200)
	require.Len(t, result.Items, 2)
	require.NotNil(t, result.Items[0].UserChargeCNY)
	assert.Nil(t, result.Items[0].ActualCashCostCNY)
	assert.Nil(t, result.Items[1].UserChargeCNY)
	require.NotNil(t, result.Items[1].ActualCashCostCNY)
	assert.Equal(t, 0.2, result.Summary.TotalUserChargeCNY)
	assert.Equal(t, 0.1, result.Summary.TotalActualCashCostCNY)
	assert.InDelta(t, 0.3, result.Summary.ActualTotalCostCNY, 1e-12)
}

func TestBuildACUWorkTimelinePreservesAllDetectedWorkPhases(t *testing.T) {
	phases := []struct {
		name   string
		offset float64
	}{
		{"inspection", -4}, {"implementation", 0}, {"verification", 0},
		{"planning", 4}, {"recovery", 6}, {"general", 0},
	}
	for _, phase := range phases {
		t.Run(phase.name, func(t *testing.T) {
			other := `{"acu_logical_request_id":"req-` + phase.name + `","acu_cost_breakdown":{"phase":"execution","decision_summary":{"work_phase":"` + phase.name + `","work_phase_quality_target_offset":` + formatTimelineNumber(phase.offset) + `}}}`
			result := buildACUWorkTimeline([]*model.Log{{CreatedAt: 100, Type: model.LogTypeConsume, Other: other}}, 0, 200)
			require.Len(t, result.Items, 1)
			assert.Equal(t, phase.name, result.Items[0].WorkPhase)
			assert.Equal(t, phase.offset, result.Items[0].WorkPhaseQualityTargetOffset)
		})
	}
}

func formatTimelineNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

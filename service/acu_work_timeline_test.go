package service

import (
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
	assert.Equal(t, 2, result.Summary.JudgeCalls)
	assert.True(t, result.Items[2].JudgeReused)
	assert.True(t, result.Items[1].JudgeBackupUsed)
	assert.Equal(t, "provider_edge_timeout", result.Items[1].ErrorClass)
	assert.NotEmpty(t, result.Items[1].CooldownUntil)
	assert.NotEqual(t, result.Items[0].ActualModel, result.Items[2].ActualModel)
	assert.Equal(t, "completed_with_recovery", result.Items[3].Status)
	assert.Equal(t, 51000, result.Items[3].EndToEndLatencyMs)
	assert.Equal(t, 1000, result.Items[3].JudgeLatencyMs)
	assert.Equal(t, 50000, result.Items[3].ProviderLatencyMs)
	assert.Equal(t, 0.0125, result.Items[0].ActualCostCNY)
	assert.Equal(t, 0.0, result.Items[0].JudgeCostCNY)
	assert.Equal(t, 0.0, result.Items[0].ProviderCostCNY)
	assert.Equal(t, 0.0, result.Items[1].FailedAttemptCostCNY)
}

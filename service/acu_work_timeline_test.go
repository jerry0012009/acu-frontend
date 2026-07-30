package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
)

func TestBuildACUWorkTimelineCompactsLogicalRequests(t *testing.T) {
	logs := []*model.Log{
		{CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.4-mini", Other: `{"acu_logical_request_id":"req-1","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-1","judge_calls":1,"judge_reused":false,"judge_model":"mimo-v2.5-pro","difficulty":22,"requested_model":"acu-auto","canonical_model":"gpt-5.4-mini","actual_provider":"lucen","channel_id":"lucen-a","actual_total_cash_cost_cny":0.01,"judge_cash_cost_cny":0.002,"effective_provider_cash_cost_cny":0.008,"channel_attempts":[{"latency_ms":1000,"first_model_event_latency_ms":500}]}}`},
		{CreatedAt: 110, Type: model.LogTypeError, ModelName: "gpt-5.6-luna", Other: `{"acu_logical_request_id":"req-2","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-2","judge_calls":1,"judge_reused":false,"judge_model":"deepseek-v4-flash","difficulty":68,"requested_model":"acu-auto","canonical_model":"gpt-5.6-luna","actual_provider":"lucen","channel_id":"lucen-b","actual_total_cash_cost_cny":0.02,"failed_attempt_cash_cost_cny":0.01,"channel_attempts":[{"latency_ms":45000,"error_class":"provider_edge_timeout","cooldown_until":"2026-07-31T00:00:00Z"}]}}`},
		{CreatedAt: 120, Type: model.LogTypeConsume, ModelName: "gpt-5.6-terra", Other: `{"acu_logical_request_id":"req-3","acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-1","segment_id":"seg-2","judge_calls":0,"judge_reused":true,"judge_model":"mimo-v2.5-pro","difficulty":68,"requested_model":"acu-auto","canonical_model":"gpt-5.6-terra","actual_provider":"blackai","channel_id":"blackai-a","actual_total_cash_cost_cny":0.03,"channel_attempts":[{"latency_ms":2000,"first_model_event_latency_ms":700}]}}`},
	}
	result := buildACUWorkTimeline(logs, 0, 200)
	if len(result.Items) != 3 || result.Summary.APISteps != 3 {
		t.Fatalf("unexpected item count: %#v", result.Summary)
	}
	if result.Summary.JudgeCalls != 2 || result.Items[2].JudgeReused != true {
		t.Fatalf("judge new/reuse chain missing: %#v", result.Items)
	}
	if !result.Items[1].JudgeBackupUsed || result.Items[1].ErrorClass != "provider_edge_timeout" || result.Items[1].CooldownUntil == "" {
		t.Fatalf("backup/524/cooldown missing: %#v", result.Items[1])
	}
	if result.Items[0].ActualModel == result.Items[2].ActualModel {
		t.Fatal("fixture must preserve different execution models")
	}
}

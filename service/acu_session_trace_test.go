package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildACUSessionTracePreservesChainsAndExcludesRawPayload(t *testing.T) {
	userChargeCNY := 0.22
	actualCashCostCNY := 0.18
	raw := acuRawTrace{
		Session: acuRawSession{SessionID: "ses_fixture", CreatedAt: "2026-07-30T14:00:00Z", LastActivityAt: "2026-07-30T14:03:00Z"},
		Task:    acuRawTask{TaskID: "task_fixture", RootGoalText: "Inspect the server", Status: "failed"},
		Segments: []acuRawSegment{
			{SegmentID: "seg_1", CreationReason: "new_task", Phase: "execution", Status: "superseded", JudgeEvaluationID: "judge_1", RouteDecisionID: "route_1", CreatedAt: "2026-07-30T14:00:00Z", SupersededAt: "2026-07-30T14:01:00Z"},
			{SegmentID: "seg_2", PreviousSegmentID: "seg_1", CreationReason: "human_message", Phase: "execution", Status: "active", JudgeEvaluationID: "judge_2", RouteDecisionID: "route_2", CreatedAt: "2026-07-30T14:01:00Z"},
		},
		JudgeEvaluations: []acuRawJudgeEvaluation{
			{EvaluationID: "judge_1", SegmentID: "seg_1", Model: "mimo-v2.5-pro", Provider: "xiaomi_mimo", Status: "success", Difficulty: 24, Confidence: .9, Explanation: "Simple task", LatencyMs: 1000},
			{EvaluationID: "judge_2", SegmentID: "seg_2", Model: "deepseek-v4-flash", Provider: "closeai", Status: "success", Difficulty: 49.4, Confidence: .82, Explanation: "Backup result", LatencyMs: 900},
		},
		AdmissionTraces: []acuRawAdmissionTrace{
			{SegmentID: "seg_1", LogicalRequestID: "req_1", Metadata: map[string]interface{}{"trigger": "new_task", "judgeCalls": float64(1)}},
			{SegmentID: "seg_1", LogicalRequestID: "req_2", Metadata: map[string]interface{}{"trigger": "reuse", "judgeCalls": float64(0), "judgeReused": true, "reusedJudgeEvaluationId": "judge_1"}},
			{SegmentID: "seg_2", LogicalRequestID: "req_3", Metadata: map[string]interface{}{"trigger": "human_message", "judgeCalls": float64(1)}},
		},
		JudgeAttempts: []acuRawJudgeAttempt{
			{AttemptID: "ja_1", EvaluationID: "judge_1", Role: "primary", Model: "mimo-v2.5-pro", Provider: "xiaomi_mimo", Status: "success", LatencyMs: 1000},
			{AttemptID: "ja_2", EvaluationID: "judge_2", Role: "primary", Model: "mimo-v2.5-pro", Provider: "xiaomi_mimo", Status: "invalid_response", ErrorCategory: "invalid_json", LatencyMs: 500},
			{AttemptID: "ja_3", EvaluationID: "judge_2", Role: "backup", Model: "deepseek-v4-flash", Provider: "closeai", Status: "success", LatencyMs: 900},
		},
		RouteDecisions: []acuRawRouteDecision{
			{RouteDecisionID: "route_1", SegmentID: "seg_1", Mode: "acu-auto", Candidates: []interface{}{map[string]interface{}{"modelId": "gpt-5.4-mini"}}, ParetoFrontier: []string{"gpt-5.4-mini"}, SelectedProfile: map[string]interface{}{"modelId": "gpt-5.4-mini", "provider": "lucen", "channel": "mini-a"}, Explanation: "Mini selected"},
			{RouteDecisionID: "route_2", SegmentID: "seg_2", Mode: "acu-auto", Candidates: []interface{}{map[string]interface{}{"modelId": "gpt-5.6-luna"}}, ParetoFrontier: []string{"gpt-5.6-luna"}, SelectedProfile: map[string]interface{}{"modelId": "gpt-5.6-luna", "provider": "lucen", "channel": "luna-b"}, Explanation: "Luna selected"},
		},
		LogicalRequests: []acuRawLogicalRequest{
			{LogicalRequestID: "req_1", SegmentID: "seg_1", NewAPILogID: "log_1", RequestedModel: "acu-auto", Status: "success", StartedAt: "2026-07-30T14:00:01Z", CompletedAt: "2026-07-30T14:00:05Z"},
			{LogicalRequestID: "req_2", SegmentID: "seg_1", NewAPILogID: "log_2", RequestedModel: "acu-auto", Status: "success", StartedAt: "2026-07-30T14:00:10Z", CompletedAt: "2026-07-30T14:00:12Z"},
			{LogicalRequestID: "req_3", SegmentID: "seg_2", NewAPILogID: "log_3", RequestedModel: "acu-auto", Status: "success", StartedAt: "2026-07-30T14:01:01Z", CompletedAt: "2026-07-30T14:03:00Z"},
		},
		Attempts: []acuRawProviderAttempt{
			{AttemptID: "pa_1", LogicalRequestID: "req_3", AttemptIndex: 1, ActualModel: "gpt-5.6-luna", Provider: "lucen", Channel: "luna-a", Endpoint: "https://provider.example/v1", Status: "failed", HTTPStatus: 524, ErrorCategory: "provider_http", LatencyMs: 100000, VisibleOutputBytes: 7710},
			{AttemptID: "pa_2", LogicalRequestID: "req_3", AttemptIndex: 2, ActualModel: "gpt-5.6-luna", Provider: "closeai", Channel: "luna-b", Endpoint: "https://backup.example/v1", Status: "success", HTTPStatus: 200, LatencyMs: 19000, Metadata: map[string]interface{}{"first_model_event_latency_ms": float64(1200)}},
		},
		UsageReports: []acuRawUsageReport{{
			LogicalRequestID: "req_3", ActualModel: "gpt-5.6-luna",
			UserChargeCNY: &userChargeCNY, ActualTotalCashCostCNY: &actualCashCostCNY,
		}},
		Payloads: []acuRawPayload{
			{PayloadKind: "judge_attempt_error_response", Metadata: map[string]interface{}{"judgeAttemptId": "ja_2", "backupReason": "invalid_json", "secret": "must-not-escape"}},
			{LogicalRequestID: "req_3", AttemptID: "pa_1", PayloadKind: "provider_response", Headers: map[string]interface{}{"server": "cloudflare", "cf-ray": "fixture-ray", "authorization": "must-not-escape"}},
			{LogicalRequestID: "req_3", AttemptID: "pa_2", PayloadKind: "provider_response", Headers: map[string]interface{}{"server": "upstream", "authorization": "must-not-escape"}},
		},
	}

	trace := buildACUSessionTrace(raw)
	require.Len(t, trace.Segments, 2)
	assert.Len(t, trace.Segments[0].LogicalRequests, 2)
	require.Len(t, trace.Segments[1].Judge.Attempts, 2)
	assert.Equal(t, "invalid_json", trace.Segments[1].Judge.Attempts[0].BackupReason)
	require.Len(t, trace.Segments[1].ProviderAttempts, 2)
	assert.Equal(t, 524, trace.Segments[1].ProviderAttempts[0].HTTPStatus)
	assert.Equal(t, "same_model_channel_recovery", trace.Segments[1].ProviderAttempts[1].RecoveryReason)
	require.NotNil(t, trace.Segments[1].LogicalRequests[0].FirstTokenLatencyMs)
	assert.Equal(t, 1200, *trace.Segments[1].LogicalRequests[0].FirstTokenLatencyMs)
	assert.Equal(t, "gpt-5.6-luna", trace.Segments[1].Route.SelectedCanonicalModel)
	require.NotNil(t, trace.Segments[1].LogicalRequests[0].UserChargeCNY)
	require.NotNil(t, trace.Segments[1].LogicalRequests[0].ActualCashCostCNY)
	assert.Equal(t, 0.22, *trace.Segments[1].LogicalRequests[0].UserChargeCNY)
	assert.Equal(t, 0.18, *trace.Segments[1].LogicalRequests[0].ActualCashCostCNY)
	assert.Equal(t, "fixture-ray", trace.Segments[1].LogicalRequests[0].ErrorDiagnosis.CFRay)
	assert.NotContains(t, trace.Task.GoalSummary, "must-not-escape")
}

func TestBuildACUSessionTraceTreatsCancellationAfterOutputAsNeutral(t *testing.T) {
	raw := acuRawTrace{
		Session:  acuRawSession{SessionID: "ses_fixture"},
		Task:     acuRawTask{TaskID: "task_fixture"},
		Segments: []acuRawSegment{{SegmentID: "seg_1", CreationReason: "human_message", Phase: "execution"}},
		LogicalRequests: []acuRawLogicalRequest{{
			LogicalRequestID: "req_1", SegmentID: "seg_1", Status: "cancelled",
			Metadata: map[string]interface{}{"deliveryStatus": "client_cancelled_after_output"},
		}},
		Attempts: []acuRawProviderAttempt{{
			AttemptID: "pa_1", LogicalRequestID: "req_1", AttemptIndex: 1, Status: "cancelled",
			HTTPStatus: 200, VisibleOutputBytes: 2048,
			Metadata: map[string]interface{}{
				"deliveryStatus": "client_cancelled_after_output", "first_model_event_latency_ms": float64(850),
			},
		}},
	}

	trace := buildACUSessionTrace(raw)
	require.Len(t, trace.Segments, 1)
	require.Len(t, trace.Segments[0].LogicalRequests, 1)
	request := trace.Segments[0].LogicalRequests[0]
	assert.Nil(t, request.ErrorDiagnosis)
	assert.Equal(t, "client_cancelled_after_output", request.DeliveryStatus)
	require.NotNil(t, request.FirstTokenLatencyMs)
	assert.Equal(t, 850, *request.FirstTokenLatencyMs)
}

func TestBuildACUSessionTraceTreatsCancellationBeforeOutputAsNeutral(t *testing.T) {
	raw := acuRawTrace{
		Session:  acuRawSession{SessionID: "ses_fixture"},
		Task:     acuRawTask{TaskID: "task_fixture"},
		Segments: []acuRawSegment{{SegmentID: "seg_1", CreationReason: "human_message", Phase: "execution"}},
		LogicalRequests: []acuRawLogicalRequest{{
			LogicalRequestID: "req_1", SegmentID: "seg_1", Status: "cancelled",
			Metadata: map[string]interface{}{"deliveryStatus": "client_cancelled_before_output"},
		}},
		Attempts: []acuRawProviderAttempt{{
			AttemptID: "pa_1", LogicalRequestID: "req_1", AttemptIndex: 1, Status: "cancelled",
			HTTPStatus: 499, Metadata: map[string]interface{}{"deliveryStatus": "client_cancelled_before_output"},
		}},
	}

	trace := buildACUSessionTrace(raw)
	require.Len(t, trace.Segments, 1)
	require.Len(t, trace.Segments[0].LogicalRequests, 1)
	assert.Nil(t, trace.Segments[0].LogicalRequests[0].ErrorDiagnosis)
}

func TestBuildACUSessionTraceKeepsProviderDiagnosisForServerErrorWithCancellationMarker(t *testing.T) {
	raw := acuRawTrace{
		Session:  acuRawSession{SessionID: "ses_fixture"},
		Task:     acuRawTask{TaskID: "task_fixture"},
		Segments: []acuRawSegment{{SegmentID: "seg_1", CreationReason: "human_message", Phase: "execution"}},
		LogicalRequests: []acuRawLogicalRequest{{
			LogicalRequestID: "req_1", SegmentID: "seg_1", Status: "cancelled",
			Metadata: map[string]interface{}{"deliveryStatus": "client_cancelled_after_output"},
		}},
		Attempts: []acuRawProviderAttempt{{
			AttemptID: "pa_1", LogicalRequestID: "req_1", AttemptIndex: 1, Status: "cancelled",
			HTTPStatus: 500, Endpoint: "https://provider.example/v1",
			Metadata: map[string]interface{}{"deliveryStatus": "client_cancelled_after_output"},
		}},
	}

	trace := buildACUSessionTrace(raw)
	require.Len(t, trace.Segments, 1)
	require.Len(t, trace.Segments[0].LogicalRequests, 1)
	require.NotNil(t, trace.Segments[0].LogicalRequests[0].ErrorDiagnosis)
	assert.Equal(t, "execution_provider", trace.Segments[0].LogicalRequests[0].ErrorDiagnosis.ErrorSource)
	assert.True(t, trace.Segments[0].LogicalRequests[0].ErrorDiagnosis.RecoveryEligible)
}

func TestBuildACUSessionTraceExplainsMissingJudgePersistence(t *testing.T) {
	raw := acuRawTrace{
		Session:  acuRawSession{SessionID: "ses_fixture"},
		Task:     acuRawTask{TaskID: "task_fixture"},
		Segments: []acuRawSegment{{SegmentID: "seg_1", CreationReason: "human_message", Phase: "execution"}},
		LogicalRequests: []acuRawLogicalRequest{{
			LogicalRequestID: "req_1", SegmentID: "seg_1", Status: "failed",
			Metadata: map[string]interface{}{"routingErrorMessage": "acu_judge_attempts violates check constraint"},
		}},
	}

	trace := buildACUSessionTrace(raw)
	assert.Equal(t, "Judge result could not be persisted", trace.Segments[0].JudgeStatusReason)
}

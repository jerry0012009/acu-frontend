package service

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
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
	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 4)
	assert.Equal(t, 4, result.Summary.APISteps)
	assert.Equal(t, 0.0, result.Summary.JudgeFirstAttemptSuccessRate)
	assert.True(t, result.Items[2].JudgeReused)
	assert.False(t, result.Items[1].JudgeBackupUsed)
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
	assert.True(t, result.Items[0].DifficultyRecorded)
	assert.False(t, result.Items[3].DifficultyRecorded)
	assert.Equal(t, 0.0, result.Items[3].Difficulty)
}

func TestBuildACUWorkTimelineMapsV2DecisionSummary(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.6-luna", PromptTokens: 1000, CompletionTokens: 200,
		Other: `{"acu_logical_request_id":"req-v2","cached_input_tokens":600,"reasoning_tokens":120,"acu_cost_breakdown":{"session_id":"ses-1","task_id":"task-v2","segment_id":"seg-v2","judge_calls":1,"difficulty":72,"canonical_model":"gpt-5.6-luna","channel_id":"blackai","logical_request_status":"completed_with_recovery","decision_summary":{"work_phase":"inspection","work_phase_quality_target_offset":-4,"judge_trigger":"human_message","judge_status":"rules_fallback","judge_result_source":"rules_strategy","judge_first_attempt_succeeded":false,"judge_profile_attempt_count":3,"judge_same_model_failover_used":true,"selected_candidate_id":"gpt-5.6-luna@max","selected_display_name":"GPT-5.6 Luna · Max","selected_execution_preset_id":"gpt-5.6-luna:max","client_requested_reasoning_effort":"high","preset_reasoning_effort":"max","resolved_reasoning_effort":"max","reasoning_mapping_status":"exact","profile_attempt_count":2,"recovery_decision_reason":"same_model_profile_retry","cache_hit_ratio":0.6,"top_candidates":[{"candidateId":"gpt-5.6-luna@max","displayName":"GPT-5.6 Luna · Max","estimatedQuality":91.5,"estimatedCallCost":0.02,"valueUtility":0.9,"selected":true}]},"channel_attempts":[{"attempt_index":1,"channel":"a","execution_profile_id":"profile-a","status":"error","latency_ms":1000},{"attempt_index":2,"channel":"b","execution_profile_id":"profile-b","status":"success","latency_ms":500}]}}`,
	}}
	result := buildACUWorkTimeline(logs, 0, 200, true)
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

func TestBuildACUWorkTimelineReturnsRecordedExecutionProtocol(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		Other:     `{"acu_logical_request_id":"req-messages","acu_cost_breakdown":{"task_id":"task-1","protocol":"messages","channel_attempts":[{"execution_profile_id":"profile-claude","status":"success"}]}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 1)
	assert.Equal(t, "messages", result.Items[0].Protocol)
}

func TestBuildACUWorkTimelineSplitsFreshJudgeAndExecutionWithoutSplittingBilling(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.6-luna", PromptTokens: 1000, CompletionTokens: 100,
		Other: `{"acu_logical_request_id":"req-points","acu_billing_status":"finalized","acu_cost_breakdown":{"task_id":"task-1","segment_id":"seg-1","judge_calls":2,"judge_reused":false,"judge_protocol":"responses","judge_reasoning_effort":"default","judge_model":"gpt-5.6-sol","judge_cash_cost_cny":0.03,"failed_judge_attempt_cash_cost_cny":0.01,"judge_user_charge_cny":0.025,"provider_user_charge_cny":0.1,"effective_provider_cash_cost_cny":0.08,"failed_attempt_cash_cost_cny":0.005,"user_charge_cny":0.125,"actual_total_cash_cost_cny":0.125,"decision_summary":{"judge_result_source":"upstream_live"},"judge_profile_selection":{"formulaVersion":"acu-profile-utility-v2.1","supplyStrategy":"balanced","candidateCount":3,"selectedExecutionProfileId":"judge-b","selectedProfileRank":1,"selectedProfileUtility":0.9},"judge_attempts":[{"attempt_index":1,"attempt_role":"primary","model":"gpt-5.6-sol","provider":"lucen","execution_profile_id":"judge-a","channel_id":"cx-a","status":"error","input_tokens":100,"cached_input_tokens":20,"output_tokens":0,"latency_ms":500,"effective_cost_cny":0.01,"cost_status":"verified","usage_status":"reported"},{"attempt_index":2,"attempt_role":"same_model_failover","model":"gpt-5.6-sol","provider":"lucen","execution_profile_id":"judge-b","channel_id":"cx-b","status":"success","input_tokens":120,"cached_input_tokens":50,"output_tokens":20,"latency_ms":600,"effective_cost_cny":0.02,"cost_status":"verified","usage_status":"reported"}],"channel_attempts":[{"attempt_index":1,"status":"success","latency_ms":1000}]}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 2)
	judge, execution := result.Items[0], result.Items[1]
	assert.Equal(t, "judge", judge.PointType)
	assert.Equal(t, "execution", execution.PointType)
	assert.Equal(t, int64(70), judge.CachedInputTokens)
	assert.Equal(t, 0.025, *judge.UserChargeCNY)
	assert.Equal(t, 0.1, *execution.UserChargeCNY)
	assert.InDelta(t, 0.125, *judge.UserChargeCNY+*execution.UserChargeCNY, 1e-12)
	assert.InDelta(t, 0.125, result.Summary.TotalUserChargeCNY, 1e-12)
	assert.InDelta(t, 0.115, result.Summary.TotalActualCashCostCNY, 1e-12)
	assert.InDelta(t, 0.125, result.Summary.ActualTotalCostCNY, 1e-12)
	assert.Equal(t, 0, result.Summary.UnsettledRequests)
	assert.Equal(t, 0.015, result.Summary.PlatformRetryCostCNY)
	assert.Equal(t, 1, result.Summary.ExecutionSteps)
	assert.Equal(t, 1, result.Summary.JudgeEvaluations)
}

func TestBuildACUWorkTimelineUsesAuthoritativeJudgeDifficultyOnlyOnJudgePoint(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		Other:     `{"acu_logical_request_id":"req-authoritative-difficulty","acu_cost_breakdown":{"task_id":"task-1","segment_id":"seg-1","judge_calls":1,"judge_reused":false,"judge_protocol":"responses","difficulty":53.9,"judge_model":"gpt-5.6-luna","judge_attempts":[{"attempt_index":1,"model":"gpt-5.6-luna","provider":"wawazz","status":"success"}],"decision_summary":{"judge_result_source":"upstream_live"}}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true, map[string]float64{"seg-1": 58.2})
	require.Len(t, result.Items, 2)
	assert.Equal(t, "judge", result.Items[0].PointType)
	assert.Equal(t, 58.2, result.Items[0].Difficulty)
	assert.True(t, result.Items[0].DifficultyRecorded)
	assert.Equal(t, "execution", result.Items[1].PointType)
	assert.Equal(t, 53.9, result.Items[1].Difficulty)
	assert.True(t, result.Items[1].DifficultyRecorded)
}

func TestLoadACUTimelineJudgeDifficultiesBatchesUniqueSegments(t *testing.T) {
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ = io.ReadAll(request.Body)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"items":{"seg-1":{"difficulty":58.2}}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-timeline-token")

	logs := []*model.Log{
		{Other: `{"acu_cost_breakdown":{"segment_id":"seg-1","judge_calls":1}}`},
		{Other: `{"acu_cost_breakdown":{"segment_id":"seg-1","judge_calls":1}}`},
		{Other: `{"acu_cost_breakdown":{"segment_id":"seg-2","judge_reused":true}}`},
	}
	result, err := loadACUTimelineJudgeDifficulties(logs, 3)
	require.NoError(t, err)
	assert.Equal(t, map[string]float64{"seg-1": 58.2}, result)

	var payload map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &payload))
	assert.Equal(t, "3", payload["newapiUserId"])
	assert.Equal(t, []interface{}{"seg-1", "seg-2"}, payload["segmentIds"])
}

func TestBuildACUWorkTimelineFallsBackWhenAuthoritativeJudgeDifficultyIsUnavailable(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		Other:     `{"acu_logical_request_id":"req-fallback-difficulty","acu_cost_breakdown":{"task_id":"task-1","segment_id":"seg-1","judge_calls":1,"judge_protocol":"responses","difficulty":53.9,"judge_attempts":[{"model":"gpt-5.6-luna","status":"success"}],"decision_summary":{"judge_result_source":"upstream_live"}}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true, nil)
	require.Len(t, result.Items, 2)
	assert.Equal(t, 53.9, result.Items[0].Difficulty)
	assert.Equal(t, 53.9, result.Items[1].Difficulty)
}

func TestBuildACUWorkTimelineKeepsJudgeReuseOnExecutionPoint(t *testing.T) {
	logs := []*model.Log{{CreatedAt: 100, Type: model.LogTypeConsume, Other: `{"acu_logical_request_id":"req-reused","acu_cost_breakdown":{"task_id":"task-1","judge_calls":0,"judge_reused":true,"judge_protocol":"responses","decision_summary":{"judge_result_source":"recent_evaluation"}}}`}}
	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 1)
	assert.Equal(t, "execution", result.Items[0].PointType)
	assert.True(t, result.Items[0].JudgeReused)
}

func TestBuildACUWorkTimelineRecoversFinalizedJudgeTelemetryFromAdminInfo(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-5.6-sol",
		Other: `{
			"acu_logical_request_id":"req-historical-finalized",
			"acu_cost_breakdown":{
				"task_id":"task-1",
				"judge_calls":1,
				"judge_reused":false,
				"difficulty":72,
				"canonical_model":"gpt-5.6-sol",
				"user_charge_cny":0.125
			},
			"admin_info":{
				"actual_provider":"wawazz",
				"actual_channel":"wawazz-007",
				"acu_cost_breakdown":{
					"judge_model":"gpt-5.6-luna",
					"judge_protocol":"responses",
					"judge_reasoning_effort":"high",
					"judge_user_charge_cny":0.025,
					"provider_user_charge_cny":0.100,
					"judge_attempts":[{"attempt_index":1,"model":"gpt-5.6-luna","provider":"wawapii","channel_id":"wawapii-judge","status":"success"}],
					"decision_summary":{
						"judge_status":"completed",
						"judge_result_source":"upstream_live",
						"judge_first_attempt_succeeded":true,
						"judge_profile_attempt_count":1,
						"judge_same_model_failover_used":false
					}
				}
			}
		}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 2)
	judge := result.Items[0]
	assert.True(t, judge.JudgeCalled)
	assert.Equal(t, "judge", judge.PointType)
	assert.Equal(t, "gpt-5.6-luna", judge.JudgeModel)
	assert.Equal(t, "responses", judge.JudgeProtocol)
	assert.Equal(t, "upstream_live", judge.JudgeResultSource)
	assert.Equal(t, "completed", judge.JudgeStatus)
	assert.Equal(t, "completed", judge.Status)
	require.NotNil(t, judge.UserChargeCNY)
	assert.Equal(t, 0.025, *judge.UserChargeCNY)
	execution := result.Items[1]
	require.NotNil(t, execution.UserChargeCNY)
	assert.Equal(t, 0.100, *execution.UserChargeCNY)
	assert.InDelta(t, 0.125, *judge.UserChargeCNY+*execution.UserChargeCNY, 1e-12)
	assert.Equal(t, "wawazz", execution.Provider)
	assert.Equal(t, "wawazz-007", execution.Channel)

	public := PublicACUWorkTimeline(result)
	require.Len(t, public.Items, 2)
	assert.Equal(t, "wawapii", public.Items[0].Provider)
	assert.Equal(t, "wawapii-judge", public.Items[0].Channel)
	assert.Equal(t, "wawazz", public.Items[1].Provider)
	assert.Equal(t, "wawazz-007", public.Items[1].Channel)
}

func TestBuildACUWorkTimelineHydratesProviderAttemptsFromAdminInfo(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-5.6-sol",
		Other: `{
			"acu_logical_request_id":"req-hydrated-attempts",
			"acu_cost_breakdown":{
				"task_id":"task-1",
				"segment_id":"seg-1",
				"canonical_model":"gpt-5.6-sol",
				"logical_request_status":"completed"
			},
			"admin_info":{
				"actual_provider":"lucen",
				"actual_channel":"lucen-cx006-plus",
				"acu_cost_breakdown":{
					"channel_attempts":[
						{
							"attempt_index":1,
							"provider":"1pkapi",
							"channel":"7737",
							"execution_profile_id":"1pkapi-responses-x006:gpt-5.6-sol:responses",
							"model":"gpt-5.6-sol",
							"protocol":"responses",
							"endpoint_host":"1pkapi.example",
							"status":"error",
							"error_category":"slow_first_model_event",
							"error_class":"slow_first_model_event",
							"cooldown_until":"2026-08-16T16:12:35.348Z",
							"latency_ms":30004,
							"started_at":"2026-08-16T16:07:35.348Z",
							"completed_at":"2026-08-16T16:08:05.352Z"
						},
						{
							"attempt_index":2,
							"provider":"lucen",
							"channel":"1537",
							"execution_profile_id":"lucen-cx006-plus:gpt-5.6-sol:responses",
							"model":"gpt-5.6-sol",
							"protocol":"responses",
							"endpoint_host":"lucen.cc",
							"status":"success",
							"latency_ms":36417,
							"first_model_event_at":"2026-08-16T16:08:20.251Z",
							"first_model_event_latency_ms":14377,
							"started_at":"2026-08-16T16:08:05.669Z",
							"completed_at":"2026-08-16T16:08:42.088Z",
							"effective_cost_cny":0.07422972,
							"nominal_cost_usd":1.237162
						}
					]
				}
			}
		}`,
	}}

	admin := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, admin.Items, 1)
	item := admin.Items[0]
	assert.Equal(t, "completed_with_recovery", item.Status)
	assert.Equal(t, 2, item.ProfileAttemptCount)
	assert.Equal(t, 14377, item.FirstModelEventLatencyMs)
	assert.Equal(t, 66421, item.ProviderLatencyMs)
	assert.Equal(t, "slow_first_model_event", item.ErrorClass)
	assert.Equal(t, "2026-08-16T16:12:35.348Z", item.CooldownUntil)
	require.Len(t, item.ProviderAttempts, 2)
	assert.Equal(t, "1pkapi-responses-x006:gpt-5.6-sol:responses", item.ProviderAttempts[0].ExecutionProfileID)
	assert.Equal(t, "7737", item.ProviderAttempts[0].ChannelID)
	assert.Equal(t, "1pkapi.example", item.ProviderAttempts[0].EndpointHost)
	assert.Equal(t, "2026-08-16T16:07:35.348Z", item.ProviderAttempts[0].StartedAt)
	assert.Equal(t, "lucen-cx006-plus:gpt-5.6-sol:responses", item.ProviderAttempts[1].ExecutionProfileID)
	assert.Equal(t, "1537", item.ProviderAttempts[1].ChannelID)
	assert.Equal(t, "2026-08-16T16:08:20.251Z", item.ProviderAttempts[1].FirstModelEventAt)
	assert.Equal(t, 14377, item.ProviderAttempts[1].FirstModelEventLatencyMs)
	assert.Equal(t, "2026-08-16T16:08:42.088Z", item.ProviderAttempts[1].CompletedAt)

	public := PublicACUWorkTimeline(buildACUWorkTimeline(logs, 0, 200, false))
	require.Len(t, public.Items, 1)
	assert.Equal(t, "completed", public.Items[0].Status)
	assert.Zero(t, public.Items[0].ProfileAttemptCount)
	assert.Zero(t, public.Items[0].FirstModelEventLatencyMs)
	assert.Zero(t, public.Items[0].ProviderLatencyMs)
	assert.Empty(t, public.Items[0].ErrorClass)
	assert.Empty(t, public.Items[0].CooldownUntil)
	assert.Nil(t, public.Items[0].ProviderAttempts)
	assert.Empty(t, public.Items[0].ProviderAttempts)
}

func TestBuildACUWorkTimelinePrefersPublicIdentityAndSplitCharges(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		Other: `{
			"acu_logical_request_id":"req-public-priority",
			"acu_cost_breakdown":{
				"task_id":"task-1",
				"judge_calls":1,
				"judge_reused":false,
				"judge_protocol":"responses",
				"actual_provider":"public-provider",
				"channel_id":"public-channel",
				"judge_user_charge_cny":0.03,
				"provider_user_charge_cny":0.09,
				"channel_attempts":[{"attempt_index":1,"provider":"public-provider","channel":"public-channel","execution_profile_id":"public-profile","status":"success","latency_ms":12}]
			},
			"admin_info":{
				"actual_provider":"admin-provider",
				"actual_channel":"admin-channel",
				"acu_cost_breakdown":{
					"judge_user_charge_cny":0.025,
					"provider_user_charge_cny":0.100,
					"channel_attempts":[{"attempt_index":1,"provider":"admin-provider","channel":"admin-channel","execution_profile_id":"admin-profile","status":"error","latency_ms":99}]
				}
			}
		}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 2)
	judge, execution := result.Items[0], result.Items[1]
	require.NotNil(t, judge.UserChargeCNY)
	require.NotNil(t, execution.UserChargeCNY)
	assert.Equal(t, 0.03, *judge.UserChargeCNY)
	assert.Equal(t, 0.09, *execution.UserChargeCNY)
	assert.Equal(t, "public-provider", execution.Provider)
	assert.Equal(t, "public-channel", execution.Channel)
	require.Len(t, execution.ProviderAttempts, 1)
	assert.Equal(t, "public-profile", execution.ProviderAttempts[0].ExecutionProfileID)
}

func TestBuildACUWorkTimelineRecoversRulesFallbackFromAdminInfo(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		Other: `{
			"acu_logical_request_id":"req-rules-fallback",
			"acu_cost_breakdown":{"task_id":"task-1","judge_calls":1,"judge_reused":false},
			"admin_info":{"acu_cost_breakdown":{
				"judge_protocol":"responses",
				"decision_summary":{"judge_status":"rules_fallback","judge_result_source":"rules_strategy"}
			}}
		}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 2)
	judge := result.Items[0]
	assert.Equal(t, "judge", judge.PointType)
	assert.Equal(t, "rules_fallback", judge.Status)
	assert.Equal(t, "rules_fallback", judge.JudgeStatus)
	assert.Equal(t, "rules_strategy", judge.JudgeResultSource)
	assert.Equal(t, 1.0, result.Summary.JudgeRulesFallbackRate)
	assert.Equal(t, 1, result.Summary.JudgeRulesFallbackSamples)
}

func TestBuildACUWorkTimelineRecoversWorkPhaseFromAdminInfo(t *testing.T) {
	phases := []struct {
		name   string
		offset float64
	}{
		{"implementation", 3}, {"inspection", -8}, {"planning", 8}, {"verification", 0},
	}
	for _, phase := range phases {
		t.Run(phase.name, func(t *testing.T) {
			other := `{
				"acu_logical_request_id":"req-historical-` + phase.name + `",
				"acu_cost_breakdown":{"phase":"execution"},
				"admin_info":{"acu_cost_breakdown":{"decision_summary":{
					"work_phase":"` + phase.name + `",
					"work_phase_quality_target_offset":` + formatTimelineNumber(phase.offset) + `,
					"admin_only_decision_detail":"must not be projected"
				}}}
			}`
			result := buildACUWorkTimeline([]*model.Log{{CreatedAt: 100, Type: model.LogTypeConsume, Other: other}}, 0, 200, true)
			require.Len(t, result.Items, 1)
			assert.Equal(t, phase.name, result.Items[0].WorkPhase)
			assert.Equal(t, phase.offset, result.Items[0].WorkPhaseQualityTargetOffset)
		})
	}
}

func TestPublicACUWorkTimelineRedactsRecoveredJudgeSupplyDetails(t *testing.T) {
	timeline := dto.ACUWorkTimeline{Items: []dto.ACUWorkTimelineItem{{
		Provider:                  "wawazz",
		Channel:                   "wawazz-022",
		JudgeModel:                "gpt-5.6-luna",
		JudgeStatus:               "completed",
		JudgeResultSource:         "upstream_live",
		ActualCashCostCNY:         floatPointer(0.125),
		ActualCostCNY:             0.125,
		JudgeCostCNY:              0.025,
		ProviderCostCNY:           0.1,
		FailedAttemptCostCNY:      0.01,
		FailedJudgeAttemptCostCNY: 0.005,
		ProviderUserChargeCNY:     0.1,
		JudgeUserChargeCNY:        0.025,
		JudgeAttempts: []dto.ACUTimelineJudgeAttempt{{
			Model: "gpt-5.6-luna", Provider: "wawapii", ExecutionProfileID: "wawapii-judge",
		}},
		ProviderAttempts: []dto.ACUTimelineProviderAttempt{{
			Provider: "wawazz", Channel: "wawazz-022",
		}},
		TopCandidates: []dto.ACUTimelineCandidateSummary{{
			EstimatedCallCost: 0.02,
		}},
		JudgeProfileSelection: dto.ACUJudgeProfileSelection{
			SelectedExecutionProfileID: "wawapii-judge",
		},
	}}}

	public := PublicACUWorkTimeline(timeline)
	require.Len(t, public.Items, 1)
	item := public.Items[0]
	assert.Equal(t, "wawazz", item.Provider)
	assert.Equal(t, "wawazz-022", item.Channel)
	assert.Empty(t, item.JudgeModel)
	assert.Nil(t, item.ActualCashCostCNY)
	assert.Equal(t, 0.0, item.ActualCostCNY)
	assert.Equal(t, 0.0, item.JudgeCostCNY)
	assert.Equal(t, 0.0, item.ProviderCostCNY)
	assert.Equal(t, 0.0, item.FailedAttemptCostCNY)
	assert.Equal(t, 0.0, item.FailedJudgeAttemptCostCNY)
	assert.Equal(t, 0.0, item.ProviderUserChargeCNY)
	assert.Equal(t, 0.0, item.JudgeUserChargeCNY)
	assert.Nil(t, item.JudgeAttempts)
	assert.Nil(t, item.ProviderAttempts)
	assert.Equal(t, dto.ACUJudgeProfileSelection{}, item.JudgeProfileSelection)
	require.Len(t, item.TopCandidates, 1)
	assert.Equal(t, 0.0, item.TopCandidates[0].EstimatedCallCost)
	assert.Equal(t, "upstream_live", item.JudgeResultSource)
	assert.Equal(t, "completed", item.JudgeStatus)
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

	result := buildACUWorkTimeline(logs, 0, 200, true)
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

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 2)
	require.NotNil(t, result.Items[0].UserChargeCNY)
	assert.Nil(t, result.Items[0].ActualCashCostCNY)
	assert.Nil(t, result.Items[1].UserChargeCNY)
	require.NotNil(t, result.Items[1].ActualCashCostCNY)
	assert.Equal(t, 0.2, result.Summary.TotalUserChargeCNY)
	assert.Equal(t, 0.1, result.Summary.TotalActualCashCostCNY)
	assert.InDelta(t, 0.3, result.Summary.ActualTotalCostCNY, 1e-12)
}

func TestBuildACUWorkTimelineShowsUnsettledWithoutCountingCollectedCharge(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.6-luna", PromptTokens: 100, CompletionTokens: 20,
		Other: `{"acu_billing_status":"unsettled","acu_finalize_error_code":"insufficient_quota","acu_logical_request_id":"req-unsettled","user_charge_cny":"0.12","actual_total_cash_cost_cny":"0.08","acu_cost_breakdown":{"logical_request_status":"success","task_id":"task-1","canonical_model":"gpt-5.6-luna"}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 1)
	assert.Equal(t, "completed", result.Items[0].Status)
	assert.Equal(t, "unsettled", result.Items[0].BillingStatus)
	assert.Equal(t, "insufficient_quota", result.Items[0].BillingErrorCode)
	assert.Equal(t, 0.0, result.Summary.TotalUserChargeCNY)
	assert.Equal(t, 0.08, result.Summary.TotalActualCashCostCNY)
	assert.Equal(t, 1, result.Summary.UnsettledRequests)
}

func TestBuildACUWorkTimelineKeepsExplicitModelChargeWithoutDifficulty(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-5.6-terra",
		Other: `{"acu_billing_status":"finalized","acu_logical_request_id":"req-explicit-terra","user_charge_cny":"0.0125","acu_cost_breakdown":{"requested_model":"gpt-5.6-terra","canonical_model":"gpt-5.6-terra","judge_calls":0,"logical_request_status":"completed","user_charge_cny":"0.0125"}}`,
	}}

	result := buildACUWorkTimeline(logs, 0, 200, true)
	require.Len(t, result.Items, 1)
	item := result.Items[0]
	assert.Equal(t, "gpt-5.6-terra", item.RequestedModel)
	assert.Equal(t, "gpt-5.6-terra", item.ActualModel)
	assert.False(t, item.JudgeCalled)
	assert.False(t, item.DifficultyRecorded)
	require.NotNil(t, item.UserChargeCNY)
	assert.Equal(t, 0.0125, *item.UserChargeCNY)
	assert.Equal(t, 0.0125, result.Summary.TotalUserChargeCNY)
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
			result := buildACUWorkTimeline([]*model.Log{{CreatedAt: 100, Type: model.LogTypeConsume, Other: other}}, 0, 200, true)
			require.Len(t, result.Items, 1)
			assert.Equal(t, phase.name, result.Items[0].WorkPhase)
			assert.Equal(t, phase.offset, result.Items[0].WorkPhaseQualityTargetOffset)
		})
	}
}

func formatTimelineNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyACUWorkTimelineLatencySemanticsKeepsLogicalE2EAndProviderTTFTSeparate(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-5.6-luna",
		Other: `{
			"acu_logical_request_id":"req-latency",
			"acu_billing_status":"finalized",
			"frt":6000,
			"acu_cost_breakdown":{
				"logical_request_status":"completed",
				"task_id":"task-1",
				"segment_id":"seg-1",
				"judge_calls":1,
				"judge_reused":false,
				"judge_protocol":"responses",
				"judge_latency_ms":41000,
				"provider_latency_ms":12000,
				"end_to_end_latency_ms":54000,
				"decision_summary":{"judge_result_source":"upstream_live"},
				"channel_attempts":[{
					"attempt_index":1,
					"status":"success",
					"latency_ms":12000,
					"first_model_event_latency_ms":2500
				}]
			}
		}`,
	}}

	timeline := buildACUWorkTimeline(logs, 0, 200)
	require.Len(t, timeline.Items, 2)
	// The legacy projection overwrites execution E2E with provider latency.
	assert.Equal(t, 12000, timeline.Items[1].EndToEndLatencyMs)

	applyACUWorkTimelineLatencySemantics(&timeline, logs)
	require.Len(t, timeline.Items, 2)
	judge, execution := timeline.Items[0], timeline.Items[1]

	assert.Equal(t, "judge", judge.PointType)
	assert.Equal(t, 41000, judge.EndToEndLatencyMs)
	assert.Zero(t, judge.FirstModelEventLatencyMs)
	assert.Zero(t, judge.ProviderFirstModelEventLatencyMs)

	assert.Equal(t, "execution", execution.PointType)
	assert.Equal(t, 6000, execution.FirstModelEventLatencyMs)
	assert.Equal(t, 2500, execution.ProviderFirstModelEventLatencyMs)
	assert.Equal(t, 54000, execution.EndToEndLatencyMs)
	assert.Equal(t, 12000, execution.ProviderLatencyMs)
	assert.Equal(t, 6000, timeline.Summary.P50FirstModelEventLatencyMs)
	assert.Equal(t, 6000, timeline.Summary.P95FirstModelEventLatencyMs)
}

func TestApplyACUWorkTimelineLatencySemanticsDoesNotMislabelProviderTTFTWhenRequestTimingMissing(t *testing.T) {
	logs := []*model.Log{{
		CreatedAt: 100,
		Type:      model.LogTypeConsume,
		ModelName: "gpt-5.6-luna",
		Other: `{
			"acu_logical_request_id":"req-legacy",
			"acu_cost_breakdown":{
				"logical_request_status":"completed",
				"task_id":"task-1",
				"end_to_end_latency_ms":10000,
				"channel_attempts":[{
					"attempt_index":1,
					"status":"success",
					"latency_ms":9000,
					"first_model_event_latency_ms":3000
				}]
			}
		}`,
	}}

	timeline := buildACUWorkTimeline(logs, 0, 200)
	applyACUWorkTimelineLatencySemantics(&timeline, logs)
	require.Len(t, timeline.Items, 1)
	assert.Zero(t, timeline.Items[0].FirstModelEventLatencyMs)
	assert.Equal(t, 3000, timeline.Items[0].ProviderFirstModelEventLatencyMs)
	assert.Equal(t, 10000, timeline.Items[0].EndToEndLatencyMs)
}

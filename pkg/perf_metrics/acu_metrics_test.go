package perfmetrics

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestACULogsPopulateDetailAndSummaryWithoutLegacyBuckets(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.PerfMetric{}))
	oldDB, oldLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	now := time.Now().Add(-time.Minute).Unix()
	log := func(request, status, group string, latency, ttft, output int, private bool) model.Log {
		raw, err := common.Marshal(map[string]interface{}{
			"acu_cost_breakdown": map[string]interface{}{
				"logical_request_status": status, "end_to_end_latency_ms": latency,
				"first_model_event_latency_ms": ttft, "private_acu": private,
			},
		})
		require.NoError(t, err)
		return model.Log{UserId: 1, RequestId: request, ModelName: "claude-opus-5-5",
			Group: group, CreatedAt: now, Type: model.LogTypeConsume, CompletionTokens: output, Other: string(raw)}
	}
	rows := []model.Log{
		log("success", "completed", "default", 4000, 1000, 300, false),
		log("recovery", "completed_with_recovery", "default", 6000, 2000, 400, false),
		log("failure", "error", "default", 2000, 0, 0, false),
		log("private", "completed", "default", 100, 0, 1000, true),
		log("pending", "pending", "default", 100, 0, 1000, false),
		log("cancelled", "cancelled", "default", 100, 0, 1000, false),
		log("hidden", "completed", "disabled-group", 1000, 0, 10, false),
	}
	// Re-delivery of the same logical request must not count twice.
	rows = append(rows, rows[0])
	invalidTiming := log("invalid-timing", "completed", "default", -1, 0, 100, false)
	rows = append(rows, invalidTiming)
	invalidJSON := log("invalid-json", "completed", "default", 1000, 0, 100, false)
	invalidJSON.Other = `{"acu_cost_breakdown":invalid}`
	rows = append(rows, invalidJSON)
	require.NoError(t, db.Create(&rows).Error)
	RecordRelaySample(&relaycommon.RelayInfo{
		IsACUChannel: true, OriginModelName: "claude-opus-5-5", UsingGroup: "default",
		StartTime: time.Now().Add(-time.Second),
	}, true, 100)
	result, err := Query(QueryParams{Model: "claude-opus-5-5", Group: "default", Hours: 24})
	require.NoError(t, err)
	require.Len(t, result.Groups, 1)
	assert.Equal(t, int64(4000), result.Groups[0].AvgLatencyMs)
	assert.InDelta(t, 200.0/3, result.Groups[0].SuccessRate, 0.001)
	assert.InDelta(t, 100.0, result.Groups[0].AvgTps, 0.001)
	require.NotNil(t, result.Summary)
	assert.Equal(t, int64(3), result.Summary.RequestCount)

	filtered, err := Query(QueryParams{Model: "claude-opus-5-5", Hours: 24, Groups: []string{"default"}})
	require.NoError(t, err)
	require.NotNil(t, filtered.Summary)
	assert.Equal(t, int64(3), filtered.Summary.RequestCount)
	assert.Equal(t, int64(4000), filtered.Summary.AvgLatencyMs)

	summary, err := QuerySummaryAll(24, []string{"default"})
	require.NoError(t, err)
	require.Len(t, summary.Models, 1)
	assert.Equal(t, int64(3), summary.Models[0].RequestCount)
	assert.Equal(t, int64(4000), summary.Models[0].AvgLatencyMs)
	assert.InDelta(t, 100.0, summary.Models[0].AvgTps, 0.001)

	empty, err := Query(QueryParams{Model: "missing", Hours: 24})
	require.NoError(t, err)
	assert.Empty(t, empty.Groups)
}

func TestACUAndLegacyPerformanceAreWeightedTogetherWithoutAveragingGroupMeans(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.PerfMetric{}))
	oldDB, oldLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.PerfMetric{
		ModelName: "mixed", Group: "legacy", BucketTs: now,
		RequestCount: 9, SuccessCount: 9, TotalLatencyMs: 9000,
		OutputTokens: 900, GenerationMs: 9000,
	}).Error)
	require.NoError(t, db.Create(&model.Log{
		ModelName: "mixed", Group: "", CreatedAt: now, Type: model.LogTypeConsume,
		CompletionTokens: 10,
		Other:            `{"acu_cost_breakdown":{"logical_request_status":"completed","end_to_end_latency_ms":10000}}`,
	}).Error)
	result, err := Query(QueryParams{Model: "mixed", Hours: 24})
	require.NoError(t, err)
	require.NotNil(t, result.Summary)
	assert.Equal(t, int64(10), result.Summary.RequestCount)
	assert.Equal(t, int64(1900), result.Summary.AvgLatencyMs)
	assert.InDelta(t, 910.0/19, result.Summary.AvgTps, 0.001)
}

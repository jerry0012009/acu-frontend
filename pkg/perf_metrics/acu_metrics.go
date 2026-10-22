package perfmetrics

import (
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type acuMetricCacheKey struct {
	db           *gorm.DB
	model, group string
	start, end   int64
}

type acuMetricCacheEntry struct {
	expires time.Time
	buckets map[bucketKey]counters
}

var acuMetricCache = struct {
	sync.Mutex
	entries map[acuMetricCacheKey]acuMetricCacheEntry
}{entries: make(map[acuMetricCacheKey]acuMetricCacheEntry)}

// ACU skips legacy settlement, so its performance evidence lives in the
// finalized consume logs. Read it without modifying billing or backfilling DBs.
func acuPerformanceBuckets(params QueryParams, startTs, endTs int64) (map[bucketKey]counters, error) {
	key := acuMetricCacheKey{model.LOG_DB, params.Model, params.Group, startTs / 15, endTs / 15}
	acuMetricCache.Lock()
	defer acuMetricCache.Unlock()
	if cached, ok := acuMetricCache.entries[key]; ok && time.Now().Before(cached.expires) {
		return cached.buckets, nil
	}
	buckets := map[bucketKey]counters{}
	seen := map[string]bool{}
	err := model.ReadACUPerformanceLogs(params.Model, params.Group, startTs, endTs, func(log model.Log) {
		var metadata struct {
			Breakdown struct {
				Status     string   `json:"logical_request_status"`
				Private    bool     `json:"private_acu"`
				Latency    *float64 `json:"end_to_end_latency_ms"`
				FirstEvent *float64 `json:"first_model_event_latency_ms"`
			} `json:"acu_cost_breakdown"`
		}
		if common.UnmarshalJsonStr(log.Other, &metadata) != nil || metadata.Breakdown.Private {
			return
		}
		breakdown := metadata.Breakdown
		success := breakdown.Status == "completed" || breakdown.Status == "completed_with_recovery"
		if !success && breakdown.Status != "error" && breakdown.Status != "failed" &&
			breakdown.Status != "timeout" && breakdown.Status != "abandoned" {
			return
		}
		if log.RequestId != "" {
			key := fmt.Sprintf("%d:%s", log.UserId, log.RequestId)
			if seen[key] {
				return
			}
			seen[key] = true
		}
		group := log.Group
		if group == "" {
			group = "default"
		}
		// Invalid timing must not create a zero-latency or overflowing sample.
		if breakdown.Latency == nil || math.IsNaN(*breakdown.Latency) ||
			math.IsInf(*breakdown.Latency, 0) || *breakdown.Latency < 0 || *breakdown.Latency > 86_400_000 {
			return
		}
		latency := int64(*breakdown.Latency)
		value := counters{requestCount: 1, totalLatencyMs: latency}
		if success {
			value.successCount = 1
			generation := latency
			if breakdown.FirstEvent != nil && *breakdown.FirstEvent >= 0 && *breakdown.FirstEvent < float64(latency) {
				value.ttftCount = 1
				value.ttftSumMs = int64(*breakdown.FirstEvent)
				generation -= value.ttftSumMs
			}
			if generation > 0 && log.CompletionTokens > 0 {
				value.outputTokens = int64(log.CompletionTokens)
				value.generationMs = generation
			}
		}
		mergeCounters(buckets, bucketKey{model: log.ModelName, group: group, bucketTs: bucketStart(log.CreatedAt)}, value)
	})
	if err == nil {
		if len(acuMetricCache.entries) >= 64 {
			clear(acuMetricCache.entries)
		}
		acuMetricCache.entries[key] = acuMetricCacheEntry{time.Now().Add(15 * time.Second), buckets}
	}
	return buckets, err
}

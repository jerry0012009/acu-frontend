package service

import (
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

type acuTimelineLatencyEvidence struct {
	requestFirstModelEventMs  int
	providerFirstModelEventMs int
	endToEndMs                int
	rank                      int
}

// GetOwnedACUWorkTimelineAccurateTiming keeps the existing timeline builder
// and repairs the latency semantics from the original finalized log evidence.
// This deliberately avoids duplicating the routing/billing projection logic.
func GetOwnedACUWorkTimelineAccurateTiming(userID int, from, to int64, allowAdminAttemptHydration bool) (dto.ACUWorkTimeline, error) {
	logs, err := model.GetUserACUTimelineLogs(userID, from, to)
	if err != nil {
		return dto.ACUWorkTimeline{}, err
	}
	timeline := buildACUWorkTimeline(logs, from, to, allowAdminAttemptHydration)
	applyACUWorkTimelineLatencySemantics(&timeline, logs)
	return timeline, nil
}

func applyACUWorkTimelineLatencySemantics(timeline *dto.ACUWorkTimeline, logs []*model.Log) {
	if timeline == nil {
		return
	}
	evidence := acuTimelineLatencyEvidenceByRequest(logs)
	latencies := make([]int, 0, len(timeline.Items))
	for index := range timeline.Items {
		item := &timeline.Items[index]
		if item.PointType == "judge" {
			item.FirstModelEventLatencyMs = 0
			item.ProviderFirstModelEventLatencyMs = 0
			// Judge is an artificial sub-point, so its displayed duration is the
			// Judge step itself rather than the logical-request end-to-end time.
			item.EndToEndLatencyMs = item.JudgeLatencyMs
			continue
		}

		row := evidence[item.LogicalRequestID]
		item.ProviderFirstModelEventLatencyMs = firstPositiveInt(
			row.providerFirstModelEventMs,
			item.FirstModelEventLatencyMs,
		)
		// Do not silently fall back to provider TTFT: request-level first model
		// event and provider-attempt TTFT are different product metrics.
		item.FirstModelEventLatencyMs = row.requestFirstModelEventMs
		if row.endToEndMs > 0 {
			item.EndToEndLatencyMs = row.endToEndMs
			item.LatencySource = "reported"
		}
		if item.FirstModelEventLatencyMs > 0 {
			latencies = append(latencies, item.FirstModelEventLatencyMs)
		}
	}
	sort.Ints(latencies)
	timeline.Summary.P50FirstModelEventLatencyMs = percentile(latencies, .5)
	timeline.Summary.P95FirstModelEventLatencyMs = percentile(latencies, .95)
}

func acuTimelineLatencyEvidenceByRequest(logs []*model.Log) map[string]acuTimelineLatencyEvidence {
	result := make(map[string]acuTimelineLatencyEvidence, len(logs))
	for _, log := range logs {
		if log == nil {
			continue
		}
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
		providerFirst, _, _, _ := attemptFields(attempts)
		endToEnd, _ := reportedLatency(breakdown)
		requestFirst := positiveMilliseconds(other["frt"])

		rank := 0
		if stringValue(other, "acu_billing_status") == "finalized" {
			rank += 4
		}
		status := stringValue(breakdown, "logical_request_status")
		if status == "completed" || status == "success" || status == "completed_with_recovery" {
			rank += 2
		}
		if log.Type == model.LogTypeConsume {
			rank++
		}

		current, exists := result[logicalID]
		if !exists || rank >= current.rank {
			next := acuTimelineLatencyEvidence{
				requestFirstModelEventMs:  requestFirst,
				providerFirstModelEventMs: providerFirst,
				endToEndMs:                endToEnd,
				rank:                      rank,
			}
			if next.requestFirstModelEventMs == 0 {
				next.requestFirstModelEventMs = current.requestFirstModelEventMs
			}
			if next.providerFirstModelEventMs == 0 {
				next.providerFirstModelEventMs = current.providerFirstModelEventMs
			}
			if next.endToEndMs == 0 {
				next.endToEndMs = current.endToEndMs
			}
			result[logicalID] = next
		}
	}
	return result
}

func positiveMilliseconds(value interface{}) int {
	number, valid := numberValueOf(value)
	if !valid || number <= 0 {
		return 0
	}
	return int(number)
}

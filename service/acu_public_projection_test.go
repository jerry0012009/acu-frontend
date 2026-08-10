package service

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestPublicACUWorkTimelineOmitsInternalCostsButKeepsUserCharges(t *testing.T) {
	timeline := dto.ACUWorkTimeline{
		Summary: dto.ACUWorkTimelineSummary{
			PlatformRetryCostCNY:   0.12,
			TotalUserChargeCNY:     0.5,
			TotalActualCashCostCNY: 0.4,
			ActualTotalCostCNY:     0.5,
		},
		Items: []dto.ACUWorkTimelineItem{{
			UserChargeCNY:             floatPointer(0.5),
			ActualCashCostCNY:         floatPointer(0.4),
			ActualCostCNY:             0.5,
			JudgeCostCNY:              0.1,
			ProviderCostCNY:           0.3,
			FailedAttemptCostCNY:      0.05,
			FailedJudgeAttemptCostCNY: 0.02,
			ProviderUserChargeCNY:     0.4,
			JudgeUserChargeCNY:        0.1,
			JudgeAttempts: []dto.ACUTimelineJudgeAttempt{{
				EffectiveCostCNY: 0.02,
			}},
			TopCandidates: []dto.ACUTimelineCandidateSummary{{
				EstimatedCallCost: 0.03,
			}},
		}},
	}

	publicJSON, err := json.Marshal(PublicACUWorkTimeline(timeline))
	require.NoError(t, err)
	body := string(publicJSON)
	require.Contains(t, body, `"userChargeCny":0.5`)
	require.Contains(t, body, `"providerUserChargeCny":0.4`)
	require.Contains(t, body, `"judgeUserChargeCny":0.1`)
	for _, internalKey := range []string{
		`"actualCashCostCny"`,
		`"actualCostCny"`,
		`"judgeCostCny"`,
		`"providerCostCny"`,
		`"failedAttemptCostCny"`,
		`"failedJudgeAttemptCostCny"`,
		`"effectiveCostCny"`,
		`"estimatedCallCost"`,
		`"platformRetryCostCny"`,
		`"totalActualCashCostCny"`,
		`"actualTotalCostCny"`,
	} {
		require.NotContains(t, body, internalKey)
	}
}

func TestPublicACUSessionTraceOmitsInternalCostsButKeepsUserCharge(t *testing.T) {
	trace := dto.ACUSessionTrace{
		Segments: []dto.ACUSessionTraceSegment{{
			Route: &dto.ACUSessionTraceRoute{
				TopCandidates: []dto.ACUSessionTraceCandidateSummary{{
					EstimatedCallCost: 0.03,
				}},
			},
			LogicalRequests: []dto.ACUSessionTraceLogicalRequest{{
				UserChargeCNY:     floatPointer(0.5),
				ActualCashCostCNY: floatPointer(0.4),
				ActualCostCNY:     0.5,
			}},
		}},
	}

	publicJSON, err := json.Marshal(PublicACUSessionTrace(trace))
	require.NoError(t, err)
	body := string(publicJSON)
	require.Contains(t, body, `"userChargeCny":0.5`)
	for _, internalKey := range []string{
		`"actualCashCostCny"`,
		`"actualCostCny"`,
		`"estimatedCallCost"`,
	} {
		require.NotContains(t, body, internalKey)
	}
}

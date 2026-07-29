package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestOverlayACUPricingUsesDynamicAutoAndCatalogPrices(t *testing.T) {
	catalog := &acuPricingCatalog{
		PricingVersion: "catalog-v1",
		Auto: acuPricingAuto{
			ModelID:      "acu-auto",
			DisplayName:  "ACU Auto Router",
			PricingLabel: "动态计费",
		},
		Responses: []acuPricingResponse{{
			ModelID:                    "gpt-test",
			Role:                       "Value",
			InputPricePerMillion:       1,
			OutputPricePerMillion:      6,
			CachedInputPricePerMillion: 0.1,
			Protocol:                   "Responses",
			ToolCall:                   true,
			Reasoning:                  true,
			ActiveInAcuAuto:            true,
			Provider:                   "CloseAI",
			Status:                     "healthy",
		}},
	}

	got := overlayACUPricing(catalog, []model.Pricing{
		{ModelName: "acu-auto", ModelRatio: 37.5, CompletionRatio: 1},
		{ModelName: "gpt-test"},
	})

	require.Len(t, got, 2)
	require.Equal(t, "acu_dynamic", got[0].BillingMode)
	require.Equal(t, "ACU Auto Router", got[0].DisplayName)
	require.Zero(t, got[0].ModelRatio)
	require.Equal(t, 0.5, got[1].ModelRatio)
	require.Equal(t, 6.0, got[1].CompletionRatio)
	require.Equal(t, 1.0, *got[1].InputPricePerMillion)
	require.Equal(t, 6.0, *got[1].OutputPricePerMillion)
	require.Equal(t, 0.1, *got[1].CachedPricePerMillion)
	require.Equal(t, "Value", got[1].ACURole)
}

func TestACUCurveStatusCountsIncludesEmptyCategories(t *testing.T) {
	counts := acuCurveStatusCounts(&acuPricingCatalog{
		CurveModelStatuses: []acuCurveModelStatus{{
			ModelID:  "gpt-test",
			Statuses: []string{"active_responses"},
		}},
	})

	require.Equal(t, 1, counts["active_responses"])
	require.Equal(t, 0, counts["messages_incompatible"])
	require.Equal(t, 0, counts["preflight_failed"])
}

func TestACUCurveCostStatusesRemainVisible(t *testing.T) {
	statuses := sortedCurveStatuses(&acuPricingCatalog{CurveModelStatuses: []acuCurveModelStatus{{
		ModelID: "gpt-test", EffectiveCostStatuses: []string{"estimated", "verified"},
	}}})

	require.Equal(t, []string{"estimated", "verified"}, statuses[0].EffectiveCostStatuses)
}

func TestACUCurveModelIDSetContainsOnlyCatalogCurves(t *testing.T) {
	set := acuCurveModelIDSet(&acuPricingCatalog{CurveModelStatuses: []acuCurveModelStatus{
		{ModelID: "gpt-5.6-luna", Statuses: []string{"active_responses"}},
		{ModelID: " qwen3.7-max ", Statuses: []string{"preflight_failed"}},
	}})
	require.Equal(t, map[string]struct{}{"gpt-5.6-luna": {}, "qwen3.7-max": {}}, set)
}

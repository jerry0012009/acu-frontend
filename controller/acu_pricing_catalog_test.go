package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
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
			ModelID:                                "gpt-test",
			DisplayName:                            "GPT Test",
			Role:                                   "Value",
			InputPricePerMillion:                   1,
			OutputPricePerMillion:                  6,
			CachedInputPricePerMillion:             0.1,
			EffectiveInputPriceCNYPerMillion:       0.06,
			EffectiveOutputPriceCNYPerMillion:      0.36,
			EffectiveCachedInputPriceCNYPerMillion: 0.006,
			CostCurrency:                           "CNY",
			CostSemantics:                          "estimated_user_cash_cost",
			CostExecutionProfileID:                 "lucen-test:gpt-test:responses",
			CostProvider:                           "Lucen",
			CostChannel:                            "lucen-test",
			EffectiveCostStatus:                    "estimated",
			CurveProfile:                           "efficient_fast",
			ProfileConfidence:                      "low",
			Curve:                                  []acuCurvePoint{{DifficultyScore: 0, EstimatedQuality: 0.9, QualityLower: 0.8, QualityUpper: 1}},
			Protocol:                               "Responses",
			ToolCall:                               true,
			Reasoning:                              true,
			ActiveInAcuAuto:                        true,
			Provider:                               "CloseAI",
			Status:                                 "healthy",
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
	require.Equal(t, 0.03, got[1].ModelRatio)
	require.Equal(t, 6.0, got[1].CompletionRatio)
	require.Equal(t, 0.06, *got[1].InputPricePerMillion)
	require.Equal(t, 0.36, *got[1].OutputPricePerMillion)
	require.Equal(t, 0.006, *got[1].CachedPricePerMillion)
	require.Equal(t, "CNY", got[1].PriceCurrency)
	require.Equal(t, "estimated_user_cash_cost", got[1].PriceSemantics)
	require.Equal(t, "lucen-test:gpt-test:responses", got[1].ACUCostExecutionProfileID)
	require.Len(t, got[1].ACUCurve, 1)
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

func TestOverlayACUPricingPreservesNativeACUProtocols(t *testing.T) {
	catalog := &acuPricingCatalog{
		Auto: acuPricingAuto{ModelID: "acu-auto"},
		Responses: []acuPricingResponse{
			{ModelID: "claude-test", Protocol: "Messages", EffectiveInputPriceCNYPerMillion: 1, EffectiveOutputPriceCNYPerMillion: 2, EffectiveCachedInputPriceCNYPerMillion: 1},
			{ModelID: "dual-test", Protocol: "Messages + Responses", EffectiveInputPriceCNYPerMillion: 1, EffectiveOutputPriceCNYPerMillion: 2, EffectiveCachedInputPriceCNYPerMillion: 1},
		},
	}

	got := overlayACUPricing(catalog, nil)
	require.Equal(t, []string{"acu-auto", "claude-test", "dual-test"}, []string{
		got[0].ModelName, got[1].ModelName, got[2].ModelName,
	})
	require.Equal(t, []constant.EndpointType{constant.EndpointTypeAnthropic}, got[1].SupportedEndpointTypes)
	require.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAIResponse, constant.EndpointTypeAnthropic,
	}, got[2].SupportedEndpointTypes)
}

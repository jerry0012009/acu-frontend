package service

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTimelineQualityUsesOfficialBudgetAndProtocolInsteadOfSupplierCost(t *testing.T) {
	originalFX := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalFX })
	catalog := dto.ACURoutingCatalog{CatalogVersion: "test-catalog", Models: []dto.ACURoutingCatalogModel{
		qualityTestModel("free-reference", "responses", .99, 0),
		qualityTestModel("cheap", "responses", .8, 1),
		qualityTestModel("best-budget", "responses", .9, 2),
		qualityTestModel("expensive", "responses", .85, 8),
		qualityTestModel("gpt-6-astra", "responses", .88, 1),
		qualityTestModel("wrong-protocol", "messages", .99, 20),
	}}
	item := dto.ACUWorkTimelineItem{
		ActualModel: "cheap", Protocol: "responses", Difficulty: 50, DifficultyRecorded: true,
		BillingStatus: "finalized", InputTokens: 1000, OutputTokens: 1000,
	}
	breakdown := map[string]interface{}{
		"provider_user_charge_cny": .004, "judge_user_charge_cny": 50.0,
		"effective_provider_cash_cost_cny": .001, "failed_attempt_cash_cost_cny": 100.0,
		"official_catalog_cost_usd": .002,
		"route_decision": map[string]interface{}{
			"candidate_estimates": []interface{}{
				map[string]interface{}{"modelId": "cheap", "estimatedQuality": .77},
			},
		},
	}

	comparison := timelineQualityComparison(item, breakdown, breakdown, &catalog)

	require.NotNil(t, comparison.EstimatedQuality)
	assert.Equal(t, 77.0, *comparison.EstimatedQuality)
	assert.Equal(t, .004, *comparison.ModelChargeCNY)
	assert.Equal(t, .002, *comparison.OfficialModelCostCNY)
	require.NotNil(t, comparison.SameBudget)
	assert.Equal(t, "best-budget", comparison.SameBudget.ModelID)
	assert.Equal(t, 90.0, comparison.SameBudget.EstimatedQuality)
	require.NotNil(t, comparison.MostExpensive)
	assert.Equal(t, "gpt-6-astra", comparison.MostExpensive.ModelID)
	assert.Equal(t, "test-catalog", comparison.ReferenceCatalogVersion)
}

func TestTimelineQualityMatchesFinalModelAndReasoningEffort(t *testing.T) {
	item := dto.ACUWorkTimelineItem{
		ActualModel: "fallback", ResolvedReasoningEffort: "medium",
		Difficulty: 50, DifficultyRecorded: true, BillingStatus: "finalized",
	}
	breakdown := map[string]interface{}{
		"route_decision": map[string]interface{}{
			"candidate_estimates": []interface{}{
				map[string]interface{}{"modelId": "original", "reasoningEffort": "high", "estimatedQuality": .98},
				map[string]interface{}{"modelId": "fallback", "reasoningEffort": "high", "estimatedQuality": .9},
				map[string]interface{}{"modelId": "fallback", "reasoningEffort": "medium", "estimatedQuality": .7},
			},
		},
	}
	comparison := timelineQualityComparison(item, breakdown, breakdown, nil)
	require.NotNil(t, comparison.EstimatedQuality)
	assert.InDelta(t, 70, *comparison.EstimatedQuality, 1e-10)

	item.ResolvedReasoningEffort = "low"
	comparison = timelineQualityComparison(item, breakdown, breakdown, nil)
	assert.Nil(t, comparison.EstimatedQuality)
}

func TestTimelineQualityRetainsSelectedCanonicalEstimateWithClientReasoningEffort(t *testing.T) {
	item := dto.ACUWorkTimelineItem{
		ActualModel: "model", ResolvedReasoningEffort: "high",
		Difficulty: 50, DifficultyRecorded: true,
	}
	breakdown := map[string]interface{}{
		"decision_summary": map[string]interface{}{"selected_candidate_id": "model"},
		"route_decision": map[string]interface{}{
			"candidate_estimates": []interface{}{
				map[string]interface{}{"candidateId": "model", "modelId": "model", "estimatedQuality": .8},
				map[string]interface{}{"candidateId": "model@max", "modelId": "model", "reasoningEffort": "max", "estimatedQuality": .9},
			},
		},
	}
	comparison := timelineQualityComparison(item, breakdown, breakdown, nil)
	require.NotNil(t, comparison.EstimatedQuality)
	assert.Equal(t, 80.0, *comparison.EstimatedQuality)
}

func TestTimelineQualityDoesNotInventMissingDifficultyOrBudget(t *testing.T) {
	catalog := dto.ACURoutingCatalog{Models: []dto.ACURoutingCatalogModel{qualityTestModel("model", "responses", .8, 1)}}
	item := dto.ACUWorkTimelineItem{
		ActualModel: "model", Protocol: "responses", Difficulty: 50,
		BillingStatus: "finalized", InputTokens: 1000,
	}
	comparison := timelineQualityComparison(item, nil, nil, &catalog)
	assert.Nil(t, comparison.EstimatedQuality)
	assert.Nil(t, comparison.SameBudget)
	assert.Nil(t, comparison.MostExpensive)

	item.DifficultyRecorded = true
	comparison = timelineQualityComparison(item, nil, nil, &catalog)
	assert.Nil(t, comparison.ModelChargeCNY)
	assert.Nil(t, comparison.SameBudget)
	require.NotNil(t, comparison.MostExpensive)
	assert.Equal(t, 80.0, *comparison.EstimatedQuality)
}

func TestTimelineQualityDoesNotTreatAmbiguousLegacyTotalAsModelCharge(t *testing.T) {
	item := dto.ACUWorkTimelineItem{BillingStatus: "finalized", UserChargeCNY: floatPointer(.5)}
	comparison := timelineQualityComparison(item, nil, nil, nil)
	assert.Nil(t, comparison.ModelChargeCNY)
	comparison = timelineQualityComparison(item, map[string]interface{}{"mode": "explicit"}, nil, nil)
	require.NotNil(t, comparison.ModelChargeCNY)
	assert.Equal(t, .5, *comparison.ModelChargeCNY)
}

func TestTimelineQualityUsesPhaseAdjustedDifficultyForCurves(t *testing.T) {
	catalog := dto.ACURoutingCatalog{Models: []dto.ACURoutingCatalogModel{{
		ModelID: "model", DisplayName: "model", Protocols: []string{"responses"},
		Curve: []dto.ACURoutingCatalogCurvePoint{
			{DifficultyScore: 0, EstimatedQuality: 1},
			{DifficultyScore: 100, EstimatedQuality: 0},
		},
		ReferencePricing: &dto.ACURoutingCatalogReference{
			InputUSDPerMillion: floatPointer(1), OutputUSDPerMillion: floatPointer(1),
		},
	}}}
	item := dto.ACUWorkTimelineItem{
		ActualModel: "model", Protocol: "responses", Difficulty: 50,
		DifficultyRecorded: true, WorkPhaseQualityTargetOffset: 10,
	}

	comparison := timelineQualityComparison(item, nil, nil, &catalog)

	require.NotNil(t, comparison.QualityDifficulty)
	assert.Equal(t, 60.0, *comparison.QualityDifficulty)
	require.NotNil(t, comparison.EstimatedQuality)
	assert.Equal(t, 40.0, *comparison.EstimatedQuality)
	assert.Equal(t, "model_curve_phase_adjusted", comparison.QualitySource)
}

func TestTimelineQualityRejectsStaleCandidateScoresAtAnotherDifficulty(t *testing.T) {
	item := dto.ACUWorkTimelineItem{ActualModel: "model", Difficulty: 90, DifficultyRecorded: true}
	breakdown := map[string]interface{}{
		"route_decision": map[string]interface{}{
			"difficulty":          10.0,
			"candidate_estimates": []interface{}{map[string]interface{}{"modelId": "model", "estimatedQuality": .99}},
		},
	}
	comparison := timelineQualityComparison(item, breakdown, breakdown, nil)
	assert.Nil(t, comparison.EstimatedQuality)
}

func TestTimelineQualityHonorsHistoricalCurvesAndRealZeroScores(t *testing.T) {
	catalog := dto.ACURoutingCatalog{Models: []dto.ACURoutingCatalogModel{qualityTestModel("model", "responses", .99, 1)}}
	item := dto.ACUWorkTimelineItem{
		ActualModel: "model", Protocol: "responses", Difficulty: 50, DifficultyRecorded: true,
		BillingStatus: "finalized", InputTokens: 1000,
	}
	breakdown := map[string]interface{}{
		"route_decision": map[string]interface{}{
			"curves": map[string]interface{}{
				"model": []interface{}{
					map[string]interface{}{"difficulty": 0.0, "estimatedQuality": 80.0},
					map[string]interface{}{"difficulty": 100.0, "estimatedQuality": 0.0},
				},
			},
		},
	}
	comparison := timelineQualityComparison(item, breakdown, breakdown, &catalog)
	require.NotNil(t, comparison.EstimatedQuality)
	assert.Equal(t, 40.0, *comparison.EstimatedQuality)

	item.Difficulty = 100
	comparison = timelineQualityComparison(item, breakdown, breakdown, &catalog)
	require.NotNil(t, comparison.EstimatedQuality)
	assert.Zero(t, *comparison.EstimatedQuality)
}

func TestTimelineOfficialCostUsesCacheAndLongContextPrices(t *testing.T) {
	originalFX := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalFX })
	reference := &dto.ACURoutingCatalogReference{
		InputUSDPerMillion: floatPointer(1), OutputUSDPerMillion: floatPointer(2),
		ContextTiers: &dto.ACUContextTierPrices{
			ThresholdTokens: 2000,
			Standard:        dto.ACUTokenPrices{InputPricePerMillion: 1, OutputPricePerMillion: 2},
			LongContext: dto.ACUTokenPrices{
				InputPricePerMillion: 4, OutputPricePerMillion: 8,
				CachedInputPricePerMillion: floatPointer(.5), CacheWritePricePerMillion: floatPointer(5),
			},
		},
	}
	item := dto.ACUWorkTimelineItem{InputTokens: 1000, CachedInputTokens: 2000, OutputTokens: 100, BillingStatus: "finalized"}
	breakdown := map[string]interface{}{"billing_context_tokens": 3500.0, "cache_creation_input_tokens": 500.0}

	cost := timelineOfficialModelCost(reference, item, breakdown)
	require.NotNil(t, cost)
	assert.InDelta(t, .0083, *cost, 1e-12)
	assert.Nil(t, timelineOfficialModelCost(reference, item, nil))
	item.BillingStatus = "pending"
	assert.Nil(t, timelineOfficialModelCost(reference, item, breakdown))
}

func TestTimelineQualityPublicProjectionKeepsOnlySafeComparisonsAndSkipsJudge(t *testing.T) {
	logs := []*model.Log{{
		UserId: 1, CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "model", PromptTokens: 1000,
		Other: `{"acu_logical_request_id":"req","acu_billing_status":"finalized","acu_cost_breakdown":{"canonical_model":"model","protocol":"responses","difficulty":50,"judge_calls":1,"judge_protocol":"responses","user_charge_cny":0.5},"admin_info":{"acu_cost_breakdown":{"provider_user_charge_cny":0.2,"judge_user_charge_cny":0.3,"effective_provider_cash_cost_cny":0.01,"route_decision":{"candidate_estimates":[{"modelId":"model","estimatedQuality":0.8}]}}}}`,
	}}
	result := buildACUWorkTimelineWithQuality(logs, 0, 200, false, nil)
	result = PublicACUWorkTimeline(result)
	require.Len(t, result.Items, 2)
	assert.Nil(t, result.Items[0].QualityComparison)
	comparison := result.Items[1].QualityComparison
	require.NotNil(t, comparison)
	assert.Equal(t, .2, *comparison.ModelChargeCNY)
	assert.Equal(t, 80.0, *comparison.EstimatedQuality)
	assert.Nil(t, result.Items[1].ActualCashCostCNY)
	assert.Zero(t, result.Items[1].ProviderCostCNY)
}

func qualityTestModel(id, protocol string, quality, price float64) dto.ACURoutingCatalogModel {
	return dto.ACURoutingCatalogModel{
		ModelID: id, DisplayName: id, Protocols: []string{protocol},
		Curve: []dto.ACURoutingCatalogCurvePoint{
			{DifficultyScore: 0, EstimatedQuality: quality}, {DifficultyScore: 100, EstimatedQuality: quality},
		},
		ReferencePricing: &dto.ACURoutingCatalogReference{InputUSDPerMillion: floatPointer(price), OutputUSDPerMillion: floatPointer(price)},
	}
}

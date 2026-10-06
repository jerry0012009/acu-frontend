package service

import (
	"context"
	"math"
	"slices"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const timelineFlagshipReferenceModel = "gpt-6-astra"
const timelineQualityCatalogCacheTTL = 2 * time.Minute

var timelineQualityCatalogCache struct {
	sync.Mutex
	catalog   *dto.ACURoutingCatalog
	expiresAt time.Time
}

func loadACUTimelineQualityCatalog() *dto.ACURoutingCatalog {
	now := time.Now()
	timelineQualityCatalogCache.Lock()
	if timelineQualityCatalogCache.catalog != nil &&
		now.Before(timelineQualityCatalogCache.expiresAt) {
		catalog := timelineQualityCatalogCache.catalog
		timelineQualityCatalogCache.Unlock()
		return catalog
	}
	stale := timelineQualityCatalogCache.catalog
	timelineQualityCatalogCache.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), acuTimelineDependencyTimeout)
	defer cancel()
	catalog, err := GetACURoutingCatalog(ctx)
	if err != nil {
		if stale != nil {
			common.SysLog("ACU timeline catalog refresh failed; using stale catalog: " + err.Error())
			return stale
		}
		common.SysLog("ACU timeline catalog unavailable: " + err.Error())
		return nil
	}
	timelineQualityCatalogCache.Lock()
	timelineQualityCatalogCache.catalog = &catalog
	timelineQualityCatalogCache.expiresAt = time.Now().Add(timelineQualityCatalogCacheTTL)
	timelineQualityCatalogCache.Unlock()
	return &catalog
}

// Comparisons are read-only projections. Missing evidence is never replaced
// with the frontend's synthetic explicit-model difficulty.
func timelineQualityComparison(
	item dto.ACUWorkTimelineItem,
	breakdown, adminBreakdown map[string]interface{},
	catalog *dto.ACURoutingCatalog,
) *dto.ACUTimelineQualityComparison {
	result := &dto.ACUTimelineQualityComparison{}
	if item.BillingStatus == "finalized" {
		result.ModelChargeCNY = numberPointer(adminBreakdown, "provider_user_charge_cny")
		if result.ModelChargeCNY == nil {
			result.ModelChargeCNY = numberPointer(breakdown, "provider_user_charge_cny")
		}
		if result.ModelChargeCNY == nil && stringValue(breakdown, "mode") == "explicit" {
			result.ModelChargeCNY = item.UserChargeCNY
		}
		if result.ModelChargeCNY != nil && !validTimelineQualityNumber(*result.ModelChargeCNY, math.MaxFloat64) {
			result.ModelChargeCNY = nil
		}
		if official := numberPointer(breakdown, "official_catalog_cost_usd"); official != nil &&
			validTimelineQualityNumber(*official, math.MaxFloat64) && operation_setting.USDExchangeRate > 0 {
			cost := *official * operation_setting.USDExchangeRate
			if validTimelineQualityNumber(cost, math.MaxFloat64) {
				result.OfficialModelCostCNY = floatPointer(cost)
			}
		}
	}
	if !item.DifficultyRecorded || !validTimelineQualityNumber(item.Difficulty, 100) {
		return result
	}
	route := mapValue(adminBreakdown, "route_decision")
	if len(route) == 0 {
		route = mapValue(breakdown, "route_decision")
	}
	snapshot := mapValue(route, "decision_snapshot")
	candidates, _ := route["candidate_estimates"].([]interface{})
	if len(candidates) == 0 {
		candidates, _ = snapshot["candidates"].([]interface{})
	}
	if difficulty := numberPointer(route, "difficulty"); difficulty != nil && math.Abs(*difficulty-item.Difficulty) > 1e-6 {
		candidates = nil
	}
	selectedCandidateID := firstTimelineValue(
		item.SelectedCandidateID,
		stringValue(mapValue(adminBreakdown, "decision_summary"), "selected_candidate_id"),
		stringValue(snapshot, "selectedCandidateId"),
	)
	if quality := timelineCandidateQuality(candidates, item.ActualModel, item.ResolvedReasoningEffort, selectedCandidateID); quality != nil {
		result.EstimatedQuality = quality
		result.QualitySource = "route_snapshot"
	}
	if catalog == nil {
		return result
	}
	result.ReferenceCatalogVersion = catalog.CatalogVersion
	var cheapestPositiveReference *dto.ACUTimelineQualityReference
	curves := mapValue(route, "curves")
	if len(curves) == 0 {
		curves = mapValue(snapshot, "curves")
	}
	for _, model := range catalog.Models {
		if item.Protocol == "" || !slices.Contains(model.Protocols, item.Protocol) {
			continue
		}
		quality := timelineCurveQuality(model.Curve, item.Difficulty)
		if saved, ok := curves[model.ModelID]; ok {
			quality = timelineSavedCurveQuality(saved, item.Difficulty)
		}
		if quality == nil {
			continue
		}
		// Compare models at the same resolved reasoning effort when calibrated
		// candidate estimates are present in the historical route.
		if estimated := timelineCandidateQuality(candidates, model.ModelID, item.ResolvedReasoningEffort); estimated != nil {
			quality = estimated
		}
		if result.EstimatedQuality == nil && model.ModelID == item.ActualModel &&
			(item.ResolvedReasoningEffort == "" || item.ResolvedReasoningEffort == "default") {
			result.EstimatedQuality = quality
			result.QualitySource = "model_curve"
		}
		cost := timelineOfficialModelCost(model.ReferencePricing, item, adminBreakdown)
		if cost == nil {
			continue
		}
		reference := &dto.ACUTimelineQualityReference{
			ModelID: model.ModelID, DisplayName: firstTimelineValue(model.DisplayName, model.ModelID),
			EstimatedQuality: *quality, OfficialCostCNY: *cost,
		}
		if *cost > 0 &&
			(cheapestPositiveReference == nil ||
				*cost < cheapestPositiveReference.OfficialCostCNY ||
				(*cost == cheapestPositiveReference.OfficialCostCNY &&
					model.ModelID < cheapestPositiveReference.ModelID)) {
			cheapestPositiveReference = reference
		}
		if model.ModelID == timelineFlagshipReferenceModel ||
			(result.MostExpensive == nil ||
				result.MostExpensive.ModelID != timelineFlagshipReferenceModel &&
					(*cost > result.MostExpensive.OfficialCostCNY ||
						(*cost == result.MostExpensive.OfficialCostCNY &&
							model.ModelID < result.MostExpensive.ModelID))) {
			result.MostExpensive = reference
		}
		if result.ModelChargeCNY != nil && *cost > 0 &&
			*cost <= *result.ModelChargeCNY+1e-10 &&
			(result.SameBudget == nil || *quality > result.SameBudget.EstimatedQuality ||
				(*quality == result.SameBudget.EstimatedQuality && *cost < result.SameBudget.OfficialCostCNY)) {
			result.SameBudget = reference
		}
	}
	if result.SameBudget == nil && result.ModelChargeCNY != nil {
		result.SameBudget = cheapestPositiveReference
	}
	return result
}

func validTimelineQualityNumber(value, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0 && value <= maximum
}

func timelineCandidateQuality(candidates []interface{}, modelID, effort string, selectedIDs ...string) *float64 {
	for _, value := range candidates {
		candidate, ok := value.(map[string]interface{})
		if !ok || stringValue(candidate, "modelId") != modelID {
			continue
		}
		candidateEffort := stringValue(candidate, "reasoningEffort")
		selectedCanonical := len(selectedIDs) > 0 && selectedIDs[0] != "" &&
			stringValue(candidate, "candidateId") == selectedIDs[0] &&
			stringValue(candidate, "executionPresetId") == "" && candidateEffort == ""
		if !selectedCanonical && candidateEffort != effort && !(candidateEffort == "" && (effort == "" || effort == "default")) {
			continue
		}
		quality := numberPointer(candidate, "estimatedQuality")
		if quality != nil && validTimelineQualityNumber(*quality, 1) {
			return floatPointer(*quality * 100)
		}
	}
	return nil
}

func timelineCurveQuality(curve []dto.ACURoutingCatalogCurvePoint, difficulty float64) *float64 {
	for index, point := range curve {
		if !validTimelineQualityNumber(point.EstimatedQuality, 1) {
			return nil
		}
		if point.DifficultyScore == difficulty {
			return floatPointer(point.EstimatedQuality * 100)
		}
		if index > 0 && point.DifficultyScore > difficulty {
			left := curve[index-1]
			span := point.DifficultyScore - left.DifficultyScore
			if span <= 0 || difficulty < left.DifficultyScore {
				return nil
			}
			fraction := (difficulty - left.DifficultyScore) / span
			return floatPointer(100 * (left.EstimatedQuality + fraction*(point.EstimatedQuality-left.EstimatedQuality)))
		}
	}
	return nil
}

func timelineSavedCurveQuality(value interface{}, difficulty float64) *float64 {
	points, _ := value.([]interface{})
	curve := make([]dto.ACURoutingCatalogCurvePoint, 0, len(points))
	for _, value := range points {
		point, ok := value.(map[string]interface{})
		if !ok {
			return nil
		}
		d := numberPointer(point, "difficulty")
		q := numberPointer(point, "estimatedQuality")
		if d == nil || q == nil || !validTimelineQualityNumber(*q, 100) {
			return nil
		}
		curve = append(curve, dto.ACURoutingCatalogCurvePoint{DifficultyScore: *d, EstimatedQuality: *q / 100})
	}
	return timelineCurveQuality(curve, difficulty)
}

func timelineOfficialModelCost(
	reference *dto.ACURoutingCatalogReference,
	item dto.ACUWorkTimelineItem,
	breakdown map[string]interface{},
) *float64 {
	if reference == nil || reference.InputUSDPerMillion == nil || reference.OutputUSDPerMillion == nil ||
		item.BillingStatus != "finalized" || (item.InputTokens == 0 && item.OutputTokens == 0) {
		return nil
	}
	write := int64(numberValue(breakdown, "cache_creation_input_tokens"))
	context := int64(numberValue(breakdown, "billing_context_tokens"))
	if context == 0 {
		if item.CachedInputTokens > 0 || write > 0 {
			return nil
		}
		context = item.InputTokens
	}
	uncached := context - item.CachedInputTokens - write
	if uncached < 0 || write < 0 || item.CachedInputTokens < 0 || item.OutputTokens < 0 {
		return nil
	}
	prices := dto.ACUTokenPrices{
		InputPricePerMillion: *reference.InputUSDPerMillion, OutputPricePerMillion: *reference.OutputUSDPerMillion,
		CachedInputPricePerMillion: reference.CachedInputUSDPerMillion, CacheWritePricePerMillion: reference.CacheWriteUSDPerMillion,
	}
	if tiers := reference.ContextTiers; tiers != nil {
		prices = tiers.Standard
		if context > int64(tiers.ThresholdTokens) {
			prices = tiers.LongContext
		}
	}
	cachedPrice := prices.InputPricePerMillion
	if prices.CachedInputPricePerMillion != nil {
		cachedPrice = *prices.CachedInputPricePerMillion
	}
	writePrice := prices.InputPricePerMillion
	if write > 0 {
		if prices.CacheWritePricePerMillion == nil {
			return nil
		}
		writePrice = *prices.CacheWritePricePerMillion
	}
	for _, price := range []float64{prices.InputPricePerMillion, prices.OutputPricePerMillion, cachedPrice, writePrice} {
		if !validTimelineQualityNumber(price, math.MaxFloat64) {
			return nil
		}
	}
	cost := (float64(uncached)*prices.InputPricePerMillion +
		float64(item.CachedInputTokens)*cachedPrice + float64(write)*writePrice +
		float64(item.OutputTokens)*prices.OutputPricePerMillion) / 1_000_000 * operation_setting.USDExchangeRate
	if !validTimelineQualityNumber(cost, math.MaxFloat64) || operation_setting.USDExchangeRate <= 0 {
		return nil
	}
	return floatPointer(cost)
}

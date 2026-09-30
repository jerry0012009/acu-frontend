package controller

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
)

type acuPricingAuto struct {
	ModelID            string `json:"modelId"`
	DisplayName        string `json:"displayName"`
	Description        string `json:"description"`
	PricingLabel       string `json:"pricingLabel"`
	PricingDescription string `json:"pricingDescription"`
}

type acuCatalogPayable struct {
	ContextTiers             *dto.ACUContextTierPrices `json:"contextTiers,omitempty"`
	InputCNYPerMillion       float64                   `json:"inputCnyPerMillion"`
	OutputCNYPerMillion      float64                   `json:"outputCnyPerMillion"`
	CachedInputCNYPerMillion *float64                  `json:"cachedInputCnyPerMillion"`
	CacheWriteCNYPerMillion  *float64                  `json:"cacheWriteCnyPerMillion"`
	Status                   string                    `json:"status"`
	PricingPolicyVersion     string                    `json:"pricingPolicyVersion"`
}

func (price *acuCatalogPayable) public() *model.PricingPayable {
	if price == nil {
		return nil
	}
	return &model.PricingPayable{
		ContextTiers:       price.ContextTiers,
		InputCNYPerMillion: price.InputCNYPerMillion, OutputCNYPerMillion: price.OutputCNYPerMillion,
		CachedInputCNYPerMillion: price.CachedInputCNYPerMillion, Status: price.Status,
		CacheWriteCNYPerMillion: price.CacheWriteCNYPerMillion,
		PricingPolicyVersion:    price.PricingPolicyVersion,
	}
}

type acuCatalogReference struct {
	ContextTiers             *dto.ACUContextTierPrices `json:"contextTiers,omitempty"`
	InputCNYPerMillion       float64                   `json:"inputCnyPerMillion"`
	OutputCNYPerMillion      float64                   `json:"outputCnyPerMillion"`
	CachedInputCNYPerMillion *float64                  `json:"cachedInputCnyPerMillion"`
	SourceType               string                    `json:"sourceType"`
	SourceName               string                    `json:"sourceName"`
	ObservedAt               string                    `json:"observedAt"`
	OriginalCurrency         string                    `json:"originalCurrency"`
	FXCNYPerUSD              *float64                  `json:"fxCnyPerUsd"`
}

func (price *acuCatalogReference) public() *model.PricingReference {
	if price == nil {
		return nil
	}
	return &model.PricingReference{
		ContextTiers:       price.ContextTiers,
		InputCNYPerMillion: price.InputCNYPerMillion, OutputCNYPerMillion: price.OutputCNYPerMillion,
		CachedInputCNYPerMillion: price.CachedInputCNYPerMillion, SourceType: price.SourceType,
		SourceName: price.SourceName, ObservedAt: price.ObservedAt, OriginalCurrency: price.OriginalCurrency,
		FXCNYPerUSD: price.FXCNYPerUSD,
	}
}

type acuPricingResponse struct {
	ModelID                                string                        `json:"modelId"`
	DisplayName                            string                        `json:"displayName"`
	Role                                   string                        `json:"role"`
	InputPricePerMillion                   float64                       `json:"inputPricePerMillion"`
	OutputPricePerMillion                  float64                       `json:"outputPricePerMillion"`
	CachedInputPricePerMillion             float64                       `json:"cachedInputPricePerMillion"`
	EffectiveInputPriceCNYPerMillion       float64                       `json:"effectiveInputPriceCnyPerMillion"`
	EffectiveOutputPriceCNYPerMillion      float64                       `json:"effectiveOutputPriceCnyPerMillion"`
	EffectiveCachedInputPriceCNYPerMillion float64                       `json:"effectiveCachedInputPriceCnyPerMillion"`
	Payable                                *acuCatalogPayable            `json:"payable"`
	PayableByProtocol                      map[string]*acuCatalogPayable `json:"payableByProtocol"`
	Reference                              *acuCatalogReference          `json:"reference"`
	CostCurrency                           string                        `json:"costCurrency"`
	CostSemantics                          string                        `json:"costSemantics"`
	EffectiveCostStatus                    string                        `json:"effectiveCostStatus"`
	CurveProfile                           string                        `json:"curveProfile"`
	ProfileConfidence                      string                        `json:"profileConfidence"`
	Curve                                  []acuCurvePoint               `json:"curve"`
	Protocol                               string                        `json:"protocol"`
	ToolCall                               bool                          `json:"toolCall"`
	Reasoning                              bool                          `json:"reasoning"`
	ActiveInAcuAuto                        bool                          `json:"activeInAcuAuto"`
	Status                                 string                        `json:"status"`
	HealthyChannelCount                    int                           `json:"healthyChannelCount"`
	EffectiveCostStatuses                  []string                      `json:"effectiveCostStatuses"`
	CurrentlyEligible                      bool                          `json:"currentlyEligible"`
	TemporarilyUnavailableReason           *string                       `json:"temporarilyUnavailableReason"`
}

type acuCurvePoint = model.ACUPricingCurvePoint

type acuCurveModelStatus struct {
	ModelID                      string   `json:"modelId"`
	Statuses                     []string `json:"statuses"`
	HealthyChannelCount          int      `json:"healthyChannelCount"`
	EffectiveCostStatuses        []string `json:"effectiveCostStatuses"`
	TemporarilyUnavailableReason *string  `json:"temporarilyUnavailableReason"`
}

type acuPricingCatalog struct {
	SchemaVersion        string                `json:"schemaVersion"`
	SourceCatalogVersion string                `json:"sourceCatalogVersion"`
	PricingVersion       string                `json:"pricingVersion"`
	DisplayMode          string                `json:"displayMode"`
	Auto                 acuPricingAuto        `json:"auto"`
	Responses            []acuPricingResponse  `json:"responses"`
	CurveModelStatuses   []acuCurveModelStatus `json:"curveModelStatuses"`
}

const acuPricingCatalogCacheTTL = 30 * time.Second

var acuPricingCatalogCache = struct {
	sync.RWMutex
	catalog   *acuPricingCatalog
	expiresAt time.Time
}{}

var acuPricingCatalogRefreshMu sync.Mutex

func loadACUPricingCatalog(ctx context.Context) (*acuPricingCatalog, error) {
	now := time.Now()
	acuPricingCatalogCache.RLock()
	if acuPricingCatalogCache.catalog != nil && now.Before(acuPricingCatalogCache.expiresAt) {
		catalog := acuPricingCatalogCache.catalog
		acuPricingCatalogCache.RUnlock()
		return catalog, nil
	}
	acuPricingCatalogCache.RUnlock()

	acuPricingCatalogRefreshMu.Lock()
	defer acuPricingCatalogRefreshMu.Unlock()

	acuPricingCatalogCache.RLock()
	if acuPricingCatalogCache.catalog != nil && time.Now().Before(acuPricingCatalogCache.expiresAt) {
		catalog := acuPricingCatalogCache.catalog
		acuPricingCatalogCache.RUnlock()
		return catalog, nil
	}
	staleCatalog := acuPricingCatalogCache.catalog
	acuPricingCatalogCache.RUnlock()

	routingCatalog, err := service.GetACURoutingCatalog(ctx)
	if err != nil {
		return staleCatalog, err
	}
	if routingCatalog.CatalogVersion == "" {
		return staleCatalog, fmt.Errorf("ACU Router catalog metadata is unavailable")
	}

	type corridorResult struct {
		protocol string
		value    map[string]interface{}
		err      error
	}
	protocols := []string{"responses", "messages", "chat_completions"}
	results := make(chan corridorResult, len(protocols))
	for _, protocol := range protocols {
		go func(protocol string) {
			value, loadErr := service.GetACUSelectionCorridor(ctx, 100000, 4000, nil, protocol)
			results <- corridorResult{protocol: protocol, value: value, err: loadErr}
		}(protocol)
	}
	corridors := make(map[string]map[string]interface{}, len(protocols))
	for range protocols {
		result := <-results
		if result.err != nil {
			return staleCatalog, fmt.Errorf("load ACU %s pricing: %w", result.protocol, result.err)
		}
		corridors[result.protocol] = result.value
	}

	catalog, err := buildLiveACUPricingCatalog(routingCatalog, corridors)
	if err != nil {
		return staleCatalog, err
	}
	if mode := strings.TrimSpace(os.Getenv("ACU_PRICING_DISPLAY_MODE")); mode != "" {
		if mode != "payable_only" && mode != "reference_only" && mode != "comparison" {
			return staleCatalog, fmt.Errorf("invalid ACU_PRICING_DISPLAY_MODE %q", mode)
		}
		catalog.DisplayMode = mode
	}
	if catalog.DisplayMode == "" {
		catalog.DisplayMode = "comparison"
	}
	acuPricingCatalogCache.Lock()
	acuPricingCatalogCache.catalog = catalog
	acuPricingCatalogCache.expiresAt = time.Now().Add(acuPricingCatalogCacheTTL)
	acuPricingCatalogCache.Unlock()
	return catalog, nil
}

func buildLiveACUPricingCatalog(
	routingCatalog dto.ACURoutingCatalog,
	corridors map[string]map[string]interface{},
) (*acuPricingCatalog, error) {
	fxCNYPerUSD := 6.74
	if raw := strings.TrimSpace(os.Getenv("ACU_PRICING_REFERENCE_USD_CNY")); raw != "" {
		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil || parsed <= 0 {
			return nil, fmt.Errorf("invalid ACU_PRICING_REFERENCE_USD_CNY %q", raw)
		}
		fxCNYPerUSD = parsed
	}
	pricingByProtocol := make(map[string]map[string]map[string]interface{}, len(corridors))
	for protocol, corridor := range corridors {
		pricingByProtocol[protocol] = acuPricingMap(corridor["pricing"])
	}

	responses := make([]acuPricingResponse, 0, len(routingCatalog.Models))
	statuses := make([]acuCurveModelStatus, 0, len(routingCatalog.Models))
	for _, catalogModel := range routingCatalog.Models {
		payableByProtocol := make(map[string]*acuCatalogPayable)
		effectiveStatuses := make([]string, 0, len(catalogModel.Protocols))
		statusLabels := make([]string, 0, len(catalogModel.Protocols))
		for _, protocol := range catalogModel.Protocols {
			price := pricingByProtocol[protocol][catalogModel.ModelID]
			if price == nil {
				continue
			}
			payable := acuPayableFromCorridor(price, routingCatalog.PricingPolicyVersion)
			if payable == nil {
				continue
			}
			payableByProtocol[protocol] = payable
			effectiveStatuses = appendUniqueString(effectiveStatuses, stringMapValue(price, "effectiveCostStatus"))
			statusLabels = append(statusLabels, "active_"+protocol)
		}

		protocolLabel := acuProtocolLabel(catalogModel.Protocols)
		displayPayable := preferredACUPayable(payableByProtocol)
		currentlyEligible := displayPayable != nil
		var unavailableReason *string
		status := "routing_active"
		if !currentlyEligible {
			reason := "no_current_eligible_profile"
			unavailableReason = &reason
			status = "temporarily_unavailable"
			statusLabels = append(statusLabels, "provider_unavailable", "missing_price")
		}

		reference := acuReferenceFromCatalog(catalogModel, fxCNYPerUSD)
		response := acuPricingResponse{
			ModelID:                      catalogModel.ModelID,
			DisplayName:                  firstNonEmpty(catalogModel.DisplayName, catalogModel.ModelID),
			Role:                         catalogModel.CapabilityTier,
			Payable:                      displayPayable,
			PayableByProtocol:            payableByProtocol,
			Reference:                    reference,
			CostCurrency:                 "CNY",
			CostSemantics:                "estimated_user_payable_price",
			EffectiveCostStatus:          firstNonEmptyString(effectiveStatuses, "missing"),
			CurveProfile:                 catalogModel.CurveProfile,
			ProfileConfidence:            catalogModel.ProfileConfidence,
			Curve:                        acuCurveFromCatalog(catalogModel.Curve),
			Protocol:                     protocolLabel,
			ToolCall:                     catalogModel.ToolCallSupport,
			Reasoning:                    len(catalogModel.RoutingCandidates) > 0,
			ActiveInAcuAuto:              catalogModel.AutoRouteEnabled,
			Status:                       status,
			HealthyChannelCount:          boolInt(currentlyEligible),
			EffectiveCostStatuses:        effectiveStatuses,
			CurrentlyEligible:            currentlyEligible,
			TemporarilyUnavailableReason: unavailableReason,
		}
		if reference != nil {
			response.InputPricePerMillion = reference.InputCNYPerMillion / fxCNYPerUSD
			response.OutputPricePerMillion = reference.OutputCNYPerMillion / fxCNYPerUSD
			if reference.CachedInputCNYPerMillion != nil {
				response.CachedInputPricePerMillion = *reference.CachedInputCNYPerMillion / fxCNYPerUSD
			}
		}
		if displayPayable != nil {
			response.EffectiveInputPriceCNYPerMillion = displayPayable.InputCNYPerMillion
			response.EffectiveOutputPriceCNYPerMillion = displayPayable.OutputCNYPerMillion
			if displayPayable.CachedInputCNYPerMillion != nil {
				response.EffectiveCachedInputPriceCNYPerMillion = *displayPayable.CachedInputCNYPerMillion
			}
		}
		responses = append(responses, response)
		statuses = append(statuses, acuCurveModelStatus{
			ModelID: catalogModel.ModelID, Statuses: statusLabels,
			HealthyChannelCount:          boolInt(currentlyEligible),
			EffectiveCostStatuses:        effectiveStatuses,
			TemporarilyUnavailableReason: unavailableReason,
		})
	}
	sort.Slice(responses, func(i, j int) bool { return responses[i].ModelID < responses[j].ModelID })
	return &acuPricingCatalog{
		SchemaVersion:        "acu-pricing-live-v1",
		SourceCatalogVersion: routingCatalog.CatalogVersion,
		PricingVersion:       routingCatalog.CatalogVersion + "+" + routingCatalog.PricingPolicyVersion,
		DisplayMode:          "comparison",
		Auto: acuPricingAuto{
			ModelID: "acu-auto", DisplayName: "ACU Auto Router",
			Description:        "Routes each request to an eligible ACU model",
			PricingLabel:       "Dynamic pricing",
			PricingDescription: "Charged from the selected execution profile",
		},
		Responses: responses, CurveModelStatuses: statuses,
	}, nil
}

func acuPricingMap(value interface{}) map[string]map[string]interface{} {
	result := map[string]map[string]interface{}{}
	values, ok := value.(map[string]interface{})
	if !ok {
		return result
	}
	for modelID, raw := range values {
		if price, ok := raw.(map[string]interface{}); ok {
			result[modelID] = price
		}
	}
	return result
}

func acuPayableFromCorridor(price map[string]interface{}, policyVersion string) *acuCatalogPayable {
	input, inputOK := floatMapValue(price, "payableInputPriceCnyPerMillion")
	output, outputOK := floatMapValue(price, "payableOutputPriceCnyPerMillion")
	if !inputOK || !outputOK || input <= 0 || output <= 0 {
		return nil
	}
	return &acuCatalogPayable{
		ContextTiers:       dto.ParseACUContextTierPrices(price["payableContextTiers"]),
		InputCNYPerMillion: input, OutputCNYPerMillion: output,
		CachedInputCNYPerMillion: optionalFloatMapValue(price, "payableCachedInputPriceCnyPerMillion"),
		CacheWriteCNYPerMillion:  optionalFloatMapValue(price, "payableCacheWritePriceCnyPerMillion"),
		Status:                   firstNonEmpty(stringMapValue(price, "effectiveCostStatus"), "estimated"),
		PricingPolicyVersion:     policyVersion,
	}
}

func acuReferenceFromCatalog(catalogModel dto.ACURoutingCatalogModel, fx float64) *acuCatalogReference {
	reference := catalogModel.ReferencePricing
	if reference == nil || reference.InputUSDPerMillion == nil || reference.OutputUSDPerMillion == nil {
		return nil
	}
	var cached *float64
	if reference.CachedInputUSDPerMillion != nil {
		value := *reference.CachedInputUSDPerMillion * fx
		cached = &value
	}
	observedAt := ""
	if reference.ObservedAt != nil {
		observedAt = *reference.ObservedAt
	}
	sourceName := firstNonEmpty(catalogModel.Vendor, "Vendor") + " official pricing"
	return &acuCatalogReference{
		ContextTiers:             reference.ContextTiers.Scale(fx),
		InputCNYPerMillion:       *reference.InputUSDPerMillion * fx,
		OutputCNYPerMillion:      *reference.OutputUSDPerMillion * fx,
		CachedInputCNYPerMillion: cached, SourceType: "official",
		SourceName: sourceName, ObservedAt: observedAt, OriginalCurrency: "USD", FXCNYPerUSD: &fx,
	}
}

func acuCurveFromCatalog(points []dto.ACURoutingCatalogCurvePoint) []acuCurvePoint {
	result := make([]acuCurvePoint, 0, len(points))
	for _, point := range points {
		result = append(result, acuCurvePoint{
			DifficultyScore: point.DifficultyScore, EstimatedQuality: point.EstimatedQuality,
			QualityLower: point.QualityLower, QualityUpper: point.QualityUpper,
		})
	}
	return result
}

func acuProtocolLabel(protocols []string) string {
	labels := make([]string, 0, len(protocols))
	for _, protocol := range []string{"chat_completions", "messages", "responses"} {
		if containsString(protocols, protocol) {
			switch protocol {
			case "chat_completions":
				labels = append(labels, "Chat Completions")
			case "messages":
				labels = append(labels, "Messages")
			case "responses":
				labels = append(labels, "Responses")
			}
		}
	}
	return strings.Join(labels, " + ")
}

func preferredACUPayable(prices map[string]*acuCatalogPayable) *acuCatalogPayable {
	for _, protocol := range []string{"responses", "messages", "chat_completions"} {
		if price := prices[protocol]; price != nil {
			return price
		}
	}
	return nil
}

func floatMapValue(value map[string]interface{}, key string) (float64, bool) {
	number, ok := value[key].(float64)
	return number, ok
}
func optionalFloatMapValue(value map[string]interface{}, key string) *float64 {
	number, ok := floatMapValue(value, key)
	if !ok {
		return nil
	}
	return &number
}
func stringMapValue(value map[string]interface{}, key string) string {
	text, _ := value[key].(string)
	return text
}
func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func appendUniqueString(values []string, value string) []string {
	if value == "" || containsString(values, value) {
		return values
	}
	return append(values, value)
}
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
func firstNonEmptyString(values []string, fallback string) string {
	if len(values) > 0 && values[0] != "" {
		return values[0]
	}
	return fallback
}
func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func acuEndpointTypes(protocol string) []constant.EndpointType {
	result := make([]constant.EndpointType, 0, 3)
	if strings.Contains(protocol, "Chat Completions") {
		result = append(result, constant.EndpointTypeOpenAI)
	}
	if strings.Contains(protocol, "Responses") {
		result = append(result, constant.EndpointTypeOpenAIResponse)
	}
	if strings.Contains(protocol, "Messages") {
		result = append(result, constant.EndpointTypeAnthropic)
	}
	return result
}

func acuDisplayPayable(source acuPricingResponse) *acuCatalogPayable {
	if source.Payable == nil {
		return nil
	}
	protocol := strings.ToLower(strings.TrimSpace(source.Protocol))
	switch {
	case strings.Contains(protocol, "responses"):
		if payable := source.PayableByProtocol["responses"]; payable != nil {
			return payable
		}
	case strings.Contains(protocol, "messages"):
		if payable := source.PayableByProtocol["messages"]; payable != nil {
			return payable
		}
	case strings.Contains(protocol, "chat_completions"):
		if payable := source.PayableByProtocol["chat_completions"]; payable != nil {
			return payable
		}
	}
	return source.Payable
}

func overlayACUPricing(catalog *acuPricingCatalog, current []model.Pricing) []model.Pricing {
	if catalog == nil {
		return current
	}
	byName := make(map[string]model.Pricing, len(current))
	for _, item := range current {
		byName[item.ModelName] = item
	}
	auto := byName[catalog.Auto.ModelID]
	auto.ModelName = catalog.Auto.ModelID
	auto.DisplayName = catalog.Auto.DisplayName
	auto.Description = catalog.Auto.Description
	auto.PricingLabel = catalog.Auto.PricingLabel
	auto.PricingDescription = catalog.Auto.PricingDescription
	auto.BillingMode = "acu_dynamic"
	auto.QuotaType = 0
	auto.ModelRatio = 0
	auto.CompletionRatio = 0
	auto.ModelPrice = 0
	auto.PricingVersion = catalog.PricingVersion
	auto.EnableGroup = []string{"default"}
	auto.SupportedEndpointTypes = []constant.EndpointType{constant.EndpointTypeOpenAIResponse}
	result := []model.Pricing{auto}
	for _, source := range catalog.Responses {
		item := byName[source.ModelID]
		item.ModelName = source.ModelID
		item.DisplayName = source.DisplayName
		capabilities := []string{source.Role, source.Protocol}
		if source.ToolCall {
			capabilities = append(capabilities, "Tool Call")
		}
		if source.Reasoning {
			capabilities = append(capabilities, "Reasoning")
		}
		capabilities = append(capabilities, "ACU Auto", source.Status)
		item.Description = strings.Join(capabilities, " · ")
		item.Tags = strings.Join(capabilities, ",")
		// Public compatibility fields always represent the routed/payable
		// estimate. Reference pricing remains comparison metadata only and
		// must never flow back into a public ACU model's effective price.
		displayPrice := acuDisplayPayable(source)
		item.QuotaType = 0
		if displayPrice != nil {
			item.ModelRatio = displayPrice.InputCNYPerMillion / 2
			item.CompletionRatio = displayPrice.OutputCNYPerMillion / displayPrice.InputCNYPerMillion
			cachePrice := displayPrice.CachedInputCNYPerMillion
			if cachePrice != nil {
				cacheRatio := *cachePrice / displayPrice.InputCNYPerMillion
				item.CacheRatio = &cacheRatio
				item.CachedPricePerMillion = cachePrice
			}
			if displayPrice.CacheWriteCNYPerMillion != nil {
				createCacheRatio := *displayPrice.CacheWriteCNYPerMillion / displayPrice.InputCNYPerMillion
				item.CreateCacheRatio = &createCacheRatio
			}
			item.InputPricePerMillion = &displayPrice.InputCNYPerMillion
			item.OutputPricePerMillion = &displayPrice.OutputCNYPerMillion
			item.Payable = displayPrice.public()
		}
		item.PayableByProtocol = make(map[string]*model.PricingPayable, len(source.PayableByProtocol))
		for protocol, payable := range source.PayableByProtocol {
			item.PayableByProtocol[protocol] = payable.public()
		}
		item.Reference = source.Reference.public()
		item.PriceCurrency = source.CostCurrency
		item.PriceSemantics = source.CostSemantics
		item.ACUEffectiveCostStatus = source.EffectiveCostStatus
		item.ACUCurveProfile = source.CurveProfile
		item.ACUProfileConfidence = source.ProfileConfidence
		item.ACUCurve = source.Curve
		item.ACURole = source.Role
		item.ACUProtocol = source.Protocol
		item.ACUToolCall = &source.ToolCall
		item.ACUReasoning = &source.Reasoning
		item.ACUActive = &source.ActiveInAcuAuto
		item.ACUCurrentlyEligible = &source.CurrentlyEligible
		item.ACUTemporarilyUnavailableReason = source.TemporarilyUnavailableReason
		item.ACUStatus = source.Status
		item.PricingVersion = catalog.PricingVersion
		item.EnableGroup = []string{"default"}
		item.SupportedEndpointTypes = acuEndpointTypes(source.Protocol)
		result = append(result, item)
	}
	return result
}

func acuCurveStatusCounts(catalog *acuPricingCatalog) map[string]int {
	counts := map[string]int{
		"active_responses":       0,
		"active_messages":        0,
		"curve_only":             0,
		"provider_unavailable":   0,
		"responses_incompatible": 0,
		"messages_incompatible":  0,
		"preflight_failed":       0,
		"blocked":                0,
		"missing_price":          0,
	}
	if catalog == nil {
		return counts
	}
	for _, item := range catalog.CurveModelStatuses {
		for _, status := range item.Statuses {
			counts[status]++
		}
	}
	return counts
}

func sortedCurveStatuses(catalog *acuPricingCatalog) []acuCurveModelStatus {
	if catalog == nil {
		return nil
	}
	statuses := append([]acuCurveModelStatus(nil), catalog.CurveModelStatuses...)
	sort.Slice(statuses, func(i, j int) bool { return statuses[i].ModelID < statuses[j].ModelID })
	return statuses
}

func acuCurveModelIDSet(catalog *acuPricingCatalog) map[string]struct{} {
	result := make(map[string]struct{})
	if catalog == nil {
		return result
	}
	for _, item := range catalog.CurveModelStatuses {
		if modelID := strings.TrimSpace(item.ModelID); modelID != "" {
			result[modelID] = struct{}{}
		}
	}
	return result
}

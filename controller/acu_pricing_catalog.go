package controller

import (
	"os"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	jsoniter "github.com/json-iterator/go"
)

type acuPricingAuto struct {
	ModelID            string `json:"modelId"`
	DisplayName        string `json:"displayName"`
	Description        string `json:"description"`
	PricingLabel       string `json:"pricingLabel"`
	PricingDescription string `json:"pricingDescription"`
}

type acuPricingResponse struct {
	ModelID                    string   `json:"modelId"`
	Role                       string   `json:"role"`
	InputPricePerMillion       float64  `json:"inputPricePerMillion"`
	OutputPricePerMillion      float64  `json:"outputPricePerMillion"`
	CachedInputPricePerMillion float64  `json:"cachedInputPricePerMillion"`
	Protocol                   string   `json:"protocol"`
	ToolCall                   bool     `json:"toolCall"`
	Reasoning                  bool     `json:"reasoning"`
	ActiveInAcuAuto            bool     `json:"activeInAcuAuto"`
	Provider                   string   `json:"provider"`
	Status                     string   `json:"status"`
	HealthyChannelCount        int      `json:"healthyChannelCount"`
	EffectiveCostStatuses      []string `json:"effectiveCostStatuses"`
}

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
	Auto                 acuPricingAuto        `json:"auto"`
	Responses            []acuPricingResponse  `json:"responses"`
	CurveModelStatuses   []acuCurveModelStatus `json:"curveModelStatuses"`
}

func loadACUPricingCatalog() (*acuPricingCatalog, error) {
	path := strings.TrimSpace(os.Getenv("ACU_PRICING_CATALOG_FILE"))
	if path == "" {
		return nil, nil
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var catalog acuPricingCatalog
	if err := jsoniter.Unmarshal(body, &catalog); err != nil {
		return nil, err
	}
	return &catalog, nil
}

func acuEndpointTypes(protocol string) []constant.EndpointType {
	result := make([]constant.EndpointType, 0, 2)
	if strings.Contains(protocol, "Responses") {
		result = append(result, constant.EndpointTypeOpenAIResponse)
	}
	if strings.Contains(protocol, "Messages") {
		result = append(result, constant.EndpointTypeAnthropic)
	}
	return result
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
		item.Description = source.Role + " · " + source.Protocol + " · Tool Call · Reasoning · ACU Auto · " + source.Provider + " · " + source.Status
		item.Tags = strings.Join([]string{source.Role, source.Protocol, "Tool Call", "Reasoning", "ACU Auto", source.Provider, source.Status}, ",")
		item.QuotaType = 0
		item.ModelRatio = source.InputPricePerMillion / 2
		item.CompletionRatio = source.OutputPricePerMillion / source.InputPricePerMillion
		cacheRatio := source.CachedInputPricePerMillion / source.InputPricePerMillion
		item.CacheRatio = &cacheRatio
		item.InputPricePerMillion = &source.InputPricePerMillion
		item.OutputPricePerMillion = &source.OutputPricePerMillion
		item.CachedPricePerMillion = &source.CachedInputPricePerMillion
		item.ACURole = source.Role
		item.ACUProtocol = source.Protocol
		item.ACUToolCall = &source.ToolCall
		item.ACUReasoning = &source.Reasoning
		item.ACUActive = &source.ActiveInAcuAuto
		item.ACUProvider = source.Provider
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

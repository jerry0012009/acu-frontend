package dto

import "github.com/QuantumNous/new-api/common"

// Token prices use the currency of the containing price object (USD reference
// from Router, CNY payable/reference in the public pricing API).
type ACUTokenPrices struct {
	InputPricePerMillion       float64  `json:"inputPricePerMillion"`
	OutputPricePerMillion      float64  `json:"outputPricePerMillion"`
	CachedInputPricePerMillion *float64 `json:"cachedInputPricePerMillion,omitempty"`
	CacheWritePricePerMillion  *float64 `json:"cacheWritePricePerMillion,omitempty"`
}

type ACUContextTierPrices struct {
	ThresholdTokens int            `json:"thresholdTokens"`
	Standard        ACUTokenPrices `json:"standard"`
	LongContext     ACUTokenPrices `json:"longContext"`
}

func ParseACUContextTierPrices(value interface{}) *ACUContextTierPrices {
	if value == nil {
		return nil
	}
	data, err := common.Marshal(value)
	if err != nil {
		return nil
	}
	var tiers ACUContextTierPrices
	if err := common.Unmarshal(data, &tiers); err != nil || tiers.ThresholdTokens <= 0 {
		return nil
	}
	return &tiers
}

func (tiers *ACUContextTierPrices) Scale(multiplier float64) *ACUContextTierPrices {
	if tiers == nil {
		return nil
	}
	result := *tiers
	for _, price := range []*ACUTokenPrices{&result.Standard, &result.LongContext} {
		price.InputPricePerMillion *= multiplier
		price.OutputPricePerMillion *= multiplier
		if price.CachedInputPricePerMillion != nil {
			cached := *price.CachedInputPricePerMillion * multiplier
			price.CachedInputPricePerMillion = &cached
		}
		if price.CacheWritePricePerMillion != nil {
			write := *price.CacheWritePricePerMillion * multiplier
			price.CacheWritePricePerMillion = &write
		}
	}
	return &result
}

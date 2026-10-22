package service

import "fmt"

// PublicACUPricingCorridor replaces internal profile identities and forwards
// only the route fields needed by pricing. Admin monitor data stays unchanged.
func PublicACUPricingCorridor(result map[string]interface{}) error {
	notes, err := acuProfilePublicNotes()
	if err != nil {
		return err
	}
	pricing, _ := result["pricing"].(map[string]interface{})
	publicPricing := make(map[string]interface{}, len(pricing))
	for modelID, raw := range pricing {
		price, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		publicPrice := map[string]interface{}{}
		for _, field := range []string{
			"modelId", "candidateId", "payableInputPriceCnyPerMillion",
			"payableOutputPriceCnyPerMillion", "payableCachedInputPriceCnyPerMillion",
			"payableCacheWritePriceCnyPerMillion", "payableContextTiers",
			"effectiveCostStatus", "billingContextTokens", "billingContextTier",
		} {
			if value, exists := price[field]; exists {
				publicPrice[field] = value
			}
		}
		if id, ok := price["executionProfileId"].(string); ok && id != "" {
			publicPrice["executionProfileId"], _ = anonymousACUPricingRoute(id)
		}
		routes, _ := price["routes"].([]interface{})
		publicRoutes := make([]interface{}, 0, len(routes))
		for _, rawRoute := range routes {
			route, ok := rawRoute.(map[string]interface{})
			if !ok {
				continue
			}
			id, _ := route["executionProfileId"].(string)
			if id == "" {
				continue
			}
			publicID, code := anonymousACUPricingRoute(id)
			publicRoute := map[string]interface{}{
				"executionProfileId": publicID,
				"lineCode":           code,
				"displayName":        "Line " + code,
				"publicNote":         notes[id],
			}
			for _, field := range []string{
				"selected", "firstTokenLatencyMs", "firstTokenLatencySource", "firstTokenSampleCount",
			} {
				if value, exists := route[field]; exists {
					publicRoute[field] = value
				}
			}
			if payable, ok := route["payable"].(map[string]interface{}); ok {
				publicPayable := map[string]interface{}{}
				for _, field := range []string{
					"inputCnyPerMillion", "outputCnyPerMillion", "cachedInputCnyPerMillion",
					"cacheWriteCnyPerMillion", "contextTiers", "status", "pricingPolicyVersion",
				} {
					if value, exists := payable[field]; exists {
						publicPayable[field] = value
					}
				}
				publicRoute["payable"] = publicPayable
			}
			publicRoutes = append(publicRoutes, publicRoute)
		}
		publicPrice["routes"] = publicRoutes
		publicPricing[modelID] = publicPrice
	}
	result["pricing"] = publicPricing
	return nil
}

func anonymousACUPricingRoute(profileID string) (string, string) {
	// Match the existing monitor's anonymousACULineId numbering.
	var hash uint32 = 2166136261
	for _, character := range profileID {
		hash ^= uint32(character)
		hash *= 16777619
	}
	return fmt.Sprintf("line-%08x", hash), fmt.Sprintf("%04d", hash%10000)
}

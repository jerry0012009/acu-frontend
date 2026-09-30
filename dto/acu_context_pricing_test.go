package dto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestACUContextPricingScaleAndJSON(t *testing.T) {
	var input interface{}
	require.NoError(t, json.Unmarshal([]byte(`{"thresholdTokens":272000,"standard":{"inputPricePerMillion":2,"outputPricePerMillion":10,"cachedInputPricePerMillion":0.1,"cacheWritePricePerMillion":2.5},"longContext":{"inputPricePerMillion":4,"outputPricePerMillion":15,"cachedInputPricePerMillion":0.2,"cacheWritePricePerMillion":5}}`), &input))
	tiers := ParseACUContextTierPrices(input)
	require.NotNil(t, tiers)
	scaled := tiers.Scale(6.74)
	require.Equal(t, 272000, scaled.ThresholdTokens)
	require.InDelta(t, 26.96, scaled.LongContext.InputPricePerMillion, 1e-9)
	require.InDelta(t, 1.348, *scaled.LongContext.CachedInputPricePerMillion, 1e-9)
	require.Equal(t, 4.0, tiers.LongContext.InputPricePerMillion)
	require.Equal(t, 0.2, *tiers.LongContext.CachedInputPricePerMillion)
	data, err := json.Marshal(scaled)
	require.NoError(t, err)
	require.Contains(t, string(data), `"thresholdTokens":272000`)
	require.Contains(t, string(data), `"longContext"`)
	require.Nil(t, ParseACUContextTierPrices(nil))
	require.Nil(t, ParseACUContextTierPrices(map[string]interface{}{"thresholdTokens": -1}))
}

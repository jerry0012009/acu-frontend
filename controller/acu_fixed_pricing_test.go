package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestFixedRetailPriceRemainsVisibleWithoutAnEligibleSupplier(t *testing.T) {
	routing := dto.ACURoutingCatalog{CatalogVersion: "fixture", Models: []dto.ACURoutingCatalogModel{{ModelID: "fixture", Protocols: []string{"messages"}}}}
	price := map[string]interface{}{
		"modelMultiplier": "0.15", "priceVersion": "retail-v1", "currentlyEligible": false,
		"payableInputPriceCnyPerMillion": 2.1, "payableOutputPriceCnyPerMillion": 10.5,
		"effectiveCostStatus": "verified",
		"retailReference": map[string]interface{}{
			"referenceCurrency": "USD", "referenceSource": "Verified fixture", "referenceObservedAt": "2026-11-11", "fxCnyPerUsd": "7",
			"referencePrices": map[string]interface{}{"inputPricePerMillion": 2.0, "outputPricePerMillion": 10.0},
		},
	}
	catalog, err := buildLiveACUPricingCatalog(routing, map[string]map[string]interface{}{"messages": {"pricing": map[string]interface{}{"fixture": price}}})
	require.NoError(t, err)
	require.Len(t, catalog.Responses, 1)
	item := catalog.Responses[0]
	require.False(t, item.CurrentlyEligible)
	require.Equal(t, "0.15", item.Payable.ModelMultiplier)
	require.Equal(t, "retail-v1", item.Payable.PriceVersion)
	require.Equal(t, "fixed_model_multiplier", item.CostSemantics)
	require.InDelta(t, 14, item.Reference.InputCNYPerMillion, 0.000001)
	require.Equal(t, "Verified fixture", item.Reference.SourceName)
}

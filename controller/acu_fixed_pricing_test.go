package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestFixedRetailPriceRemainsVisibleWithoutAnEligibleSupplier(t *testing.T) {
	version := "retail-v1"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/internal/admin/execution-profiles/public-pricing", r.URL.Path, "price display must not call monitoring or route simulation")
		require.Equal(t, "Bearer test", r.Header.Get("Authorization"))
		catalog := acuPricingCatalog{SchemaVersion: "acu-pricing-static-v1", PricingVersion: version,
			Auto: acuPricingAuto{ModelID: "acu-auto"}, Responses: []acuPricingResponse{{
				ModelID: "fixture", CostSemantics: "fixed_model_multiplier", Status: "published_price",
				Payable:   &acuCatalogPayable{ModelMultiplier: "0.15", PriceVersion: version, InputCNYPerMillion: 2.1, OutputCNYPerMillion: 10.5},
				Reference: &acuCatalogReference{InputCNYPerMillion: 14, SourceName: "Verified fixture"},
			}}}
		encoded, err := common.Marshal(catalog)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	}))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	catalog, err := loadACUPricingCatalog(context.Background())
	require.NoError(t, err)
	require.Len(t, catalog.Responses, 1)
	item := catalog.Responses[0]
	require.False(t, item.CurrentlyEligible)
	require.Equal(t, "0.15", item.Payable.ModelMultiplier)
	require.Equal(t, "retail-v1", item.Payable.PriceVersion)
	require.Equal(t, "fixed_model_multiplier", item.CostSemantics)
	require.InDelta(t, 14, item.Reference.InputCNYPerMillion, 0.000001)
	require.Equal(t, "Verified fixture", item.Reference.SourceName)
	version = "retail-v2"
	catalog, err = loadACUPricingCatalog(context.Background())
	require.NoError(t, err)
	require.Equal(t, version, catalog.Responses[0].Payable.PriceVersion, "publication must not wait for a dynamic cache TTL")
}

func TestPublishedPricingFailureDoesNotInventLegacyPrices(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	catalog, err := loadACUPricingCatalog(context.Background())
	require.Error(t, err)
	require.Nil(t, catalog)
}

package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPublicPricingOmitsCarbonWithoutRemovingInternalCatalog(t *testing.T) {
	setupModelListControllerTestDB(t)
	model.InvalidatePricingCache()
	t.Cleanup(model.InvalidatePricingCache)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{
			"schemaVersion":"acu-pricing-static-v1","pricingVersion":"test-price-v1",
			"auto":{"modelId":"acu-auto"},
			"responses":[{"modelId":"gemini-4-carbon"},{"modelId":"gemini-4-hydrogen"}],
			"curveModelStatuses":[
				{"modelId":"gemini-4-carbon","statuses":["published_price"]},
				{"modelId":"gemini-4-hydrogen","statuses":["published_price"]}
			]}`)
	}))
	t.Cleanup(upstream.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/pricing", nil)
	GetPricing(c)
	require.Equal(t, http.StatusOK, response.Code)
	require.NotContains(t, response.Body.String(), "gemini-4-carbon")
	require.Contains(t, response.Body.String(), "gemini-4-hydrogen")
	require.Contains(t, response.Body.String(), `"published_price":1`)

	catalog, err := loadACUPricingCatalog(c.Request.Context())
	require.NoError(t, err)
	require.Contains(t, acuCurveModelIDSet(catalog), "gemini-4-carbon")
}

func TestRuntimePricingKeepsPublishedPricesWithoutCurves(t *testing.T) {
	setupModelListControllerTestDB(t)
	model.InvalidatePricingCache()
	t.Cleanup(model.InvalidatePricingCache)
	t.Setenv("ACU_PRICING_DISPLAY_MODE", "comparison")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"schemaVersion":"acu-pricing-static-v1","pricingVersion":"fixture-v1",
		  "auto":{"modelId":"acu-auto"},"responses":[
		    {"modelId":"gemini-4-carbon"},
		    {"modelId":"sample","displayName":"Sample","payable":{"inputCnyPerMillion":1,"outputCnyPerMillion":2,"cacheWriteCnyPerMillion":0},
		     "reference":{"inputCnyPerMillion":10,"outputCnyPerMillion":20,"sourceType":"official"},
		     "curve":[{"difficultyScore":10,"estimatedQuality":90}]}]}`)
	}))
	t.Cleanup(upstream.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/pricing?view=runtime", nil)
	GetPricing(c)
	require.Equal(t, http.StatusOK, response.Code)
	var result struct {
		Success bool            `json:"success"`
		Data    []model.Pricing `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.True(t, result.Success)
	require.Len(t, result.Data, 2)
	require.Equal(t, "acu-auto", result.Data[0].ModelName)
	row := result.Data[1]
	require.Equal(t, "sample", row.ModelName)
	require.Equal(t, "fixture-v1", row.PricingVersion)
	require.NotNil(t, row.Payable)
	require.Equal(t, float64(2), row.Payable.OutputCNYPerMillion)
	require.NotNil(t, row.Payable.CacheWriteCNYPerMillion)
	require.Zero(t, *row.Payable.CacheWriteCNYPerMillion)
	require.NotNil(t, row.Reference)
	require.Equal(t, "official", row.Reference.SourceType)
	require.Empty(t, row.ACUCurve)
}

func TestGetACUSelectionCorridorUsesGlobalPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{
		"ACUGlobalRoutingPolicy": `{"modelPolicy":"custom_allowlist","allowedModelIds":["gpt-5.6-sol"]}`,
	}
	var method string
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.Method
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"series":{},"defaultPreference":"balanced","pricing":{"gemini-4-carbon":{},"gemini-4-hydrogen":{}}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	request := httptest.NewRequest(http.MethodGet, "/api/pricing/acu-selection-corridor?protocol=messages", nil)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request
	GetACUSelectionCorridor(c)

	require.Equal(t, http.StatusOK, response.Code)
	require.NotContains(t, response.Body.String(), "gemini-4-carbon")
	require.Contains(t, response.Body.String(), "gemini-4-hydrogen")
	require.Equal(t, http.MethodPost, method)
	require.Contains(t, string(body), `"allowedModelIds":["gpt-5.6-sol"]`)
	require.Contains(t, string(body), `"allowedProfileIds":[]`)
	require.Contains(t, string(body), `"qualityPresets":{"balanced":20,"economy":-10,"quality":70}`)
	require.NotContains(t, string(body), `"formulaMode"`)
	require.Contains(t, string(body), `"allowedCandidateIds":[]`)
	require.Contains(t, string(body), `"gpt-5.6-sol@high":99.8`)
	require.Contains(t, string(body), `"gpt-5.6-sol@xhigh":97.5`)
	require.Contains(t, string(body), `"protocol":"messages"`)
}

func TestGetACUSelectionCorridorRejectsUnknownProtocol(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodGet, "/api/pricing/acu-selection-corridor?protocol=chat", nil)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request
	GetACUSelectionCorridor(c)
	require.Equal(t, http.StatusBadRequest, response.Code)
}

func TestGetACUSelectionCorridorAcceptsChatCompletions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{}
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"series":{},"defaultPreference":"balanced"}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	request := httptest.NewRequest(http.MethodGet, "/api/pricing/acu-selection-corridor?protocol=chat_completions", nil)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request
	GetACUSelectionCorridor(c)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, string(body), `"protocol":"chat_completions"`)
}

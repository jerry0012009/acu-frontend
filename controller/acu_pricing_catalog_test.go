package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestLoadACUPricingCatalogServesStaleDuringSingleBackgroundRefresh(t *testing.T) {
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{}

	oldCatalog := &acuPricingCatalog{SourceCatalogVersion: "old"}
	acuPricingCatalogCache.Lock()
	acuPricingCatalogCache.catalog = oldCatalog
	acuPricingCatalogCache.expiresAt = time.Now().Add(-time.Second)
	acuPricingCatalogCache.Unlock()
	t.Cleanup(func() {
		acuPricingCatalogRefreshMu.Lock()
		defer acuPricingCatalogRefreshMu.Unlock()
		acuPricingCatalogCache.Lock()
		acuPricingCatalogCache.catalog = nil
		acuPricingCatalogCache.expiresAt = time.Time{}
		acuPricingCatalogCache.Unlock()
	})

	started := make(chan struct{})
	release := make(chan struct{})
	defer func() {
		if release != nil {
			close(release)
		}
	}()
	var monitorRequests atomic.Int32
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/internal/admin/channel-monitor":
			monitorRequests.Add(1)
			close(started)
			<-release
			_, _ = w.Write([]byte(`{"catalogVersion":"new","modelPool":[{"modelId":"test-model","modelCategory":"text_agent","verificationStatus":"verified","routingEnabled":true,"protocols":["responses"],"curve":[{"difficultyScore":0,"estimatedQuality":0.9}]}],"profiles":[]}`))
		case "/internal/admin/selection-corridor":
			_, _ = w.Write([]byte(`{"pricing":{"test-model":{"payableInputPriceCnyPerMillion":1,"payableOutputPriceCnyPerMillion":2,"effectiveCostStatus":"estimated"}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	catalog, err := loadACUPricingCatalog(context.Background())
	require.NoError(t, err)
	require.Same(t, oldCatalog, catalog)
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("background refresh did not start")
	}

	var calls sync.WaitGroup
	for range 12 {
		calls.Add(1)
		go func() {
			defer calls.Done()
			got, loadErr := loadACUPricingCatalog(context.Background())
			if loadErr != nil || got != oldCatalog {
				t.Errorf("concurrent request did not receive stale catalog: %v", loadErr)
			}
		}()
	}
	done := make(chan struct{})
	go func() {
		calls.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("stale catalog requests blocked on Router")
	}
	require.Equal(t, int32(1), monitorRequests.Load())
	close(release)
	release = nil
	require.Eventually(t, func() bool {
		acuPricingCatalogCache.RLock()
		defer acuPricingCatalogCache.RUnlock()
		return acuPricingCatalogCache.catalog != nil && acuPricingCatalogCache.catalog.SourceCatalogVersion == "new"
	}, 3*time.Second, 10*time.Millisecond)
	catalog, err = loadACUPricingCatalog(context.Background())
	require.NoError(t, err)
	require.Len(t, catalog.Responses, 1)
	require.True(t, catalog.Responses[0].ActiveInAcuAuto)
	require.Len(t, catalog.Responses[0].Curve, 1)
}

func TestOverlayACUPricingUsesDynamicAutoAndCatalogPrices(t *testing.T) {
	cachePayable := 0.006
	cacheWritePayable := 0.075
	cacheReference := 0.72
	catalog := &acuPricingCatalog{
		PricingVersion: "catalog-v1",
		DisplayMode:    "comparison",
		Auto: acuPricingAuto{
			ModelID:      "acu-auto",
			DisplayName:  "ACU Auto Router",
			PricingLabel: "动态计费",
		},
		Responses: []acuPricingResponse{{
			ModelID:                                "gpt-test",
			DisplayName:                            "GPT Test",
			Role:                                   "Value",
			InputPricePerMillion:                   1,
			OutputPricePerMillion:                  6,
			CachedInputPricePerMillion:             0.1,
			EffectiveInputPriceCNYPerMillion:       0.06,
			EffectiveOutputPriceCNYPerMillion:      0.36,
			EffectiveCachedInputPriceCNYPerMillion: 0.006,
			CostCurrency:                           "CNY",
			CostSemantics:                          "estimated_user_payable_price",
			Payable: &acuCatalogPayable{
				InputCNYPerMillion: 0.06, OutputCNYPerMillion: 0.36,
				CachedInputCNYPerMillion: &cachePayable, CacheWriteCNYPerMillion: &cacheWritePayable,
				Status: "estimated", PricingPolicyVersion: "acu-retail-v1",
			},
			PayableByProtocol: map[string]*acuCatalogPayable{
				"responses": {InputCNYPerMillion: 0.06, OutputCNYPerMillion: 0.36,
					CachedInputCNYPerMillion: &cachePayable, CacheWriteCNYPerMillion: &cacheWritePayable,
					Status: "estimated", PricingPolicyVersion: "acu-retail-v1"},
				"messages": {InputCNYPerMillion: 0.12, OutputCNYPerMillion: 0.72,
					Status: "verified", PricingPolicyVersion: "acu-retail-v1"},
			},
			Reference: &acuCatalogReference{
				InputCNYPerMillion: 7.2, OutputCNYPerMillion: 43.2,
				CachedInputCNYPerMillion: &cacheReference, SourceType: "official",
				SourceName: "Vendor official pricing", ObservedAt: "2026-08-02", OriginalCurrency: "USD",
			},
			EffectiveCostStatus: "estimated",
			CurveProfile:        "efficient_fast",
			ProfileConfidence:   "low",
			Curve:               []acuCurvePoint{{DifficultyScore: 0, EstimatedQuality: 0.9, QualityLower: 0.8, QualityUpper: 1}},
			Protocol:            "Responses",
			ToolCall:            true,
			Reasoning:           true,
			ActiveInAcuAuto:     true,
			Status:              "healthy",
		}},
	}

	got := overlayACUPricing(catalog, []model.Pricing{
		{ModelName: "acu-auto", ModelRatio: 37.5, CompletionRatio: 1},
		{ModelName: "gpt-test"},
	})

	require.Len(t, got, 2)
	require.Equal(t, "acu_dynamic", got[0].BillingMode)
	require.Equal(t, "ACU Auto Router", got[0].DisplayName)
	require.Zero(t, got[0].ModelRatio)
	require.Equal(t, 0.03, got[1].ModelRatio)
	require.Equal(t, 6.0, got[1].CompletionRatio)
	require.Equal(t, 0.06, *got[1].InputPricePerMillion)
	require.Equal(t, 0.36, *got[1].OutputPricePerMillion)
	require.Equal(t, 0.006, *got[1].CachedPricePerMillion)
	require.Equal(t, 0.075/0.06, *got[1].CreateCacheRatio)
	require.Equal(t, 0.06, got[1].PayableByProtocol["responses"].InputCNYPerMillion)
	require.Equal(t, 0.12, got[1].PayableByProtocol["messages"].InputCNYPerMillion)
	require.Equal(t, 0.006, *got[1].Payable.CachedInputCNYPerMillion)
	require.Equal(t, 0.075, *got[1].PayableByProtocol["responses"].CacheWriteCNYPerMillion)
	require.Equal(t, "acu-retail-v1", got[1].Payable.PricingPolicyVersion)
	require.Equal(t, "CNY", got[1].PriceCurrency)
	require.Equal(t, "estimated_user_payable_price", got[1].PriceSemantics)
	require.Equal(t, "estimated", got[1].Payable.Status)
	require.Equal(t, "Vendor official pricing", got[1].Reference.SourceName)
	require.Len(t, got[1].ACUCurve, 1)
	require.Equal(t, "Value", got[1].ACURole)
	require.NotContains(t, got[1].Description, "CloseAI")

	body, err := common.Marshal(got[1])
	require.NoError(t, err)
	for _, privateField := range []string{"provider", "channel", "multiplier", "execution_profile"} {
		require.NotContains(t, strings.ToLower(string(body)), privateField)
	}
}

func TestBuildLiveACUPricingCatalogUsesRoutingProtocolsAndKeepsUnavailableModels(t *testing.T) {
	inputUSD := 5.0
	outputUSD := 25.0
	observedAt := "2026-09-27"
	routingCatalog := dto.ACURoutingCatalog{
		CatalogVersion:       "catalog-v1",
		PricingPolicyVersion: "retail-v1",
		Models: []dto.ACURoutingCatalogModel{
			{
				ModelID: "claude-opus-5-5", DisplayName: "Claude Opus 5.5", Vendor: "Anthropic",
				CapabilityTier: "FRONTIER", Protocols: []string{"messages"}, AutoRouteEnabled: true, ToolCallSupport: true,
				Curve:            []dto.ACURoutingCatalogCurvePoint{{DifficultyScore: 50, EstimatedQuality: 0.95, QualityLower: 0.9, QualityUpper: 0.99}},
				ReferencePricing: &dto.ACURoutingCatalogReference{InputUSDPerMillion: &inputUSD, OutputUSDPerMillion: &outputUSD, ObservedAt: &observedAt},
			},
			{ModelID: "gpt-5.6-sol", DisplayName: "GPT-5.6 Sol", Vendor: "OpenAI", Protocols: []string{"responses", "chat_completions"}},
			{ModelID: "claude-opus-4-8", DisplayName: "Claude Opus 4.8", Vendor: "Anthropic", Protocols: []string{"messages"}},
		},
	}
	corridors := map[string]map[string]interface{}{
		"responses": {"pricing": map[string]interface{}{
			"gpt-5.6-sol": map[string]interface{}{
				"payableInputPriceCnyPerMillion": 0.25, "payableOutputPriceCnyPerMillion": 1.5, "effectiveCostStatus": "estimated",
			},
		}},
		"messages": {"pricing": map[string]interface{}{
			"claude-opus-5-5": map[string]interface{}{
				"payableInputPriceCnyPerMillion": 0.4375, "payableOutputPriceCnyPerMillion": 2.1875, "effectiveCostStatus": "estimated",
			},
		}},
		"chat_completions": {"pricing": map[string]interface{}{
			"gpt-5.6-sol": map[string]interface{}{
				"payableInputPriceCnyPerMillion": 0.25, "payableOutputPriceCnyPerMillion": 1.5, "effectiveCostStatus": "estimated",
			},
		}},
	}

	catalog, err := buildLiveACUPricingCatalog(routingCatalog, corridors)
	require.NoError(t, err)
	require.Equal(t, "catalog-v1", catalog.SourceCatalogVersion)

	byID := map[string]acuPricingResponse{}
	for _, item := range catalog.Responses {
		byID[item.ModelID] = item
	}
	opus := byID["claude-opus-5-5"]
	require.Equal(t, "Messages", opus.Protocol)
	require.Contains(t, opus.PayableByProtocol, "messages")
	require.Equal(t, 33.7, opus.Reference.InputCNYPerMillion)
	require.Len(t, opus.Curve, 1)

	gpt := byID["gpt-5.6-sol"]
	require.Equal(t, "Chat Completions + Responses", gpt.Protocol)
	require.NotContains(t, gpt.PayableByProtocol, "messages")
	require.Contains(t, gpt.PayableByProtocol, "responses")
	require.Contains(t, gpt.PayableByProtocol, "chat_completions")

	unavailable := byID["claude-opus-4-8"]
	require.False(t, unavailable.CurrentlyEligible)
	require.Equal(t, "temporarily_unavailable", unavailable.Status)
	require.NotNil(t, unavailable.TemporarilyUnavailableReason)
}

func TestCatalogCamelCasePricesProduceSerializablePublicPricing(t *testing.T) {
	var catalog acuPricingCatalog
	require.NoError(t, json.Unmarshal([]byte(`{
		"displayMode":"comparison",
		"auto":{"modelId":"acu-auto"},
		"responses":[{
			"modelId":"claude-test","protocol":"Messages","costCurrency":"CNY",
			"payable":{"inputCnyPerMillion":0.12,"outputCnyPerMillion":0.6,"cachedInputCnyPerMillion":0.12,"status":"estimated","pricingPolicyVersion":"retail-v1"},
			"reference":{"inputCnyPerMillion":21.6,"outputCnyPerMillion":108,"sourceType":"official","sourceName":"Anthropic official pricing","observedAt":"2026-08-02","originalCurrency":"USD","fxCnyPerUsd":7.2}
		}]
	}`), &catalog))

	got := overlayACUPricing(&catalog, nil)
	require.Len(t, got, 2)
	require.Equal(t, 5.0, got[1].CompletionRatio)
	require.Equal(t, 0.12, got[1].Payable.InputCNYPerMillion)
	require.Equal(t, 21.6, got[1].Reference.InputCNYPerMillion)
	_, err := json.Marshal(got)
	require.NoError(t, err)
}

func TestOverlayACUPricingReferenceOnlyKeepsPayableAsPublicPrimaryPrice(t *testing.T) {
	catalog := &acuPricingCatalog{
		DisplayMode: "reference_only",
		Auto:        acuPricingAuto{ModelID: "acu-auto"},
		Responses: []acuPricingResponse{{
			ModelID: "gpt-test", Protocol: "Responses", CostCurrency: "CNY",
			Payable:   &acuCatalogPayable{InputCNYPerMillion: 1, OutputCNYPerMillion: 2},
			Reference: &acuCatalogReference{InputCNYPerMillion: 7.2, OutputCNYPerMillion: 14.4},
		}},
	}

	got := overlayACUPricing(catalog, nil)
	require.Len(t, got, 2)
	require.Equal(t, 1.0, *got[1].InputPricePerMillion)
	require.Equal(t, 2.0, *got[1].OutputPricePerMillion)
	require.Equal(t, 1.0, got[1].Payable.InputCNYPerMillion)
	require.Equal(t, 7.2, got[1].Reference.InputCNYPerMillion)

	catalog.Responses[0].Reference = nil
	withoutReference := overlayACUPricing(catalog, nil)
	require.Len(t, withoutReference, 2)
	require.Nil(t, withoutReference[1].Reference)
	require.Equal(t, 1.0, withoutReference[1].Payable.InputCNYPerMillion)
}

func TestOverlayACUPricingDoesNotInventMissingCachePrice(t *testing.T) {
	catalog := &acuPricingCatalog{
		Auto: acuPricingAuto{ModelID: "acu-auto"},
		Responses: []acuPricingResponse{{
			ModelID:  "gpt-cache-test",
			Protocol: "Responses",
			Payable:  &acuCatalogPayable{InputCNYPerMillion: 1, OutputCNYPerMillion: 2},
			PayableByProtocol: map[string]*acuCatalogPayable{
				"responses": {
					InputCNYPerMillion: 1, OutputCNYPerMillion: 2,
					CachedInputCNYPerMillion: nil,
					Status:                   "incomplete",
				},
			},
		}},
	}

	got := overlayACUPricing(catalog, nil)
	require.Len(t, got, 2)
	require.Nil(t, got[1].Payable.CachedInputCNYPerMillion)
	require.Nil(t, got[1].CachedPricePerMillion)
	require.Nil(t, got[1].CacheRatio)
	require.Equal(t, "incomplete", got[1].Payable.Status)
}

func TestACUCurveStatusCountsIncludesEmptyCategories(t *testing.T) {
	counts := acuCurveStatusCounts(&acuPricingCatalog{
		CurveModelStatuses: []acuCurveModelStatus{{
			ModelID:  "gpt-test",
			Statuses: []string{"active_responses"},
		}},
	})

	require.Equal(t, 1, counts["active_responses"])
	require.Equal(t, 0, counts["messages_incompatible"])
	require.Equal(t, 0, counts["preflight_failed"])
}

func TestACUCurveCostStatusesRemainVisible(t *testing.T) {
	statuses := sortedCurveStatuses(&acuPricingCatalog{CurveModelStatuses: []acuCurveModelStatus{{
		ModelID: "gpt-test", EffectiveCostStatuses: []string{"estimated", "verified"},
	}}})

	require.Equal(t, []string{"estimated", "verified"}, statuses[0].EffectiveCostStatuses)
}

func TestACUCurveModelIDSetContainsOnlyCatalogCurves(t *testing.T) {
	set := acuCurveModelIDSet(&acuPricingCatalog{CurveModelStatuses: []acuCurveModelStatus{
		{ModelID: "gpt-5.6-luna", Statuses: []string{"active_responses"}},
		{ModelID: " qwen3.7-max ", Statuses: []string{"preflight_failed"}},
	}})
	require.Equal(t, map[string]struct{}{"gpt-5.6-luna": {}, "qwen3.7-max": {}}, set)
}

func TestOverlayACUPricingPreservesNativeACUProtocols(t *testing.T) {
	catalog := &acuPricingCatalog{
		Auto: acuPricingAuto{ModelID: "acu-auto"},
		Responses: []acuPricingResponse{
			{ModelID: "claude-test", Protocol: "Messages", Payable: &acuCatalogPayable{InputCNYPerMillion: 1, OutputCNYPerMillion: 2}},
			{ModelID: "dual-test", Protocol: "Messages + Responses", Payable: &acuCatalogPayable{InputCNYPerMillion: 1, OutputCNYPerMillion: 2}},
		},
	}

	got := overlayACUPricing(catalog, nil)
	require.Equal(t, []string{"acu-auto", "claude-test", "dual-test"}, []string{
		got[0].ModelName, got[1].ModelName, got[2].ModelName,
	})
	require.Equal(t, []constant.EndpointType{constant.EndpointTypeAnthropic}, got[1].SupportedEndpointTypes)
	require.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAIResponse, constant.EndpointTypeAnthropic,
	}, got[2].SupportedEndpointTypes)
}
